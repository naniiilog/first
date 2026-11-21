/**
 * 아주 작은 SQL 저장소 추상화.
 * - Cloudflare: D1 (무료)
 * - 내 컴퓨터: Node 내장 SQLite (node:sqlite)
 * 두 곳에서 같은 SQL을 써요.
 */
export type SqlValue = string | number | null;

export interface Db {
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  run(sql: string, ...params: SqlValue[]): Promise<{ lastId: number; changes: number }>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_token TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    invite_token TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_seen INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS members_room ON members(room_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_room ON messages(room_id, id)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

let schemaReady: Promise<void> | null = null;
export function ensureSchema(db: Db): Promise<void> {
  schemaReady ??= (async () => {
    for (const sql of SCHEMA) await db.run(sql);
    // 나중에 추가된 칸: 이미 있으면 오류가 나므로 무시해요.
    await db.run('ALTER TABLE rooms ADD COLUMN free_talk INTEGER NOT NULL DEFAULT 0').catch(() => {});
    await db.run('ALTER TABLE members ADD COLUMN avatar TEXT').catch(() => {});
    await db.run('ALTER TABLE rooms ADD COLUMN closed INTEGER NOT NULL DEFAULT 0').catch(() => {});
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Cloudflare D1 바인딩에서 쓰는 최소한의 형태 */
interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { last_row_id?: number; changes?: number } }>;
    };
  };
}

export function d1Db(d1: D1Like): Db {
  return {
    all: async (sql, ...p) => (await d1.prepare(sql).bind(...p).all()).results as never,
    first: (sql, ...p) => d1.prepare(sql).bind(...p).first(),
    run: async (sql, ...p) => {
      const r = await d1.prepare(sql).bind(...p).run();
      return { lastId: Number(r.meta.last_row_id ?? 0), changes: Number(r.meta.changes ?? 0) };
    },
  };
}

/** node:sqlite의 DatabaseSync에서 쓰는 최소한의 형태 */
interface SqliteLike {
  prepare(sql: string): {
    all(...p: SqlValue[]): unknown[];
    get(...p: SqlValue[]): unknown;
    run(...p: SqlValue[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  };
}

export function sqliteDb(db: SqliteLike): Db {
  return {
    all: async (sql, ...p) => db.prepare(sql).all(...p) as never,
    first: async (sql, ...p) => (db.prepare(sql).get(...p) ?? null) as never,
    run: async (sql, ...p) => {
      const r = db.prepare(sql).run(...p);
      return { lastId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };
}
