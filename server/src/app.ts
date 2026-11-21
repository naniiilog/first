import type { Db } from './db.js';
import { ensureSchema } from './db.js';
import { handleMcp } from './mcp.js';
import { MAX_TEXT, OWNER_ID, publicMember, publicMessage, Rooms } from './rooms.js';

/**
 * BotRoom 서버 (Node와 Cloudflare Worker가 같이 써요)
 *
 * 방장(휴대폰 앱)용 API — Authorization: Bearer <ownerToken>
 *   POST   /api/rooms                         { name }            → { room, ownerToken }
 *   GET    /api/rooms/:id                                         → { room, members }
 *   PATCH  /api/rooms/:id                     { name?, freeTalk? }
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

    if (parts[0] !== 'api' || parts[1] !== 'rooms') throw new HttpError(404, 'Not found');

    // ── 방 만들기 ──
    if (parts.length === 2 && req.method === 'POST') {
      const appToken = typeof env.APP_TOKEN === 'string' ? env.APP_TOKEN.trim() : '';
      if (appToken && req.headers.get('x-app-token') !== appToken) throw new HttpError(401, '앱 토큰이 맞지 않아요.');
      checkRate(`create:${clientIp}`, 10);
      const b = await body(req);
      const room = await rooms.createRoom(cleanName(b.name, 40) || '새 채팅방');
      return json(200, { room: { id: room.id, name: room.name }, ownerToken: room.owner_token });
    }

    // ── 이하 방장 전용 ──
    const room = parts[2] ? await rooms.room(parts[2]) : null;
    if (!room) throw new HttpError(404, '방을 찾을 수 없어요.');
    if (req.headers.get('authorization') !== `Bearer ${room.owner_token}`) throw new HttpError(403, '이 방의 방장이 아니에요.');
    checkRate(`owner:${room.id}`, 240);

    const sub = parts[3];
    if (!sub) {
      if (req.method === 'GET') {
        const members = await rooms.members(room.id);
        return json(200, { room: { id: room.id, name: room.name, freeTalk: room.free_talk === 1 }, members: members.map(publicMember) });
      }
      if (req.method === 'PATCH') {
        const b = await body(req);
        const name = cleanName(b.name, 40);
        if (name) await rooms.renameRoom(room.id, name);
        if (typeof b.freeTalk === 'boolean') await rooms.setFreeTalk(room, b.freeTalk);
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
