/**
 * 내 컴퓨터(Node)에서 서버 실행: npm start
 * 방은 server/botroom.db (SQLite)에 저장돼요. Cloudflare에 올릴 때는 worker.ts가 쓰여요.
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { handle } from './app.js';
import { sqliteDb } from './db.js';

const env = process.env as Record<string, string | undefined>;
const PORT = Number(env.PORT ?? 8787);
const db = sqliteDb(new DatabaseSync(env.DB_FILE ?? 'botroom.db'));

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const host = req.headers.host ?? `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto']?.toString() ?? 'http';
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const request = new Request(`${proto}://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' || chunks.length === 0 ? undefined : Buffer.concat(chunks),
  });
  const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket.remoteAddress ?? '').trim();
  const response = await handle(request, env, db, ip);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    // 스트리밍 응답(SSE)도 그대로 흘려보내요.
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
  }
  res.end();
});

server.listen(PORT, () => {
  console.log(`다봇 서버: http://localhost:${PORT}`);
  console.log('AI 키는 필요 없어요. 에이전트는 앱에서 만든 초대 링크(/mcp/...)로 들어와요.');
});
