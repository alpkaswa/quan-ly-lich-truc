# Chạy, sửa và cập nhật ứng dụng

## Vị trí cần sửa

- `src/components/Sidebar.tsx`: menu đơn giản và nhóm Quản lý.
- `src/components/LiveOverview.tsx`: lịch hôm nay/ngày mai.
- `src/App.tsx`: kết nối các màn hình và thao tác cũ.
- `src/components/AccountLeaves.tsx`: nghỉ phép bằng Google.
- `src/components/SwapView.tsx`: gửi/nhận đổi ca.
- `src/services/storage.ts`: nhận WebSocket, tải dữ liệu, tự kết nối lại.
- `worker/index.mjs`: đăng nhập, phân quyền, API lưu dữ liệu.
- `shared/domain.mjs`: kiểm tra và xử lý đổi ca.
- `worker/realtime.mjs`, `worker/room.mjs`: gửi thông báo tới các thiết bị.
- `migrations/`: cấu trúc dữ liệu; thêm tệp mới, không sửa migration đã chạy.
- `tests/`: kiểm thử bảo vệ các hành vi chính.

## Chạy cục bộ

Chạy `npm ci`, sao chép `.dev.vars.example` thành `.dev.vars` và tự điền khóa dành riêng cho môi trường thử nghiệm. Không dùng khóa bảo mật vận hành cho thử nghiệm. Khởi tạo dữ liệu cục bộ bằng `npm run db:local`, rồi mở hai Terminal chạy `npm run api:dev` và `npm run dev`.

Để đăng nhập Google thật trên máy cục bộ, cần thêm `http://localhost:3000` vào Authorized JavaScript origins của OAuth Web Client, đặt APP_ORIGIN tương ứng cho Worker cục bộ và ALLOW_LOCAL_HTTP=true. Các biến trong `.dev.vars` chỉ dành cho máy cục bộ. Cấu hình Worker production vẫn phải dùng HTTPS và ALLOW_LOCAL_HTTP=false. Không thay đổi nguồn dữ liệu production để thử nghiệm.

## Cập nhật trực tuyến sau khi sửa

1. Chạy `npm run check`. Chỉ triển khai khi đạt.
2. Đăng nhập Cloudflare CLI bằng `npx wrangler login` nếu chưa có phiên hợp lệ.
3. Nếu thay đổi dữ liệu, tạo bản sao lưu trong ứng dụng trước, sau đó chạy `npx wrangler d1 migrations apply DB --remote`.
4. Chạy `npm run api:deploy`. Nếu thất bại, dừng và sửa; chưa cập nhật giao diện.
5. Chạy `npm run pages:deploy`.
6. Mở website, kiểm tra đăng nhập Google, hôm nay/ngày mai và trạng thái kết nối. Hai tài khoản mở trên hai thiết bị: gửi yêu cầu đổi ca thật và xác nhận với người liên quan; thiết bị còn lại phải cập nhật không cần tải trang. Không tạo đổi ca thử trên lịch thật nếu chưa thống nhất với người liên quan.

Trên một số máy Windows, công cụ đóng gói gặp lỗi đọc đường dẫn dài hoặc quyền thư mục. Có thể dùng một ổ đĩa ảo trỏ tới đúng thư mục dự án bằng SUBST rồi chạy các lệnh từ ổ đó. Không chuyển hoặc xóa dữ liệu để khắc phục lỗi này.

## Khi phát sinh lỗi

