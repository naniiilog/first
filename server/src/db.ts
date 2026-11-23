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
  // 휴대폰 알림 구독(기기 × 방)
  `CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT NOT NULL,
    room_id TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (endpoint, room_id)
  )`,
  `CREATE INDEX IF NOT EXISTS push_subs_room ON push_subs(room_id)`,
  // 방장이 초대한 사람(손님): 링크로 들어와 대화를 보거나 같이 써요
  `CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    can_post INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_seen INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS guests_room ON guests(room_id)`,
  `CREATE INDEX IF NOT EXISTS messages_room_time ON messages(room_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

/** 표 구조가 바뀔 때마다 1씩 올려요. 이미 최신이면 질의 1번으로 확인을 끝내요(무료 플랜 질의 수 절약). */
const SCHEMA_VERSION = '15';

let schemaReady: Promise<void> | null = null;
export function ensureSchema(db: Db): Promise<void> {
  schemaReady ??= (async () => {
    const current = await db
      .first<{ value: string }>("SELECT value FROM app_settings WHERE key = 'schema_version'")
      .catch(() => null);
    if (current?.value === SCHEMA_VERSION) return;
    for (const sql of SCHEMA) await db.run(sql);
    // 나중에 추가된 칸: 이미 있으면 오류가 나므로 무시해요.
    await db.run('ALTER TABLE rooms ADD COLUMN free_talk INTEGER NOT NULL DEFAULT 0').catch(() => {});
    await db.run('ALTER TABLE members ADD COLUMN avatar TEXT').catch(() => {});
    await db.run('ALTER TABLE rooms ADD COLUMN closed INTEGER NOT NULL DEFAULT 0').catch(() => {});
    await db.run('ALTER TABLE messages ADD COLUMN reply_to INTEGER').catch(() => {});
    await db.run('ALTER TABLE messages ADD COLUMN image TEXT').catch(() => {});
    await db.run('ALTER TABLE members ADD COLUMN read_cursor INTEGER NOT NULL DEFAULT 0').catch(() => {});
    // 확인 간격(분, 0이면 실시간)과 매너타임(시작·끝 시각, 시간대)
    await db.run('ALTER TABLE rooms ADD COLUMN check_interval_min INTEGER NOT NULL DEFAULT 30').catch(() => {});
    await db.run('ALTER TABLE rooms ADD COLUMN quiet_enabled INTEGER NOT NULL DEFAULT 1').catch(() => {});
    await db.run('ALTER TABLE rooms ADD COLUMN quiet_start INTEGER NOT NULL DEFAULT 0').catch(() => {});
    await db.run('ALTER TABLE rooms ADD COLUMN quiet_end INTEGER NOT NULL DEFAULT 9').catch(() => {});
    await db.run("ALTER TABLE rooms ADD COLUMN tz TEXT NOT NULL DEFAULT 'Asia/Seoul'").catch(() => {});
    await db.run('ALTER TABLE members ADD COLUMN last_check INTEGER').catch(() => {});
    // 봇 사용량(이번 주기)과 초기화 주기
    for (const col of [
      'use_start INTEGER',
      'use_calls INTEGER NOT NULL DEFAULT 0',
      'use_sent INTEGER NOT NULL DEFAULT 0',
      'use_in INTEGER NOT NULL DEFAULT 0',
      'use_out INTEGER NOT NULL DEFAULT 0',
      "reset_mode TEXT NOT NULL DEFAULT 'daily'",
      'reset_value INTEGER NOT NULL DEFAULT 0',
      // 그 AI 앱의 사용량이 다 차서 못 쓰는 중(방장이 켜요, 주황불)
      'exhausted INTEGER NOT NULL DEFAULT 0',
      // 이 봇만의 확인 간격(분). NULL이면 방 설정을 따라요
      'check_interval_min INTEGER',
    ]) {
      await db.run(`ALTER TABLE members ADD COLUMN ${col}`).catch(() => {});
    }
    // 휴대폰 알림 설정(방마다)
    for (const col of [
      "notify_mode TEXT NOT NULL DEFAULT 'off'",
      'notify_silent INTEGER NOT NULL DEFAULT 0',
      'notify_name TEXT',
      'notify_last INTEGER',
      'notify_last_id INTEGER',
      'owner_seen INTEGER',
      // 기다리는 방식: stay(계속 기다리기) · away(확인 간격 동안 쉬었다 오기)
      "wait_mode TEXT NOT NULL DEFAULT 'stay'",
      // 순서 대화: 순서(멤버 번호 JSON), 지금 차례 위치, 그 차례가 시작된 시각
      'turn_order TEXT',
      'turn_idx INTEGER NOT NULL DEFAULT 0',
      'turn_since INTEGER',
      // 방장의 '마지막으로 읽은 글'과 북마크(JSON) — 어느 기기에서든 같게
      'read_mark INTEGER NOT NULL DEFAULT 0',
      'bookmarks TEXT',
    ]) {
      await db.run(`ALTER TABLE rooms ADD COLUMN ${col}`).catch(() => {});
    }
    await db.run(
      "INSERT INTO app_settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      SCHEMA_VERSION,
    );
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
