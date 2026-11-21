import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CATALOG, isAvailable } from './catalog.js';
import { complete, UpstreamError, type Turn } from './providers.js';

/**
 * BotRoom 서버
 * 앱 사용자는 키 없이 이 서버에 요청하고, 서버가 운영자의 키로 각 AI 회사 API를 호출해요.
 *
 *   GET  /health         → { ok: true }
 *   GET  /ais            → { available: string[] }  (키가 설정돼 쓸 수 있는 AI id)
 *   POST /chat           → { text, usage: { input, output } }
 *        body: { aiId, system, turns: [{ role, content }] }
 */

const PORT = Number(process.env.PORT ?? 8787);
/** 설정하면 앱이 같은 값을 x-app-token 헤더로 보내야 해요(남이 내 서버를 쓰는 것 방지). */
const APP_TOKEN = process.env.APP_TOKEN?.trim() ?? '';
/** IP당 1분에 허용하는 /chat 요청 수 */
const RATE_PER_MINUTE = Number(process.env.RATE_PER_MINUTE ?? 40);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TURNS = 40;
const MAX_CHARS = 24_000;

const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_PER_MINUTE;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new UpstreamError('요청이 너무 커요.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new UpstreamError('JSON 형식이 아니에요.', 400);
  }
}

function validTurns(value: unknown): value is Turn[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TURNS) return false;
  let chars = 0;
  for (const t of value) {
    if (!t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.content !== 'string') return false;
    chars += t.content.length;
  }
  return chars <= MAX_CHARS && value[0].role === 'user';
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (url.pathname === '/health') return send(res, 200, { ok: true });

    if (APP_TOKEN && req.headers['x-app-token'] !== APP_TOKEN) return send(res, 401, { error: '앱 토큰이 맞지 않아요.' });

    if (req.method === 'GET' && url.pathname === '/ais') {
      return send(res, 200, { available: Object.values(CATALOG).filter(isAvailable).map((e) => e.id) });
    }

    if (req.method === 'POST' && url.pathname === '/chat') {
      const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket.remoteAddress ?? '').trim();
      if (rateLimited(ip)) return send(res, 429, { error: '요청이 너무 많아요. 잠시 쉬었다가 해 주세요.' });

      const body = await readJson(req);
      const entry = CATALOG[body?.aiId];
      if (!entry) return send(res, 400, { error: '알 수 없는 AI예요.' });
      if (typeof body.system !== 'string' || body.system.length > 4000) return send(res, 400, { error: 'system 값이 잘못됐어요.' });
      if (!validTurns(body.turns)) return send(res, 400, { error: '대화 형식이 잘못됐거나 너무 길어요.' });

      const result = await complete(entry, body.system, body.turns);
      return send(res, 200, {
        text: result.text || '(…)',
        usage: { input: result.inputTokens, output: result.outputTokens },
      });
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof UpstreamError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: '서버 오류가 났어요.' });
  }
});

server.listen(PORT, () => {
  const ready = Object.values(CATALOG).filter(isAvailable).map((e) => e.id);
  console.log(`BotRoom 서버: http://localhost:${PORT}`);
  console.log(`사용 가능한 AI: ${ready.length ? ready.join(', ') : '(없음 — .env에 API 키를 넣어주세요)'}`);
});
