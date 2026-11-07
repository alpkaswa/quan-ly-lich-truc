CREATE TABLE account_leave_requests (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')), payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX account_leave_open_day ON account_leave_requests(user_id,date) WHERE status IN ('PENDING','APPROVED');
