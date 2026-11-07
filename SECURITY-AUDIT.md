# Kiểm toán và khắc phục bảo mật — 03/11/2026

## Đã thực hiện

- Google mới chỉ được đăng nhập nếu email đã được Admin đưa vào một hồ sơ nhân sự duy nhất đang hoạt động, hoặc liên kết Google đã tồn tại và được xác định hồ sơ. Không lấy quyền từ nội dung phía người dùng gửi. Admin hiện tại giữ nguyên.
- Tài khoản Google cũ không xác định được hồ sơ bị từ chối truy cập với hướng dẫn liên hệ Admin; không xóa tài khoản. Admin có thể gắn hồ sơ tại Quản lý tài khoản.
- Admin tạo tài khoản EMPLOYEE, tên đăng nhập duy nhất không phân biệt hoa/thường, liên kết nhân sự duy nhất; mật khẩu đầu tiên/cấp lại là `1`. Không có giới hạn số tài khoản trong logic cấp tài khoản.
- Băm scrypt với salt ngẫu nhiên riêng và PASSWORD_PEPPER hiện có. Mật khẩu không được lưu vào trình duyệt, log hoặc nhật ký quản trị. Người dùng đổi mật khẩu tại mục Đổi mật khẩu; sau đổi/cấp lại phải đăng nhập lại.
- Bổ sung lịch sử đăng nhập riêng, bộ lọc người/ngày/tháng, đăng nhập/đăng xuất/hết hạn/thu hồi/cấp lại/đổi mật khẩu. Giữ lịch sử khi đăng xuất và khi phục hồi backup. Phiên cũ được nhập từ bảng sessions, không suy đoán lịch sử trước khi tính năng này tồn tại.
- Hoạt động cuối ghi theo yêu cầu API và heartbeat, không được xem là thời gian con người làm việc. Đóng trình duyệt/mất mạng không giả định thời điểm đăng xuất. Thời lượng là thời lượng phiên.
- Cookie HttpOnly/Secure/SameSite, CSRF, Origin, quyền backend, rate limit, CAS khi sửa lịch tiếp tục được bảo vệ. Khóa/cấp lại/đổi mật khẩu thu hồi phiên và WebSocket; heartbeat kiểm tra lại phiên; alarm đóng kết nối hết hạn. Restore thu hồi tất cả kết nối.
- Backup schema 4 bổ sung login_history, vẫn đọc schema 1–3. SHA256/HMAC, backup an toàn trước restore, giữ 30 ngày. Khi chuyển sang R2 vẫn tải được bản D1 fallback cũ. Kho mới được hiển thị đúng thực tế trong UI.

## Migration và file

Migration mới: `migrations/0006_login_history.sql` chỉ tạo bảng/chỉ mục và bổ sung lịch sử cho phiên có sẵn; không thay đổi database_id, không xóa bảng hoặc dữ liệu.

Backend: `worker/index.mjs`, `worker/password.mjs`, `worker/loginHistory.mjs`, `worker/google.mjs`, `worker/room.mjs`, `worker/realtime.mjs`, `worker/backup.mjs`.

Giao diện/API: `src/components/PasswordAccess.tsx`, `SessionGate.tsx`, `AccountsView.tsx`, `BackupsView.tsx`, `src/services/api.ts`. Không đổi các màn hình nghiệp vụ khác.

Kiểm thử: `tests/password.test.mjs`, `tests/google.test.mjs`, `tests/sidebar.test.mjs`, `scripts/integration-security.mjs`, `scripts/integration-local.mjs`, `scripts/integration-restore.mjs`; thêm lệnh `npm run integration` trong `package.json`.

## Kết quả kiểm thử

