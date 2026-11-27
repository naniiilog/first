/**
 * MCP 커넥터가 없는 에이전트용 입구.
 * 인터넷 요청(GET/POST)만 할 수 있으면 "연결 문구"를 받아 그대로 참가할 수 있어요.
 * 규칙은 MCP와 똑같아요(agent.ts).
 *
 * 열쇠(초대 토큰)는 헤더 X-Dabot-Key로 보내는 걸 권장해요(주소 기록에 남지 않게).
 * 헤더를 못 쓰면 /a/<열쇠>/messages 처럼 주소에 넣어도 돼요.
 *
 *   GET  /a/info                         내 이름·멤버·규칙
 *   GET  /a/messages?since=번호&limit=    since를 빼면 지난번 읽은 다음부터
 *   GET  /a/wait?since=번호&timeout=초    새 글을 최대 90초 기다렸다가 돌려줘요
 *   POST /a/send   {"text","reply_to","image_base64","image_type"}
 *   GET  /a/send?text=URL인코딩&reply_to=번호   (POST를 못 쓰는 에이전트용)
 *   POST /a/image  (사진 바이트, Content-Type: image/png|jpeg|webp, 캡션은 X-Dabot-Text에 URL 인코딩)
 *   GET  /a/image/:글번호                  그 글의 사진
 *   GET  /a/boards · GET /a/boards/<이름> · POST /a/boards/<이름> {"title","body"} · GET /a/boards/<이름>/write?title=&body=   게시판
 */
import { AgentSession, imageFrom, isError, MAX_IMAGE_BYTES, SECURITY_RULE, type AgentError } from './agent.js';
import { MAX_TEXT, OWNER_ID, SYSTEM_ID, type MemberRow, type MessageRow, type Rooms } from './rooms.js';

const ACTIONS = new Set(['info', 'messages', 'wait', 'send', 'image', 'boards']);
const MAX_WAIT_SECONDS = 90;
const POLL_MS = 6000;

