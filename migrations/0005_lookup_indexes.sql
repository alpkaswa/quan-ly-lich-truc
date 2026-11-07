CREATE INDEX IF NOT EXISTS employee_verified_email ON employees(lower(trim(json_extract(payload,'$.email')))) WHERE active=1;
CREATE INDEX IF NOT EXISTS account_leaves_user ON account_leave_requests(user_id);
