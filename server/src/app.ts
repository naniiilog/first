import type { Db } from './db.js';
import { ensureSchema } from './db.js';
import { Auth, MAX_PASSWORD, MIN_PASSWORD } from './auth.js';
import { handleAgentHttp } from './agentHttp.js';
import { imageFrom, isError, quietState } from './agent.js';
import { handleMcp } from './mcp.js';
import { findSecret, secretMessage } from './safety.js';
import { MAX_TEXT, OWNER_ID, publicMember, publicMessage, Rooms } from './rooms.js';
import { cleanReset, windowEnd } from './usage.js';
import { NOTIFY_MODES, notifyBotMessage, sendTest, vapid } from './push.js';

/**
 * 다봇 서버 (Node와 Cloudflare Worker가 같이 써요)
 *
 * 방장(휴대폰 앱)용 API — Authorization: Bearer <ownerToken>
 *   (모든 /api 요청에 x-app-token: <앱 비밀번호>)
 *   GET    /api/auth                                             → { passwordSet, ok }
 *   POST   /api/auth/setup                    { password }        처음 한 번 비밀번호 정하기
 *   POST   /api/auth/change                   { password }        비밀번호 바꾸기
 *   POST   /api/rooms                         { name }            → { room, ownerToken }
 *   GET    /api/rooms/:id                                         → { room, members }
 *   PATCH  /api/rooms/:id                     { name?, freeTalk?, closed? }
 *   DELETE /api/rooms/:id
 *   GET    /api/rooms/:id/messages?after=ID                       → { messages }
 *   POST   /api/rooms/:id/messages            { text, authorName }
 *   POST   /api/rooms/:id/members             { kind, name }      → { member, inviteUrl }
 *   GET    /api/rooms/:id/members/:mid/invite                     → { inviteUrl }
 *   PATCH  /api/rooms/:id/members/:mid        { name?, active?, avatar?, exhausted? }
 *   POST   /api/rooms/:id/members/:mid/reset-usage           사용량 지금 0으로
 *   GET    /api/rooms/:id/usage                              봇 사용량
 *   DELETE /api/rooms/:id/members/:mid
 *   GET    /api/push/key                                     알림 공개 열쇠
 *   POST/DELETE/GET /api/rooms/:id/push                       이 기기 알림 구독
 *   POST   /api/rooms/:id/push/test                          시험 알림
 *
 * AI 에이전트용 MCP 입구 — 초대 링크 자체가 열쇠예요
 *   POST   /mcp/:inviteToken
 *
 * 커넥터가 없는 에이전트용 HTTP 입구(연결 문구) — 헤더 X-Dabot-Key: <초대토큰> 또는 /a/<초대토큰>/...
 *   GET /a/info · GET /a/messages?since= · GET /a/wait?since=&timeout= · POST /a/send · POST /a/image · GET /a/image/:id
 */

export type Env = Record<string, unknown>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': '*',
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });

const withCors = (res: Response) => {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 429일 때 몇 초 뒤에 다시 시도하면 되는지 */
    readonly retryAfter?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

// 같은 서버 인스턴스 안에서만 세는 간단한 분당 제한(장난 방지용).
// 넘으면 429와 함께 몇 초 기다리면 되는지(Retry-After)를 알려줘요.
const hits = new Map<string, number[]>();
function checkRate(key: string, perMinute: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) {
    const retryAfter = Math.max(1, Math.ceil((recent[0] + 60_000 - now) / 1000));
    throw new HttpError(429, `요청이 너무 많아요. ${retryAfter}초 뒤에 다시 해 주세요.`, retryAfter, 'rate_limited');
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
}

async function body(req: Request): Promise<any> {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) throw new HttpError(413, '요청이 너무 커요.');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'JSON 형식이 아니에요.');
  }
}

/** 프로필 사진·채팅 사진(data URL)도 받을 수 있게 넉넉히 */
const MAX_BODY_CHARS = 1_000_000;
const MAX_AVATAR_CHARS = 100_000;

