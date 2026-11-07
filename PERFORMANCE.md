# Đo hiệu năng ngày 03/11/2026

Đã chạy máy chủ workerd + D1 + Durable Object cục bộ, 50 WebSocket thật; 49 yêu cầu đọc lịch đồng thời. Dữ liệu kiểm thử tách biệt production. Chi tiết mẫu đo trong PERFORMANCE-LOCAL.json.

| Nhóm API thành công | Số mẫu | P50 | P95 | Lớn nhất |
|---|---:|---:|---:|---:|
| Đọc lịch (gồm đợt đồng thời) |53|695 ms|705 ms|705 ms|
| Lưu lịch/nhân sự |2|43 ms|43 ms|43 ms|
| Gửi/xác nhận đổi ca |2|45 ms|45 ms|45 ms|

Các số liệu là thời gian HTTP và đọc JSON trên localhost, không đại diện đường truyền Internet hay Cloudflare production. Mẫu ghi còn ít, chưa phải kiểm thử tải kéo dài. Chưa đo riêng từ commit đến khi 50 giao diện hiển thị; không khẳng định đạt SLA realtime 2 giây.

Đã tối ưu tra cứu ca liền kề bằng bản đồ ngày, bỏ sự kiện revision trùng, trả phản hồi ngắn khi lịch chưa thay đổi; bổ sung chỉ mục email nhân sự và đơn nghỉ theo tài khoản. Giao diện có thông báo khi lưu quá 5 giây.

Còn cần hoàn thiện/đo riêng: thay đổi chức danh/ngừng hoạt động có lịch ràng buộc, xác nhận tác động đến lịch được phê duyệt ngoài trạng thái khóa, truy vấn tìm kiếm có phân trang theo ngày/tuần/tháng, nhiều yêu cầu đổi ca đồng thời, đo tải production và tìm kiếm nhiều tháng. Chưa xác nhận toàn bộ yêu cầu dưới 5 giây đã đạt.
