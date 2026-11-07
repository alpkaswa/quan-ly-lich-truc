-- Used only when R2 has not been enabled. Keeps backups private within the D1 free quota.
CREATE TABLE backup_object_chunks (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, UNIQUE(object_key,part));
CREATE INDEX backup_chunk_key ON backup_object_chunks(object_key,part);
