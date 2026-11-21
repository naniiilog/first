/**
 * Cloudflare Workers(무료)에 올릴 때 쓰는 입구예요.
 *   npx wrangler deploy
 *   npx wrangler secret put GEMINI_API_KEY
 */
import { handle } from './app.js';
import type { Env } from './catalog.js';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const ip = request.headers.get('cf-connecting-ip') ?? '';
    return handle(request, env, ip);
  },
};