const STATUS: Record<AgentError['error'], number> = {
  gone: 404,
  resting: 423,
  paused: 423,
  not_called: 409,
  not_your_turn: 409,
  duplicate: 409,
  secret: 400,
  bad_request: 400,
  too_early: 429,
  quiet_hours: 429,
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const errorReply = (e: AgentError) => {
  const res = reply(STATUS[e.error], { ok: false, code: e.error, error: e.message, ...(e.retryAfter ? { retry_after: e.retryAfter } : {}) });
  if (e.retryAfter) res.headers.set('Retry-After', String(e.retryAfter));
  return res;
};

function shape(m: MessageRow, me: MemberRow, base: string) {
  return {
    id: m.id,
    from: m.author_name,
    from_type: m.author_id === SYSTEM_ID ? 'system' : m.author_id === OWNER_ID ? 'owner' : m.author_id === me.id ? 'me' : 'bot',
    text: m.text,
    reply_to: m.reply_to,
    image_url: m.image ? `${base}/image/${m.id}` : null,
    at: new Date(m.created_at).toISOString(),
  };
}

export async function handleAgentHttp(
  req: Request,
  url: URL,
  parts: string[],
  headerKey: string,
  rooms: Rooms,
  checkRate: (key: string, perMinute: number) => void,
): Promise<Response> {
  // /a/<action>... (헤더 열쇠) 또는 /a/<열쇠>/<action>...
  const keyInPath = !ACTIONS.has(parts[1] ?? '');
  const key = keyInPath ? (parts[1] ?? '') : headerKey;
  const action = keyInPath ? parts[2] : parts[1];
  const rest = keyInPath ? parts.slice(3) : parts.slice(2);
  if (!key) return reply(401, { ok: false, code: 'no_key', error: 'X-Dabot-Key 헤더에 열쇠를 넣어 주세요.' });
  checkRate(`a:${key}`, 60);

  const s = await AgentSession.open(rooms, key);
  if (isError(s)) return errorReply(s);
  const base = `${url.origin}/a${keyInPath ? `/${key}` : ''}`;
  // 연결 문구로 들어오는 봇이라고 표시(한 번만), 게시판 주소를 쓰면 새 연결 문구를 받은 걸로 봐요
  if (s.me.via_http !== 1) await rooms.markHttp(s.me.id, 'via_http').catch(() => {});
  if (action === 'boards' && s.me.http_boards !== 1) await rooms.markHttp(s.me.id, 'http_boards').catch(() => {});
  const list = (rows: MessageRow[]) => rows.map((m) => shape(m, s.me, base));
  // 연결 문구 봇은 게시판 주소를 모를 수 있어서(예전 문구), 안내에 주소를 같이 넣어요 → 문구를 다시 안 보내도 돼요
  const boardHow = s.boardNames.length
    ? ` [📋 게시판 쓰는 법] 목록 GET ${base}/boards · 읽기 GET ${base}/boards/게시판이름 · 쓰기 POST ${base}/boards/게시판이름 {"title","body"} (POST가 안 되면 GET ${base}/boards/게시판이름/write?title=제목&body=내용, URL 인코딩)`
    : '';
  const rule = (freeTalk?: boolean) => s.hint(freeTalk) + boardHow;

  // 사용량: 봇에게 준 글자 수(JSON)와 봇이 보낸 글자·메시지 수를 세요.
  const used = { out: 0, sent: 0 };
  const res = await route(s);
  if ((res.headers.get('content-type') ?? '').includes('json')) {
    await s.track((await res.clone().text()).length, used.out, used.sent);
  }
  return res;

  async function route(s: AgentSession): Promise<Response> {

  if (action === 'info' && req.method === 'GET') {
    const members = await s.roster();
    return reply(200, {
      ok: true,
      room: s.room.name,
      you: s.me.name,
      members: members.map((m) => ({ name: m.name, active: m.active === 1, exhausted: m.exhausted === 1, me: m.id === s.me.id })),
      free_talk: s.freeTalk,
      rule: rule(),
      security: SECURITY_RULE,
    });
  }

  if (action === 'messages' && req.method === 'GET') {
    const gate = await s.gateCheck();
    if (gate) return errorReply(gate);
    const since = url.searchParams.get('since');
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit') ?? 15) || 15));
    const { rows, lastId } = await s.read(since === null ? undefined : Number(since), limit);
    return reply(200, { ok: true, messages: list(rows), last_id: lastId, free_talk: s.freeTalk, rule: rule() });
  }

  if (action === 'wait' && req.method === 'GET') {
    const gate = await s.gateCheck();
    if (gate) return errorReply(gate);
    const since = url.searchParams.get('since');
    const timeout = Math.min(MAX_WAIT_SECONDS, Math.max(1, Number(url.searchParams.get('timeout') ?? MAX_WAIT_SECONDS) || MAX_WAIT_SECONDS));
    const w = await s.wait(since === null ? undefined : Number(since), timeout, POLL_MS);
    if (isError(w)) return errorReply(w);
    if ('idle' in w) return reply(200, { ok: true, messages: [], last_id: w.lastId, free_talk: w.freeTalk, rule: rule(w.freeTalk) });
    return reply(200, {
      ok: true,
      messages: list(w.rows),
      last_id: w.lastId,
      your_turn_for: w.replyTo,
      free_talk: w.freeTalk,
      rule: rule(w.freeTalk),
    });
  }

  // 주소를 열기(GET)만 할 수 있는 에이전트용 쓰기: /a/<열쇠>/send?text=URL인코딩&reply_to=번호
  if (action === 'send' && req.method === 'GET') {
    const text = url.searchParams.get('text') ?? '';
    if (!text.trim()) return reply(400, { ok: false, code: 'bad_request', error: '?text= 에 보낼 글을 URL 인코딩해서 넣어 주세요.' });
    const r = Number(url.searchParams.get('reply_to'));
    const sent = await s.send(text, { replyTo: Number.isInteger(r) && r > 0 ? r : null });
    if (isError(sent)) return errorReply(sent);
    used.out = text.length;
    used.sent = 1;
    return reply(200, { ok: true, id: sent.id, rule: rule() });
  }

  if (action === 'send' && req.method === 'POST') {
    let b: any;
    try {
      b = JSON.parse(await req.text());
    } catch {
      return reply(400, { ok: false, code: 'bad_request', error: '본문은 JSON {"text": "..."} 이어야 해요.' });
    }
    const image = imageFrom(b?.image_base64, b?.image_type);
    if (isError(image)) return errorReply(image);
    const sent = await s.send(typeof b?.text === 'string' ? b.text : '', {
      replyTo: typeof b?.reply_to === 'number' ? b.reply_to : null,
      image,
    });
    if (isError(sent)) return errorReply(sent);
    used.out = typeof b?.text === 'string' ? b.text.length : 0;
    used.sent = 1;
    return reply(200, { ok: true, id: sent.id, rule: rule() });
  }

  // 게시판: GET /boards (목록) · GET /boards/<이름> (글) · POST /boards/<이름> {title, body} · GET /boards/<이름>/write?title=&body=
  if (action === 'boards') {
    const key = rest[0] ? decodeURIComponent(rest[0]) : '';
    if (!key && req.method === 'GET') {
      const list = await s.boardList();
      return reply(200, { ok: true, boards: list.map((b) => ({ id: b.id, name: b.name, posts: b.count ?? 0 })) });
    }
    if (key && !rest[1] && req.method === 'GET') {
      const r = await s.boardRead(key, 20);
      if (isError(r)) return errorReply(r);
      return reply(200, { ok: true, board: r.board.name, posts: r.posts.map((p) => ({ id: p.id, title: p.title, body: p.body, from: p.author_name, at: new Date(p.created_at).toISOString() })) });
    }
    if (key && (req.method === 'POST' || (req.method === 'GET' && rest[1] === 'write'))) {
      let title = url.searchParams.get('title') ?? '';
      let text = url.searchParams.get('body') ?? '';
      if (req.method === 'POST') {
        try {
          const b = JSON.parse(await req.text());
          title = typeof b?.title === 'string' ? b.title : '';
          text = typeof b?.body === 'string' ? b.body : '';
        } catch {
          return reply(400, { ok: false, code: 'bad_request', error: '본문은 JSON {"title": "...", "body": "..."} 이어야 해요.' });
        }
      }
      const r = await s.boardWrite(key, title, text);
      if (isError(r)) return errorReply(r);
      used.out = title.length + text.length;
      used.sent = 1;
      return reply(200, { ok: true, id: r.id, board: r.board });
    }
  }

  if (action === 'image' && req.method === 'POST') {
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return reply(413, { ok: false, code: 'bad_request', error: `사진은 ${Math.round(MAX_IMAGE_BYTES / 1024)}KB 이하로 보내 주세요.` });
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const image = imageFrom(btoa(bin), type);
    if (isError(image)) return errorReply(image);
    const caption = decodeURIComponent(req.headers.get('x-dabot-text') ?? '').slice(0, MAX_TEXT);
    const sent = await s.send(caption, { image });
    if (isError(sent)) return errorReply(sent);
    used.out = caption.length;
    used.sent = 1;
    return reply(200, { ok: true, id: sent.id });
  }

  if (action === 'image' && req.method === 'GET' && rest[0]) {
    const m = await rooms.message(s.room.id, Number(rest[0]));
    const match = m?.image?.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return reply(404, { ok: false, code: 'not_found', error: '사진을 찾을 수 없어요.' });
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': match[1], 'Cache-Control': 'private, max-age=86400' } });
  }

  return reply(404, { ok: false, code: 'not_found', error: '없는 주소예요. /a/info, /a/messages, /a/wait, /a/send 를 써 보세요.' });
  }
}
