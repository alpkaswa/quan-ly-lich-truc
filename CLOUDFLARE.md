# Cấu hình và vận hành Cloudflare

## Thành phần và dữ liệu

`worker/index.mjs`: API, session, tài khoản, đổi ca, sao lưu và Cron.
`worker/database.mjs`: chụp dữ liệu nhất quán và ghi D1 nguyên tử.
`worker/room.mjs`: Durable Object dùng SQLite class migration, chỉ quản lý WebSocket/metadata kết nối.
`worker/backup.mjs`: sao lưu có chữ ký, xác thực và khôi phục.
`shared/domain.mjs`: kiểm tra nghiệp vụ dùng chung, không phụ thuộc nhà cung cấp.
`src/services/storage.ts`: adapter giữ API của các màn hình cũ; cache chỉ nằm trong bộ nhớ, dữ liệu bền vững ở D1.
`pages/functions/api/[[path]].ts`: proxy cùng nguồn qua private service binding; không mở API Workers ra workers.dev.

D1 có các bảng users, employees, shifts, shift_assignments, shift_change_requests, notifications, audit_logs, backup_logs, cùng sessions, login_limits, unavailable_dates, shift_history, compensatory_duties, app_meta, mutation_guard và backup_object_chunks.

Mỗi ca từ 07:00 ngày định danh ca đến 07:00 hôm sau, Asia/Ho_Chi_Minh. Trước 07:00 trang chủ hiển thị ca bắt đầu hôm trước đang trực. Các lựa chọn ngày là ngày lịch, không chuyển qua UTC tùy tiện.

## Tạo mới tài nguyên miễn phí

Không bật Workers Paid, không gắn thanh toán. Dùng Durable Objects SQLite (`new_sqlite_classes`) trên Workers Free.

1. `npx wrangler login --device`: đăng nhập trực tiếp Cloudflare, không gửi token vào chat.
2. `npx wrangler d1 create lich-truc-na-ri --location apac`; lưu database_id vào wrangler.jsonc.
3. `npx wrangler d1 migrations apply DB --remote`.
4. Nếu tài khoản chưa có workers.dev subdomain, hoàn tất onboarding trong Workers & Pages. Backend vẫn để workers_dev=false và chỉ truy cập qua Pages service binding.
5. `npx wrangler pages project create lich-truc-na-ri --production-branch main`.
6. Đặt APP_ORIGIN trong wrangler.jsonc đúng địa chỉ Pages production. Preview domain khác không được đăng nhập vào dữ liệu production.
7. Tạo ba khóa ngẫu nhiên tối thiểu 32 byte, lưu vào Cloudflare Workers Secrets bằng `npx wrangler secret put NAME`: PASSWORD_PEPPER, BACKUP_SIGNING_KEY, BOOTSTRAP_TOKEN. Không ghi khóa vào Git, VITE_*, mã frontend hoặc tệp sao lưu.
8. `npm run api:deploy`; `npm run pages:deploy`.

Cấu hình Pages ở pages/wrangler.jsonc, Worker ở wrangler.jsonc. Không dùng --config tùy ý cho Pages vì CLI yêu cầu tên chuẩn trong thư mục Pages.
Nếu Windows chặn esbuild khi duyệt thư mục cha, chạy CLI từ một ký tự ổ đĩa tạm ánh xạ đúng thư mục dự án bằng SUBST; chỉ gỡ ánh xạ ổ tạm sau khi kết thúc. Không thay đổi quyền của cả thư mục người dùng.

## Admin đầu tiên và tài khoản nhân viên

`node scripts/bootstrap-admin.mjs https://TEN-DU-AN.pages.dev` yêu cầu nhập tên đăng nhập, mật khẩu và secret BOOTSTRAP_TOKEN trong terminal. Công cụ che mật khẩu, không nhận mật khẩu qua đối số dòng lệnh. Chỉ hoạt động khi D1 chưa có Admin. Không có mật khẩu mặc định.
Admin tạo tài khoản nhân viên qua giao diện sau khi thêm nhân sự; không có đăng ký công khai và không có bộ chọn quyền Admin.
Khóa tài khoản sẽ xóa mọi session của tài khoản và đóng WebSocket. Đổi mật khẩu kết thúc mọi session. Không tự khóa Admin tại giao diện.

Mật khẩu được dẫn xuất PBKDF2-HMAC-SHA256 600.000 vòng với salt ngẫu nhiên 32 byte trên thiết bị bằng WebCrypto; chỉ gửi proof tương đương mật khẩu qua HTTPS. Workers lưu HMAC(proof + salt) với PASSWORD_PEPPER tách khỏi D1. Thiết kế này tránh vượt CPU Workers Free vì KDF không chạy trên backend. Không ghi log proof, mật khẩu hoặc cookie. Đổi PASSWORD_PEPPER tùy tiện sẽ làm mất khả năng đăng nhập của các tài khoản hiện có; cần có kế hoạch đặt lại mật khẩu khi luân chuyển.
Session ngẫu nhiên 256 bit, chỉ lưu SHA256 của token trong D1; cookie __Host-duty_session có HttpOnly, Secure, SameSite=Strict, thời hạn 8 giờ. Mutation kiểm tra Origin và CSRF token ràng buộc session. ALLOW_LOCAL_HTTP chỉ dùng cục bộ và phải false ở production. Giới hạn thử đăng nhập theo IP và tên tài khoản.

