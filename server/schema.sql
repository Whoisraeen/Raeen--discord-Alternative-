PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('text', 'voice')),
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  UNIQUE(user_id, client_id)
);
CREATE INDEX IF NOT EXISTS messages_channel_sequence ON messages(channel_id, seq DESC);
CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='seq', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.seq, new.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.seq, old.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.seq, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.seq, new.content);
END;
