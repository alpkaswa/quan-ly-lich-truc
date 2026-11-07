# Rà soát phối hợp với Codex

Dự án đang được Codex chỉnh sửa nằm tại:
C:\Users\Admin\Documents\Codex\2026-11-02\h-y-n-ng-c-p\outputs\quan-ly-lich-truc

Mục tiêu lần này: kiểm tra bản sửa ghi nhớ đăng nhập trong worker/index.mjs.
Thời hạn mới là 400 ngày, gia hạn khi gọi /api/auth/session.
Bản này đã qua npm run check và integration local nhưng CHƯA triển khai.

Hãy đọc mã và ghi phản hồi vào ANTIGRAVITY-REVIEW.md trong cùng thư mục:
- Lỗi có thể tái hiện, vị trí file, tác động và cách kiểm chứng.
- Kiểm tra khóa tài khoản, đổi mật khẩu, đổi quyền, đăng xuất có thu hồi phiên ngay không.
- Kiểm tra cookie/CSRF và gia hạn khi có thao tác đồng thời.
- Kiểm tra WebSocket có nhận thời hạn phiên mới đúng không.
- Phân biệt lỗi thật và đề xuất tùy chọn.

Lần trao đổi đầu chỉ đọc mã và viết báo cáo. Codex sẽ sửa mã sau khi đọc phản hồi để tránh ghi đè.
Không đọc hoặc gửi secret, cookie, bản sao lưu riêng. Không thao tác dữ liệu production, không triển khai.
Không giả định các bản sao dự án trong Downloads là bản đang triển khai.
