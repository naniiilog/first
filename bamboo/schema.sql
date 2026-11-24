CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created INTEGER NOT NULL,          -- ms epoch
  heard INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  author TEXT NOT NULL               -- daily-rotating HMAC of visitor, never a raw IP
);
CREATE INDEX IF NOT EXISTS idx_leaves_created ON leaves(created);
CREATE INDEX IF NOT EXISTS idx_leaves_author ON leaves(author, created);

CREATE TABLE IF NOT EXISTS reactions (
  leaf_id INTEGER NOT NULL,
  visitor TEXT NOT NULL,
  kind TEXT NOT NULL,                -- 'heard' | 'report'
  PRIMARY KEY (leaf_id, visitor, kind)
);
