/**
 * 내 컴퓨터(Node)에서 서버 실행: npm start
 * Cloudflare에 올릴 때는 worker.ts가 쓰여요.
 */
import { createServer } from 'node:http';
import { handle } from './app.js';
import { status } from './catalog.js';

const env = process.env as Record<string, string | undefined>;
const PORT = Number(env.PORT ?? 8787);

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(new URL(req.url ?? '/', `http://localhost:${PORT}`), {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket.remoteAddress ?? '').trim();
  const response = await handle(request, env, ip);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, () => {
  const ais = Object.entries(status(env));
  console.log(`BotRoom 서버: http://localhost:${PORT}`);
  console.log(
    ais.length
      ? `사용 가능한 AI: ${ais.map(([id, mode]) => `${id}${mode === 'mimic' ? '(따라하기)' : ''}`).join(', ')}`
      : '사용 가능한 AI 없음 — .env에 GEMINI_API_KEY(무료)를 넣어주세요.',
  );
});