## Tính nguyên tử và realtime

D1 batch() chạy nguyên tử. Mutation bắt đầu bằng guard SQL kiểm tra expected_revision; trigger RAISE(ABORT) làm rollback toàn bộ batch khi một người khác đã sửa dữ liệu. Đề nghị đổi ca và lịch được kiểm tra lại trên backend, chỉ người nhận được xác nhận. Cùng chức danh, người đang hoạt động, không trùng ca, không có nghỉ đã duyệt, ca không khóa, đủ khoảng nghỉ theo cấu hình. Cập nhật hai ca, trạng thái, lịch sử, nợ ca, thông báo và audit trong cùng batch.

Mỗi mutation thành công mới phát invalidation đến Durable Object. Sự kiện chỉ chứa revision/kind, không chứa tên, mật khẩu, hồ sơ hoặc lịch. Các trình duyệt tải snapshot mới từ D1. Snapshot lấy bằng một D1 batch nên không trộn nửa giao dịch.
WebSocket xác thực bằng session và Origin trước khi nâng cấp. Tự kết nối lại với backoff; online/focus tải lại snapshot. Ping/pong chỉ kiểm tra kết nối, không polling lịch. Sau đăng xuất/khóa/hết phiên, client phải đăng nhập lại. Nếu không phát được sự kiện sau ba lần thử, bản ghi D1 vẫn đã được lưu; lỗi được ghi log. Đăng ký lại hoặc chuyển về tab sẽ đối soát D1. Không thể bảo đảm không bao giờ mất thông báo khi nền tảng mạng bị lỗi; D1 luôn là nguồn chính.

## Sao lưu và khôi phục

Cron `0 19 * * *` tương ứng 02:00 Việt Nam. Dữ liệu phân trang 200 dòng, kiểm tra revision trước/sau để phát hiện thay đổi trong lúc sao lưu. Tệp JSON có schemaVersion, SHA256 và HMAC với BACKUP_SIGNING_KEY. Chỉ Admin được tạo/tải/khôi phục. Giữ 30 ngày; tệp có dữ liệu nội bộ và password hash nên không chia sẻ công khai.

Tài khoản hiện tại chưa bật R2. Cấu hình đang triển khai dùng bảng backup_object_chunks trên D1, không cần phương thức thanh toán. Đây là phương án thay thế, **không phải đã hoàn thành triển khai R2**. Khi người dùng chủ động bật R2 và chấp nhận điều kiện của Cloudflare, tạo bucket riêng tư lich-truc-na-ri-backups và deploy với wrangler.r2.jsonc; không bật public access. Có thể xuất và tải bản sao lưu D1 trước khi chuyển để tránh thất lạc bản cũ.

Khôi phục: vào Sao lưu & Khôi phục → tải bản thành công → lưu riêng. Khi cần phục hồi, chọn đúng tệp, nhập KHOI PHUC. Backend kiểm tra chữ ký, schema và giới hạn, tạo backup hiện tại trước rồi phục hồi các bảng trong một D1 batch nguyên tử. Mọi session bị xóa; đăng nhập lại bằng tài khoản trong bản sao lưu. File bị sửa hoặc sai hệ thống bị từ chối. Giữ bí mật BACKUP_SIGNING_KEY và PASSWORD_PEPPER ngoài mã nguồn để có khả năng phục hồi.
Nếu mất cả D1, tạo database mới, áp dụng migration và secrets ban đầu, khởi tạo Admin tạm rồi dùng giao diện phục hồi tệp đã tải; sau khôi phục Admin tạm được thay bằng các tài khoản trong bản sao lưu.

## Hạn mức và điểm cần theo dõi

Workers Free, D1 và DO có hạn mức. Không tự nâng cấp hay tự tạo thanh toán. Sao lưu D1 dùng chung hạn mức dung lượng và ghi của D1; theo dõi dashboard, giữ retention 30 ngày. Bản sao lưu ứng dụng hiện giới hạn 4 MiB và 15.000 dòng khi khôi phục; vượt giới hạn sẽ báo lỗi, không khôi phục một phần. Mỗi lần lưu quản lý tối đa 350 câu SQL thay đổi; chia nhập theo tháng. Hệ thống phù hợp dữ liệu trường quy mô nhỏ, không tuyên bố hoạt động vô hạn miễn phí.
Cron production đã cấu hình, nhưng chỉ có thể xác nhận lịch tự chạy sau khi tới thời điểm thực và xuất hiện backup_logs tương ứng. R2 và kiểm thử bằng hai thiết bị vật lý cần xác nhận riêng nếu chưa thực hiện.
