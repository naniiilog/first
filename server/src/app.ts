import { route, status, type Env } from './catalog.js';
import { complete, UpstreamError, type Turn } from './providers.js';

/**
 * BotRoom API (Node 서버와 Cloudflare Worker가 같이 써요)
 *
 *   GET  /health  → { ok: true }
 *   GET  /ais     → { ais: { [aiId]: 'real' | 'mimic' } }   쓸 수 있는 AI와 진짜/따라하기 여부
 *   POST /chat    → { text, usage: { input, output }, mode }
 *        body: { aiId, system, turns: [{ role, content }] }
 */

const MAX_BODY_CHARS = 64 * 1024;
const MAX_TURNS = 40;
const MAX_CHARS = 24_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

// 같은 서버 인스턴스 안에서만 세는 간단한 분당 제한이에요(무료 사용량 보호용).
const hits = new Map<string, number[]>();
function rateLimited(ip: string, perMinute: number): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > perMinute;
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

export async function handle(req: Request, env: Env, clientIp: string): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return json(200, { ok: true });

    const appToken = env.APP_TOKEN?.trim();
    if (appToken && req.headers.get('x-app-token') !== appToken) return json(401, { error: '앱 토큰이 맞지 않아요.' });

    if (req.method === 'GET' && url.pathname === '/ais') return json(200, { ais: status(env) });

    if (req.method === 'POST' && url.pathname === '/chat') {
      if (rateLimited(clientIp, Number(env.RATE_PER_MINUTE ?? 20))) {
        return json(429, { error: '요청이 너무 많아요. 잠시 쉬었다가 해 주세요.' });
      }
      const raw = await req.text();
      if (raw.length > MAX_BODY_CHARS) return json(413, { error: '요청이 너무 커요.' });
      let body: any;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { error: 'JSON 형식이 아니에요.' });
      }
      const r = typeof body?.aiId === 'string' ? route(env, body.aiId) : null;
      if (!r) return json(400, { error: '이 AI는 지금 서버에서 쓸 수 없어요.' });
      if (typeof body.system !== 'string' || body.system.length > 4000) return json(400, { error: 'system 값이 잘못됐어요.' });
      if (!validTurns(body.turns)) return json(400, { error: '대화 형식이 잘못됐거나 너무 길어요.' });

      const result = await complete(env, r, body.system, body.turns);
      return json(200, {
        text: result.text || '(…)',
        usage: { input: result.inputTokens, output: result.outputTokens },
        mode: r.mode,
      });
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof UpstreamError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: '서버 오류가 났어요.' });
  }
}
