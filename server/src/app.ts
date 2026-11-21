import type { Db } from './db.js';
import { ensureSchema } from './db.js';
import { Auth, MAX_PASSWORD, MIN_PASSWORD } from './auth.js';
import { handleMcp } from './mcp.js';
import { MAX_TEXT, OWNER_ID, publicMember, publicMessage, Rooms } from './rooms.js';

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
 *   PATCH  /api/rooms/:id/members/:mid        { name?, active?, avatar? }
 *   DELETE /api/rooms/:id/members/:mid
 *
 * AI 에이전트용 MCP 입구 — 초대 링크 자체가 열쇠예요
 *   POST   /mcp/:inviteToken
 */

export type Env = Record<string, unknown>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': '*',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

const withCors = (res: Response) => {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// 같은 서버 인스턴스 안에서만 세는 간단한 분당 제한(장난 방지용).
const hits = new Map<string, number[]>();
function checkRate(key: string, perMinute: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  if (recent.length > perMinute) throw new HttpError(429, '요청이 너무 많아요. 잠시 쉬었다가 해 주세요.');
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

/** 프로필 사진(작게 줄인 data URL)도 받을 수 있게 넉넉히 */
const MAX_BODY_CHARS = 120_000;
const MAX_AVATAR_CHARS = 100_000;

/** 프로필 값 검사: null(기본), 'emoji:<이모지>:#rrggbb', 또는 작은 data:image 사진 */
function cleanAvatar(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  if (/^emoji:[^:]{1,16}:#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_AVATAR_CHARS) return v;
  throw new HttpError(400, '프로필 이미지가 너무 크거나 형식이 맞지 않아요.');
}

function cleanPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < MIN_PASSWORD || v.length > MAX_PASSWORD) {
    throw new HttpError(400, `비밀번호는 ${MIN_PASSWORD}~${MAX_PASSWORD}자로 정해 주세요.`);
  }
  return v;
}

const cleanName = (v: unknown, max = 30) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function handle(req: Request, env: Env, db: Db, clientIp: string): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/health') return json(200, { ok: true });

    await ensureSchema(db);
    const rooms = new Rooms(db);

    // ── AI 에이전트 입구 ──
    if (parts[0] === 'mcp' && parts[1]) {
      checkRate(`mcp:${parts[1]}`, Number(env.MCP_RATE_PER_MINUTE ?? 60));
      return withCors(await handleMcp(req, rooms, parts[1]));
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
        return json(200, {
          room: { id: room.id, name: room.name, freeTalk: room.free_talk === 1, closed: room.closed === 1 },
          members: members.map(publicMember),
        });
      }
      if (req.method === 'PATCH') {
        const b = await body(req);
        const name = cleanName(b.name, 40);
        if (name) await rooms.renameRoom(room.id, name);
        if (typeof b.freeTalk === 'boolean') await rooms.setFreeTalk(room, b.freeTalk);
        if (typeof b.closed === 'boolean') await rooms.setClosed(room, b.closed);
        return json(200, { ok: true });
      }
      if (req.method === 'DELETE') {
        await rooms.deleteRoom(room.id);
        return json(200, { ok: true });
      }
    }

    if (sub === 'messages') {
      if (req.method === 'GET') {
        const after = url.searchParams.get('after');
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? (after ? 200 : 100)) || 100));
        const rows = await rooms.messages(room.id, after ? Number(after) : null, limit);
        return json(200, { messages: rows.map(publicMessage) });
      }
      if (req.method === 'POST') {
        const b = await body(req);
        const text = typeof b.text === 'string' ? b.text.trim() : '';
        if (!text || text.length > MAX_TEXT) throw new HttpError(400, `메시지는 1~${MAX_TEXT}자로 써주세요.`);
        const id = await rooms.post(room.id, OWNER_ID, cleanName(b.authorName) || '방장', text);
        return json(200, { id });
      }
    }

    if (sub === 'members') {
      const inviteUrl = (token: string) => `${url.origin}/mcp/${token}`;
      if (!parts[4] && req.method === 'POST') {
        const b = await body(req);
        const kind = cleanName(b.kind, 20) || 'other';
        const name = cleanName(b.name) || cleanName(b.defaultName) || 'AI';
        const m = await rooms.addMember(room.id, kind, name);
        return json(200, { member: publicMember(m), inviteUrl: inviteUrl(m.invite_token) });
      }
      const m = parts[4] ? await rooms.member(room.id, parts[4]) : null;
      if (!m) throw new HttpError(404, '멤버를 찾을 수 없어요.');
      if (parts[5] === 'invite' && req.method === 'GET') return json(200, { inviteUrl: inviteUrl(m.invite_token) });
      if (req.method === 'PATCH') {
        const b = await body(req);
        await rooms.updateMember(m, {
          name: cleanName(b.name) || undefined,
          active: typeof b.active === 'boolean' ? b.active : undefined,
          avatar: cleanAvatar(b.avatar),
        });
        return json(200, { ok: true });
      }
      if (req.method === 'DELETE') {
        await rooms.removeMember(m);
        return json(200, { ok: true });
      }
    }

    throw new HttpError(404, 'Not found');
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: '서버 오류가 났어요.' });
  }
}
