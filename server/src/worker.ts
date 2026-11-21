/**
 * Cloudflare Workers(무료)에 올릴 때 쓰는 입구예요.
 * - /api, /mcp, /health → 서버(app.ts)
 * - 그 밖의 주소 → 휴대폰 브라우저용 웹 앱(scripts/build-web.mjs가 넣어준 파일)
 * 방은 D1(무료 데이터베이스)에 저장돼요.
 *   npm run deploy   (웹 앱을 만든 뒤 함께 올려요)
 */
import { handle, type Env } from './app.js';
import { d1Db } from './db.js';
import WEB_ASSETS from './web-assets.gen.js';

// 사진 같은 바이너리 파일은 처음 한 번만 풀어두고 재사용해요(무료 플랜 CPU 시간 절약).
const decoded = new Map<string, Uint8Array<ArrayBuffer>>();
function body(path: string, asset: { text?: string; b64?: string }): BodyInit {
  if (asset.text !== undefined) return asset.text;
  let bytes = decoded.get(path);
  if (!bytes) {
    bytes = Uint8Array.from(atob(asset.b64 ?? ''), (c) => c.charCodeAt(0));
    decoded.set(path, bytes);
  }
  return bytes;
}

function serveWeb(request: Request): Response {
  const url = new URL(request.url);
  let path = url.pathname;
  let asset = WEB_ASSETS[path];
  // 앱 화면 주소(/room/... 등)는 모두 index.html로 열어요.
  if (!asset) {
    path = '/index.html';
    asset = WEB_ASSETS[path];
  }
  if (!asset) return new Response('웹 앱이 아직 올라가지 않았어요.', { status: 404 });
  // 이름에 해시가 붙은 파일은 바뀌지 않으니 오래 캐시해요.
  const immutable = path.startsWith('/_expo/') || /\.[0-9a-f]{16,}\./.test(path);
  return new Response(request.method === 'HEAD' ? null : body(path, asset), {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  });
}

export default {
  fetch(request: Request, env: Env & { DB: Parameters<typeof d1Db>[0] }): Promise<Response> | Response {
    const { pathname } = new URL(request.url);
    const isApi = pathname.startsWith('/api/') || pathname.startsWith('/mcp/') || pathname === '/health';
    if (!isApi && (request.method === 'GET' || request.method === 'HEAD')) return serveWeb(request);
    return handle(request, env, d1Db(env.DB), request.headers.get('cf-connecting-ip') ?? '');
  },
};
