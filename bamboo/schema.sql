CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created INTEGER NOT NULL,          -- ms epoch
  heard INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  author TEXT NOT NULL,              -- daily-rotating HMAC of visitor, never a raw IP
  mode TEXT NOT NULL DEFAULT 'whisper', -- how it was told: whisper | shout | sigh
  grove INTEGER NOT NULL DEFAULT 0       -- which grove (path end) it hangs in: 0 | 1 | 2
);
CREATE INDEX IF NOT EXISTS idx_leaves_created ON leaves(created);
CREATE INDEX IF NOT EXISTS idx_leaves_author ON leaves(author, created);

CREATE TABLE IF NOT EXISTS reactions (
  leaf_id INTEGER NOT NULL,
  visitor TEXT NOT NULL,
  kind TEXT NOT NULL,                -- 'heard' | 'report'
  PRIMARY KEY (leaf_id, visitor, kind)
);

-- who is strolling in the forest right now (random per-tab id, no personal data)
CREATE TABLE IF NOT EXISTS presence (
  sid TEXT PRIMARY KEY,
  seen INTEGER NOT NULL,
  place TEXT NOT NULL DEFAULT 'plaza'  -- plaza | g0 | g1 | g2
);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(seen);

-- wrong admin password attempts (hashed visitor only), for a short lockout
CREATE TABLE IF NOT EXISTS admin_fails (
  visitor TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_fails ON admin_fails(visitor, ts);

-- small key/value settings (the admin password is stored only as a salted PBKDF2 hash)
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- numbers only: daily counters (visits, leaves per grove/mode, heard)
CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT NOT NULL,          -- YYYY-MM-DD, Korea time
  metric TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);
-- who was already counted today (daily-rotating hashed visitor id; kept 2 days)
CREATE TABLE IF NOT EXISTS daily_seen (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  what TEXT NOT NULL,
  PRIMARY KEY (day, visitor, what)
);