/** 프로필 값 검사: null(기본), 'emoji:<이모지>:#rrggbb', 또는 작은 data:image 사진 */
/** 고를 수 있는 확인 간격(분, 0은 실시간) */
const INTERVALS = [0, 1, 5, 10, 15, 20, 30, 40, 60, 120];

/** 같은 AI 봇을 또 초대할 때 차례로 쓰는 아이콘 배경색(앱의 ICON_BG_COLORS와 같은 색) */
const SAME_KIND_COLORS = ['#D0EBFF', '#FFE8CC', '#D3F9D8', '#E5DBFF', '#FFE3E3', '#FFF3BF', '#C5F6FA', '#FCC2D7'];

function cleanAvatar(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  if (/^emoji:[^:]{1,16}:#[0-9a-fA-F]{6}$/.test(v)) return v;
  // 기본 앱 아이콘 + 배경색(같은 봇이 여럿일 때 구분용)
  if (/^icon:#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_AVATAR_CHARS) return v;
  throw new HttpError(400, '프로필 이미지가 너무 크거나 형식이 맞지 않아요.');
}

/** 채팅 사진: data:image/(png|jpeg|webp);base64,... (MAX_IMAGE_BYTES 이하) */
function cleanChatImage(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const m = typeof v === 'string' ? v.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/) : null;
  if (!m) throw new HttpError(400, '사진 형식이 맞지 않아요.');
  const img = imageFrom(m[2], m[1]);
  if (isError(img)) throw new HttpError(400, img.message);
  return img;
}

function cleanPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < MIN_PASSWORD || v.length > MAX_PASSWORD) {
    throw new HttpError(400, `비밀번호는 ${MIN_PASSWORD}~${MAX_PASSWORD}자로 정해 주세요.`);
  }
  return v;
}

async function shortHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf).slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
}

