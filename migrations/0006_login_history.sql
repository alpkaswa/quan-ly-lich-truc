CREATE TABLE IF NOT EXISTS login_history (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL UNIQUE,
 login_at INTEGER NOT NULL, logout_at INTEGER, last_activity_at INTEGER NOT NULL,
 duration_seconds INTEGER, logout_reason TEXT, device TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS login_history_user_time ON login_history(user_id,login_at);
CREATE INDEX IF NOT EXISTS login_history_time ON login_history(login_at);
INSERT OR IGNORE INTO login_history(id,user_id,session_id,login_at,last_activity_at,device)
SELECT 'legacy-'||id,user_id,id,created_at,created_at,'Phiên tồn tại trước khi bổ sung lịch sử; chưa ghi nhận hoạt động trước đó' FROM sessions;
