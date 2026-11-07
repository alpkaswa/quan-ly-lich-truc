CREATE TABLE google_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX google_identity_email ON google_identities(email);
CREATE TABLE used_google_nonces (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
