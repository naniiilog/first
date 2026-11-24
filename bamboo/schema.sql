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
