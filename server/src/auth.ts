import type { Db } from './db.js';

/**
 * 앱 비밀번호.
 * - 처음 한 번 앱에서 비밀번호를 정하면(setup) 그다음부터 방장 API(/api/rooms...)는 비밀번호가 있어야 써요.
 * - 서버에는 비밀번호 원문이 아니라 "소금(salt)을 친 SHA-256 값"만 저장해요.
 * - 에이전트 입구(/mcp/<초대토큰>)는 초대 링크 자체가 열쇠라서 비밀번호와 상관없어요.
 * - 환경 변수 APP_TOKEN을 정해 두면 그 값이 비밀번호 대신 쓰여요(직접 배포하는 사람용).
 */

const KEY = 'app_password';

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function hash(salt: string, password: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)));
}

/** 길이가 같은 두 문자열을 시간 차 없이 비교해요. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const MIN_PASSWORD = 4;
export const MAX_PASSWORD = 64;

export class Auth {
  constructor(private db: Db, private envToken: string) {}

  private async stored(): Promise<{ salt: string; hash: string } | null> {
    const row = await this.db.first<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', KEY);
    if (!row) return null;
    const [salt, h] = row.value.split(':');
    return salt && h ? { salt, hash: h } : null;
  }

  async isSet(): Promise<boolean> {
    return !!this.envToken || !!(await this.stored());
  }

  async check(password: string | null): Promise<boolean> {
    if (!password) return false;
    if (this.envToken) return sameString(password, this.envToken);
    const s = await this.stored();
    if (!s) return false;
    return sameString(await hash(s.salt, password), s.hash);
  }

  async set(password: string): Promise<void> {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = hex(saltBytes.buffer);
    await this.db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      KEY,
      `${salt}:${await hash(salt, password)}`,
    );
  }
}
