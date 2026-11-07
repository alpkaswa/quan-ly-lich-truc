# Chuyển đăng nhập sang Google trên Cloudflare

## Trạng thái
Mã nguồn đã có Google Identity Services ở giao diện và xác minh chữ ký Google JWT ở Workers bằng jose. Không dùng Firebase hoặc Supabase. D1, Durable Objects WebSocket, lịch và đổi ca được giữ nguyên. Đã cấu hình Client ID người dùng cung cấp, áp dụng migration 0003 và triển khai Workers/Pages. API cấu hình Google trả configured=true; token không hợp lệ bị từ chối. Chưa có phiên đăng nhập Google thật do người dùng thực hiện để nghiệm thu toàn bộ luồng.

## Cấu hình duy nhất còn cần
1. Mở Google Cloud Console → Google Auth Platform → Clients (hoặc APIs & Services → Credentials).
2. Chọn/tạo OAuth client loại Web application.
3. Trong Authorized JavaScript origins thêm chính xác `https://lich-truc-na-ri.pages.dev` (không có dấu / cuối), và `http://localhost:3000` nếu thử cục bộ.
4. Cấu hình Branding/Audience của ứng dụng. Nếu Google yêu cầu người dùng thử nghiệm thì thêm các tài khoản cần kiểm thử, hoặc hoàn tất thiết lập để phát hành cho đối tượng mong muốn.
5. Sao chép Client ID đuôi .apps.googleusercontent.com. Đây là cấu hình công khai; không cần gửi Client Secret. Luồng Google Identity Services hiện tại không dùng Client Secret.
6. Đặt GOOGLE_CLIENT_ID trong vars của wrangler.jsonc. ADMIN_GOOGLE_EMAIL được đặt ở backend là nghiapipi123@gmail.com theo tài khoản chủ dự án; không đưa quyền từ frontend hoặc dựa vào tên hiển thị.
7. Áp dụng migration 0003_google_identity.sql cho D1, deploy Worker rồi deploy Pages. Sau đó kiểm thử bằng Google thực sự.

## Tài khoản và quyền
Mỗi người tự đăng nhập Google, Workers kiểm tra chữ ký JWKS, issuer, audience, exp, iat, email_verified và nonce khớp cookie HttpOnly có chữ ký. Nonce được ghi một lần trong D1 để chặn replay. Không lưu Google token trong LocalStorage.
Chủ sở hữu có email Google đã xác minh khớp ADMIN_GOOGLE_EMAIL được liên kết với Admin ban đầu; sau khi liên kết tài khoản này không còn mật khẩu nội bộ. Người khác tự tạo tài khoản EMPLOYEE. Không có bộ chọn quyền Admin. Backend vẫn kiểm tra active và nhân sự.
Không còn thao tác Admin liên kết tài khoản. Hệ thống tự nhận diện hồ sơ nhân sự qua email Google đã xác thực trùng duy nhất email nhân sự đang hoạt động. Mọi người đăng nhập được đều xem lịch chung và gửi đơn nghỉ phép. Đổi ca cần xác định đúng hồ sơ nhân sự theo email để bảo vệ ca trực. Admin có thể khóa/mở khóa tài khoản trên D1.
Ở production, đăng nhập/chỉnh mật khẩu nội bộ và tạo tài khoản bằng mật khẩu bị vô hiệu hóa; đã xóa các route và công cụ cấp tài khoản/mật khẩu cũ khỏi mã vận hành. ALLOW_LOCAL_HTTP chỉ điều khiển cookie cục bộ; không được bật trên production.

## Những gì đã kiểm tra
TypeScript và build đã chạy. Các kiểm tra JWT dùng khóa RSA độc lập chỉ là kiểm tra mật mã, không thay thế đăng nhập Google thật. Cần kiểm thử Google của Admin và nhân viên trên domain production sau khi có Client ID.
Tham khảo chính thức: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid và https://developers.google.com/identity/gsi/web/guides/verify-google-id-token.