const cleanName = (v: unknown, max = 30) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function handle(req: Request, env: Env, db: Db, clientIp: string, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/health') return json(200, { ok: true });

    await ensureSchema(db);
    const rooms = new Rooms(db);
    // 봇이 말하면 방장 휴대폰으로 알림(응답을 늦추지 않게 뒤에서 보내요)
    rooms.notifier = (room, msg) => {
      const job = notifyBotMessage(db, room, msg, url.origin).catch((e) => console.error('[push]', e));
      if (waitUntil) waitUntil(job);
    };

    // ── AI 에이전트 입구 ──
    if (parts[0] === 'mcp' && parts[1]) {
      checkRate(`mcp:${parts[1]}`, Number(env.MCP_RATE_PER_MINUTE ?? 60));
      return withCors(await handleMcp(req, rooms, parts[1]));
    }

    // ── 연결 문구용 입구(MCP 커넥터가 없는 에이전트) ──
    if (parts[0] === 'a') {
      const key = req.headers.get('x-dabot-key') ?? '';
      const r = await handleAgentHttp(req, url, parts, key, rooms, (k, n) => checkRate(k, n));
      return withCors(r);
    }

    if (parts[0] !== 'api') throw new HttpError(404, 'Not found');

    // ── 앱 비밀번호 ──
    const auth = new Auth(db, typeof env.APP_TOKEN === 'string' ? env.APP_TOKEN.trim() : '');
    const given = req.headers.get('x-app-token');
    if (parts[1] === 'auth') {
      // 비밀번호 확인: { passwordSet, ok }
      if (!parts[2] && req.method === 'GET') {
        const passwordSet = await auth.isSet();
        const ok = passwordSet && (await auth.check(given));
        if (passwordSet && given && !ok) checkRate(`authfail:${clientIp}`, 10);
        return json(200, { passwordSet, ok });
      }
      // 처음 한 번 비밀번호 정하기
      if (parts[2] === 'setup' && req.method === 'POST') {
        checkRate(`setup:${clientIp}`, 10);
        if (await auth.isSet()) throw new HttpError(409, '이미 비밀번호가 정해져 있어요.');
        const password = cleanPassword((await body(req)).password);
        await auth.set(password);
        return json(200, { ok: true });
      }
      // 비밀번호 바꾸기 (지금 비밀번호가 맞아야 해요)
      if (parts[2] === 'change' && req.method === 'POST') {
        if (!(await auth.check(given))) {
          checkRate(`authfail:${clientIp}`, 10);
          throw new HttpError(401, '지금 비밀번호가 맞지 않아요.');
        }
        if (typeof env.APP_TOKEN === 'string' && env.APP_TOKEN.trim()) throw new HttpError(400, '서버 설정(APP_TOKEN)으로 정한 비밀번호는 앱에서 바꿀 수 없어요.');
        await auth.set(cleanPassword((await body(req)).password));
        return json(200, { ok: true });
      }
      throw new HttpError(404, 'Not found');
    }

    // 여기부터는 비밀번호가 맞아야 써요.
    if (!(await auth.isSet())) throw new HttpError(401, '앱 비밀번호를 먼저 정해 주세요.');
    if (!(await auth.check(given))) {
      checkRate(`authfail:${clientIp}`, 10);
      throw new HttpError(401, '앱 비밀번호가 맞지 않아요.');
    }

    // 알림 구독에 쓸 공개 열쇠
    if (parts[1] === 'push' && parts[2] === 'key' && req.method === 'GET') {
      return json(200, { publicKey: (await vapid(db)).publicKey });
    }

    if (parts[1] !== 'rooms') throw new HttpError(404, 'Not found');

    // ── 방 만들기 ──
    if (parts.length === 2 && req.method === 'POST') {
      // 방 개수 제한은 없어요. 아주 빠른 반복(스크립트 장난)만 막아요.
      checkRate(`create:${clientIp}`, Number(env.CREATE_RATE_PER_MINUTE ?? 120));
      const b = await body(req);
      const room = await rooms.createRoom(cleanName(b.name, 40) || '새 채팅방');
      return json(200, { room: { id: room.id, name: room.name }, ownerToken: room.owner_token });
    }

    // ── 이하 방장 전용 ──
    const room = parts[2] ? await rooms.room(parts[2]) : null;
    if (!room) throw new HttpError(404, '방을 찾을 수 없어요.');
    if (req.headers.get('authorization') !== `Bearer ${room.owner_token}`) throw new HttpError(403, '이 방의 방장이 아니에요.');
    // 멤버(초대) 수 제한은 없어요. 앱이 방을 2초마다 새로고침하는 정도는 넉넉히 들어가요.
    checkRate(`owner:${room.id}`, Number(env.OWNER_RATE_PER_MINUTE ?? 1200));

    const sub = parts[3];
    if (!sub) {
      if (req.method === 'GET') {
        const members = await rooms.members(room.id);
        const payload = JSON.stringify({
          room: {
            id: room.id,
            name: room.name,
            freeTalk: room.free_talk === 1,
            closed: room.closed === 1,
            checkIntervalMin: room.check_interval_min,
            quietEnabled: room.quiet_enabled === 1,
            quietStart: room.quiet_start,
            quietEnd: room.quiet_end,
            tz: room.tz,
            quietNow: quietState(room).quiet,
            waitMode: room.wait_mode || 'stay',
            notifyMode: room.notify_mode || 'off',
            notifySilent: room.notify_silent === 1,
          },
          // 방장만 보는 목록이라 초대 링크도 같이 줘요(누르면 바로 보이게).
          // online: 최근 90초 안에 방을 확인한 봇(= 지금 대화 중) → 앱에서 초록불이 깜빡여요.
          members: members.map((m) => ({
            ...publicMember(m),
            online: m.last_seen !== null && Date.now() - m.last_seen < 90_000,
            inviteUrl: `${url.origin}/mcp/${m.invite_token}`,
          })),
        });
        // 바뀐 게 없으면 304만 보내서(프로필 사진 등을 다시 안 보내서) 빨라요.
        const etag = `"${await shortHash(payload)}"`;
        if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ...CORS, ETag: etag } });
        return new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ETag: etag } });
      }
      if (req.method === 'PATCH') {
        const b = await body(req);
        const name = cleanName(b.name, 40);
        if (name) await rooms.renameRoom(room.id, name);
        // 확인 간격(분)과 매너타임
        const hour = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : undefined);
        const sched = {
          checkIntervalMin: typeof b.checkIntervalMin === 'number' && INTERVALS.includes(b.checkIntervalMin) ? b.checkIntervalMin : undefined,
          quietEnabled: typeof b.quietEnabled === 'boolean' ? b.quietEnabled : undefined,
          quietStart: hour(b.quietStart),
          quietEnd: hour(b.quietEnd),
          tz: typeof b.tz === 'string' && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(b.tz) ? b.tz : undefined,
          waitMode: b.waitMode === 'stay' || b.waitMode === 'away' ? b.waitMode : undefined,
        };
        if (Object.values(sched).some((v) => v !== undefined)) await rooms.setSchedule(room, sched);
        // 휴대폰 알림 설정
        const notifyMode = typeof b.notifyMode === 'string' && (NOTIFY_MODES as string[]).includes(b.notifyMode) ? b.notifyMode : undefined;
        const notifySilent = typeof b.notifySilent === 'boolean' ? b.notifySilent : undefined;
        const notifyName = typeof b.notifyName === 'string' ? cleanName(b.notifyName) : undefined;
        if (notifyMode !== undefined || notifySilent !== undefined || notifyName !== undefined) {
          await rooms.setNotify(room.id, { mode: notifyMode, silent: notifySilent, name: notifyName });
        }
        if (typeof b.freeTalk === 'boolean') await rooms.setFreeTalk(room, b.freeTalk);
        if (typeof b.closed === 'boolean') await rooms.setClosed(room, b.closed);
        return json(200, { ok: true });
      }
      if (req.method === 'DELETE') {
        await rooms.deleteRoom(room.id);
        return json(200, { ok: true });
      }
    }

    // 봇 사용량 대시보드: 이번 주기 사용량, 다음 초기화 시각, 누적 메시지 수
    if (sub === 'usage' && req.method === 'GET') {
      const [members, counts] = await Promise.all([rooms.members(room.id), rooms.messageCounts(room.id)]);
      const now = Date.now();
      const tz = room.tz || 'Asia/Seoul';
      const total = new Map(counts.map((c) => [c.author_id, c.n]));
      return json(200, {
        now,
        tz,
        members: members.map((m) => {
          const end = m.use_start === null ? null : windowEnd(m.use_start, m.reset_mode, m.reset_value, tz);
          const live = end !== null && now < end;
          return {
            ...publicMember(m),
            online: m.last_seen !== null && now - m.last_seen < 90_000,
            lastSeen: m.last_seen,
            totalMessages: total.get(m.id) ?? 0,
            reset: { mode: m.reset_mode, value: m.reset_value },
            usage: {
              since: live ? m.use_start : null,
              // 주기가 끝났으면 0이에요. 매일 방식은 다음 초기화 시각을 미리 알려줘요.
              resetAt: live ? end : m.reset_mode === 'daily' ? windowEnd(now, 'daily', m.reset_value, tz) : null,
              calls: live ? m.use_calls : 0,
              sent: live ? m.use_sent : 0,
              inChars: live ? m.use_in : 0,
              outChars: live ? m.use_out : 0,
            },
          };
        }),
      });
    }

    // 이 기기 알림 구독: POST {subscription}, DELETE {endpoint}, GET ?endpoint= (구독돼 있나), POST /push/test
    if (sub === 'push') {
      if (parts[4] === 'test' && req.method === 'POST') return json(200, await sendTest(db, room, url.origin));
      if (req.method === 'GET') {
        const endpoint = url.searchParams.get('endpoint') ?? '';
        return json(200, { subscribed: endpoint ? await rooms.hasPushSub(room.id, endpoint) : false });
      }
      const b = await body(req);
      if (req.method === 'POST') {
        const s = b.subscription;
        const ok =
          s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 &&
          typeof s.keys?.p256dh === 'string' && s.keys.p256dh.length < 200 && typeof s.keys?.auth === 'string' && s.keys.auth.length < 100;
        if (!ok) throw new HttpError(400, '알림 구독 정보가 올바르지 않아요.');
        await rooms.addPushSub(room.id, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth });
        return json(200, { ok: true });
      }
      if (req.method === 'DELETE') {
        if (typeof b.endpoint === 'string') await rooms.removePushSub(room.id, b.endpoint);
        return json(200, { ok: true });
      }
    }

    if (sub === 'messages') {
      if (req.method === 'GET') {
        const after = url.searchParams.get('after');
        // 방 화면이 새 글을 확인하는 중이면 '방장이 보고 있음'(알림 안 보내요)
        if (after) await rooms.ownerSeen(room);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? (after ? 200 : 100)) || 100));
        const rows = await rooms.messages(room.id, after ? Number(after) : null, limit);
        return json(200, { messages: rows.map(publicMessage) });
      }
      if (req.method === 'POST') {
        const b = await body(req);
        const text = typeof b.text === 'string' ? b.text.trim() : '';
        const image = cleanChatImage(b.image);
        if ((!text && !image) || text.length > MAX_TEXT) throw new HttpError(400, `메시지는 1~${MAX_TEXT}자로 써주세요.`);
        const secret = findSecret(text);
        if (secret) throw new HttpError(400, secretMessage(secret), undefined, 'secret');
        let replyTo = typeof b.replyTo === 'number' ? b.replyTo : null;
        if (replyTo !== null && !(await rooms.message(room.id, replyTo))) replyTo = null;
        const id = await rooms.post(room.id, OWNER_ID, cleanName(b.authorName) || '방장', text, { replyTo, image });
        return json(200, { id });
      }
    }

    if (sub === 'members') {
      const inviteUrl = (token: string) => `${url.origin}/mcp/${token}`;
      if (!parts[4] && req.method === 'POST') {
        const b = await body(req);
        const kind = cleanName(b.kind, 20) || 'other';
        const name = cleanName(b.name) || cleanName(b.defaultName) || 'AI';
        const same = (await rooms.members(room.id)).filter((x) => x.kind === kind).length;
        const m = await rooms.addMember(room.id, kind, name);
        // 같은 AI 봇이 이미 있으면 아이콘 배경색을 다르게 줘서 바로 구분돼요(나중에 프로필에서 바꿀 수 있어요).
        if (same > 0) {
          const avatar = `icon:${SAME_KIND_COLORS[(same - 1) % SAME_KIND_COLORS.length]}`;
          await rooms.updateMember(m, { avatar });
          m.avatar = avatar;
        }
        return json(200, { member: publicMember(m), inviteUrl: inviteUrl(m.invite_token) });
      }
      const m = parts[4] ? await rooms.member(room.id, parts[4]) : null;
      if (!m) throw new HttpError(404, '멤버를 찾을 수 없어요.');
      if (parts[5] === 'invite' && req.method === 'GET') return json(200, { inviteUrl: inviteUrl(m.invite_token) });
      if (parts[5] === 'reset-usage' && req.method === 'POST') {
        await rooms.clearUsage(m.id);
        return json(200, { ok: true });
      }
      if (req.method === 'PATCH') {
        const b = await body(req);
        await rooms.updateMember(m, {
          name: cleanName(b.name) || undefined,
          active: typeof b.active === 'boolean' ? b.active : undefined,
          avatar: cleanAvatar(b.avatar),
          exhausted: typeof b.exhausted === 'boolean' ? b.exhausted : undefined,
          // 이 봇만의 확인 간격(null이면 방 설정 따르기)
          checkIntervalMin: b.checkIntervalMin === null ? null : typeof b.checkIntervalMin === 'number' && INTERVALS.includes(b.checkIntervalMin) ? b.checkIntervalMin : undefined,
        });
        const reset = cleanReset(b.resetMode, b.resetValue);
        if (reset) await rooms.setReset(m.id, reset.mode, reset.value);
        return json(200, { ok: true });
      }
      if (req.method === 'DELETE') {
        await rooms.removeMember(m);
        return json(200, { ok: true });
      }
    }

    throw new HttpError(404, 'Not found');
  } catch (err) {
    if (err instanceof HttpError) {
      return json(
        err.status,
        { ok: false, error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.retryAfter ? { retry_after: err.retryAfter } : {}) },
        err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {},
      );
    }
    console.error(err);
    return json(500, { error: '서버 오류가 났어요.' });
  }
}
