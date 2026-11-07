# Rà soát và phạm vi thay đổi

Nguồn đầu vào: ZIP React/TypeScript gốc và bản nâng cấp trong phiên làm việc này. Đã kiểm kê các module giao diện, kiểu dữ liệu, lịch/nghỉ phép/trực bù, nhập/xuất, thuật toán, kiểm thử cũ; kiểm tra import và kiểu dữ liệu bằng TypeScript trên toàn bộ cây mã nguồn.

Hiện trạng gốc: dữ liệu mẫu/LocalStorage, đăng nhập Google mô phỏng và quyền tự chọn; không có backend dùng chung. Bản trung gian dùng Firebase đã được lưu ngoài gói bàn giao để có thể đối chiếu, không còn là phụ thuộc runtime.

Giữ: React/TypeScript, phong cách sidebar/header, các màn hình quản lý, thuật toán xếp lịch và thuật toán đồng bộ có xem trước, nhập Excel, thống kê, in và xuất lịch. Dữ liệu mẫu gốc giữ ở examples/sampleData.ts. Không khởi tạo nhân sự/lịch mẫu vào D1 production.

Thay: session/token và quyền kiểm tra backend; D1 là nguồn duy nhất; WebSocket qua DO; thêm backups/restore/notifications, migration, Pages proxy và tài liệu vận hành.

Sửa lỗi: bỏ tự đổi quyền Admin; bỏ tự gán nhân sự mới vào lịch ngay sau thêm/nhập; sửa ngày/giờ Việt Nam tại trang chủ và mặc định lập lịch; bỏ số điện thoại/email giả tự điền; khôi phục cần xác nhận và backup an toàn; chặn stale writes; đổi ca có xác nhận, kiểm tra lại và transaction guard. Lỗi mạng không được coi là lưu thành công.

Không dùng lại dữ liệu test để mô phỏng kết nối thật. Bộ tích hợp chạy với workerd và với dịch vụ Cloudflare trực tuyến; toàn bộ fixture live đã được dọn bằng baseline restore. Những phần chưa kiểm chứng thực tế nằm trong TEST-RESULTS.md.
