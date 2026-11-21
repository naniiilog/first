/**
 * Cloudflare Workers(무료)에 올릴 때 쓰는 입구예요. 방은 D1(무료 데이터베이스)에 저장돼요.
 *   npx wrangler d1 create botroom   → 나온 database_id를 wrangler.toml에 붙여넣기
 *   npm run deploy
 */
import { handle, type Env } from './app.js';
import { d1Db } from './db.js';

export default {
  fetch(request: Request, env: Env & { DB: Parameters<typeof d1Db>[0] }): Promise<Response> {
    return handle(request, env, d1Db(env.DB), request.headers.get('cf-connecting-ip') ?? '');
  },
};