- Ghi lại thời điểm và thao tác vừa thực hiện; chụp thông báo lỗi, không chụp khóa bảo mật/cookie.
- Mất kết nối: kiểm tra mạng, bấm Đồng bộ lại; không nhập lại hàng loạt trước khi thấy dữ liệu mới nhất.
- Báo dữ liệu vừa thay đổi: người khác đã lưu trước. Xem lại lịch mới rồi thao tác lại; không ép ghi đè.
- Google báo no registered origin: kiểm tra đúng Client ID và origin của website, không dùng đường dẫn con hoặc địa chỉ preview khác.
- Trang không hiển thị: nút Tải lại ứng dụng lấy bản mới từ máy chủ. Nếu lỗi lặp lại, mở VS Code/Codex, kiểm tra Console và log Worker; chạy kiểm thử sau khi sửa.
- Lỗi sau phát hành: dùng Cloudflare Pages Deployments để quay về bản giao diện trước và Workers Versions để quay về bản máy chủ tương thích. Không tự phục hồi database vì lỗi giao diện. Việc khôi phục dữ liệu cần bản sao lưu và kiểm tra tương thích cấu trúc.

Không thể bảo đảm phần mềm tuyệt đối không bao giờ lỗi. Bản này có kiểm thử, kiểm tra quyền, giao dịch chống xung đột, thông báo lỗi và nguồn mã để sửa ngay khi phát hiện vấn đề. Kiểm thử tự động không thay thế nghiệm thu Google thật trên hai thiết bị hoặc đo tải thực tế 50 người.


## Kiểm thử tích hợp 50 kết nối, hoàn toàn cục bộ

Các lệnh dưới đây dùng D1 cục bộ tại `.wrangler/integration-20261103`, API ở cổng 8791, WebSocket thật và dữ liệu kiểm thử tách biệt. Không dùng database vận hành. Các phiên kiểm thử được tạo trực tiếp trong database cục bộ để kiểm tra API/phân quyền; không thay thế việc đăng nhập Google thật trên hai thiết bị.

1. Đảm bảo `.dev.vars` có APP_ORIGIN=http://localhost:3000 và ALLOW_LOCAL_HTTP=true cùng các khóa cục bộ riêng như phần trên.
2. Dừng máy chủ kiểm thử cũ nếu đang chạy. Chạy `npm run integration:prepare`. Lệnh này làm mới toàn bộ dữ liệu trong database **kiểm thử cục bộ**, không đụng database trực tuyến.
3. Terminal thứ nhất: `npm run integration:server`.
4. Terminal thứ hai: `npm run integration:test`.
5. Bộ kiểm thử gồm 38 bước API/50 WebSocket thật, 6 bước adapter trình duyệt/mất mạng/kết nối lại/thu hồi phiên, 4 bước sao lưu/khôi phục. Bước cuối khôi phục sẽ hủy phiên kiểm thử; muốn chạy lại phải thực hiện lại bước 2 sau khi dừng server.
6. Dừng máy chủ cục bộ sau khi xong. Không tải `.wrangler`, session fixture hoặc seed SQL lên hosting/Git.

Nếu môi trường Codex không cho công cụ ghi log vào thư mục mặc định của Windows, đặt XDG_CONFIG_HOME tới một thư mục làm việc riêng được phép ghi trước khi chạy Wrangler. Không cần cấp quyền truy cập khóa tài khoản để chạy kiểm thử cục bộ.

Thuật toán tự phân ca khi bổ sung nhân sự nằm trong `shared/autoRoster.mjs`; được gọi phía máy chủ tại luồng lưu `/api/state`. Không cần sửa riêng từng màn hình nhập một người hoặc nhập Excel.

### Nhập Excel báo nhân sự không đúng chức danh
Trong Nhân sự, xem trước kết quả và chọn Chỉ thêm mới nếu cần bổ sung người. Mã đã tồn tại giữ nguyên định danh và các ca đang phân. Khi cập nhật chức danh hoặc thay thế danh sách, xem cảnh báo mã, chức danh và ngày trực xung đột trước khi xác nhận. Đối chiếu src/services/exportService.ts (đọc cột), EmployeeImportModal.tsx (xem trước) và shared/domain.mjs (kiểm tra phân công). Kiểm thử bằng tệp gây lỗi trên local. Không xóa ca hoặc đổi mã của người cũ để vượt kiểm tra.