- `npm run check`: 54 kiểm thử đạt, TypeScript và bản dựng frontend/Worker thành công. Vẫn có cảnh báo kích thước bundle frontend, không phải lỗi build.
- `npm run integration`: chạy workerd/D1/Durable Objects local, fixture tách biệt production. Bộ mới kiểm tra tài khoản, mặc định 1, đổi/cấp lại, chống tăng quyền, trùng tên/hồ sơ, khóa/mở, thu hồi, đăng nhập lại, lịch sử, hết phiên và rate limit.
- 43 kiểm tra API/nghiệp vụ với 50 WebSocket thật trong môi trường local; 6 kiểm tra client mất mạng/kết nối lại; backup có lịch sử, backup bị sửa bị từ chối, restore nguyên tử và thu hồi phiên đạt.
- Chạy cả D1 fallback và R2 local. R2 local xác nhận cấu hình kho R2, tạo/tải/restore; không phải kiểm thử Cloudflare R2 production. Đối chiếu local sau restore giữ lại 4 phiên đăng nhập của tài khoản mật khẩu kiểm thử.
- Google verifier được kiểm thử chữ ký, audience, issuer, nonce, email xác minh và điều kiện cấp quyền bằng khóa kiểm thử riêng. Không giả nhận là lần đăng nhập Google thật trên hai thiết bị.

## Production

Đã xuất bản sao lưu D1 đầy đủ trước migration vào thư mục work riêng (không đưa vào ZIP mã nguồn). SHA256: `566748A336AA25316E73B83B5726DE5F1A3588CE57B81CC8E91D99088A61E307`.

Đã áp dụng migration 0006 và triển khai Worker/Pages. Kiểm tra frontend HTTP 200 và bundle mới; health 200; các API state/accounts/history/backups trả 401 khi chưa đăng nhập, tài khoản không tồn tại không đăng nhập được.

Đối chiếu trước/sau: 3 tài khoản, 1 Admin hoạt động, 18 nhân sự, 29 ca, 1 đơn nghỉ nhân sự, 356 bản ghi lịch sử. Không chạy restore/xóa/seed trên production. Đây là kiểm tra triển khai và truy cập ẩn danh, không phải kiểm thử đầy đủ nghiệp vụ production hay cam kết hiệu năng.

## R2 còn cần Admin cấu hình

Cloudflare trả mã 10042: chưa bật R2. Không tự bật R2/thanh toán, chưa tạo bucket production. Hiện production dùng D1 fallback và hiển thị cảnh báo rõ ràng.

Nếu Admin quyết định bật R2 sau khi tự xem các điều kiện tài khoản/thanh toán:
1. Trong Cloudflare Dashboard, mở R2 và tự hoàn tất bước kích hoạt nếu đồng ý. Nếu không đồng ý, giữ D1 fallback.
2. Tạo bucket `lich-truc-na-ri-backups`; giữ riêng tư, không bật r2.dev public access hoặc public custom domain.
3. Dùng cấu hình đã có `wrangler.r2.jsonc` với binding `BACKUPS` và database_id hiện tại. Triển khai bằng `npx wrangler deploy --config wrangler.r2.jsonc` trong thư mục dự án.
4. Vào Sao lưu & khôi phục, xác nhận kho hiển thị R2, tạo và tải một bản backup. Chỉ kiểm thử restore trong môi trường riêng hoặc khi có quyết định phục hồi dữ liệu thực sự.

Cron giữ nguyên `0 19 * * *` UTC = 02:00 Việt Nam, lưu 30 ngày. Chưa chờ kiểm chứng một lượt cron 02:00 trên production trong đợt này.

## Sử dụng

Admin: Quản lý → Tài khoản → chọn nhân sự, nhập tên đăng nhập → Tạo tài khoản. Cấp tên đăng nhập và mật khẩu `1` trực tiếp cho nhân viên; nhân viên đăng nhập rồi đổi mật khẩu. Tài khoản Google đã có: chọn Gắn hồ sơ nếu chưa xác định được nhân sự; không tạo tài khoản thứ hai cho cùng người.

Chạy kiểm thử lại: `npm run check`; ở môi trường local riêng chạy `npm run integration:prepare`, mở `npm run integration:server` ở cửa sổ thứ hai, rồi `npm run integration`. Prepare chỉ dùng local và xóa fixture local; không dùng với dữ liệu production.
