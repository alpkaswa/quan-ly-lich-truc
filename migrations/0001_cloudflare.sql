PRAGMA foreign_keys = ON;
CREATE TABLE app_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0, settings TEXT NOT NULL CHECK(json_valid(settings)));
INSERT INTO app_meta VALUES (1,0,'{"schoolName":"TRƯỜNG PHỔ THÔNG DÂN TỘC NỘI TRÚ NA RÌ","shiftDurationHours":24,"shiftStartTime":"07:00","shiftEndTime":"07:00 ngày hôm sau","requiredTeachers":2,"requiredAdmins":1,"requiredGuards":1,"disallowConsecutiveDays":true,"respectApprovedUnavailabilities":true,"fairDistribution":true}');
CREATE TABLE employees (id TEXT PRIMARY KEY, code TEXT NOT NULL COLLATE NOCASE UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('TEACHER','ADMIN','GUARD')), active INTEGER NOT NULL CHECK(active IN (0,1)), payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('ADMIN','EMPLOYEE')), employee_id TEXT UNIQUE REFERENCES employees(id) ON DELETE RESTRICT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL);
CREATE TABLE shifts (id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, locked INTEGER NOT NULL CHECK(locked IN (0,1)), payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX shifts_date ON shifts(date);
CREATE TABLE shift_assignments (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE, employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, position TEXT NOT NULL CHECK(position IN ('teacher1','teacher2','admin','guard')), UNIQUE(shift_id,position), UNIQUE(shift_id,employee_id));
CREATE INDEX assignment_employee ON shift_assignments(employee_id,shift_id);
CREATE TRIGGER assignment_role BEFORE INSERT ON shift_assignments BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND role=CASE WHEN NEW.position IN ('teacher1','teacher2') THEN 'TEACHER' WHEN NEW.position='admin' THEN 'ADMIN' ELSE 'GUARD' END) THEN RAISE(ABORT,'INVALID_PROFESSION') END;
END;
CREATE TABLE unavailable_dates (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')), payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX leave_employee_date ON unavailable_dates(employee_id,date,status);
CREATE TABLE shift_change_requests (id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES employees(id), target_id TEXT NOT NULL REFERENCES employees(id), source_date TEXT NOT NULL, target_date TEXT, reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000), status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')), requested_by TEXT NOT NULL REFERENCES users(id), responded_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, responded_at TEXT, before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)), after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)), CHECK(requester_id<>target_id), CHECK(target_date IS NULL OR source_date<>target_date));
CREATE UNIQUE INDEX pending_request ON shift_change_requests(requester_id,source_date) WHERE status='PENDING';
CREATE INDEX requests_target ON shift_change_requests(target_id,status);
CREATE TABLE shift_history (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE compensatory_duties (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
CREATE INDEX notifications_user ON notifications(user_id,created_at);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_id TEXT, operation TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX audit_time ON audit_logs(created_at);
CREATE TABLE backup_logs (id TEXT PRIMARY KEY, object_key TEXT, status TEXT NOT NULL CHECK(status IN ('SUCCESS','FAILED')), created_at TEXT NOT NULL, error TEXT, checksum TEXT, revision INTEGER);
CREATE INDEX backup_time ON backup_logs(created_at);
-- D1 batch() is transactional. This guard aborts the entire batch on a stale read.
CREATE TABLE mutation_guard (id TEXT PRIMARY KEY, expected_revision INTEGER NOT NULL);
CREATE TRIGGER guard_version BEFORE INSERT ON mutation_guard BEGIN
  SELECT CASE WHEN NEW.expected_revision<>(SELECT revision FROM app_meta WHERE id=1) THEN RAISE(ABORT,'REVISION_CONFLICT') END;
END;
