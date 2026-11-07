# Lịch trực nội trú Na Rì

Ứng dụng nội bộ React + TypeScript. Admin và nhân viên tự đăng nhập Google. Quyền Admin do cấu hình máy chủ xác định; người dùng không tự chọn quyền. Nhân viên gửi đơn nghỉ phép trực tiếp bằng tài khoản Google. Hệ thống tự nhận diện hồ sơ nhân sự qua email Google đã xác thực trùng duy nhất email nhân sự đang hoạt động.

Giao diện chính: hôm nay/ngày mai, lịch tháng, đổi ca, nghỉ phép, thống kê, in lịch. Admin mở **Quản lý** để dùng nhân sự, xếp lịch, tài khoản, trực bù, sao lưu và kiểm tra thuật toán. Các chức năng cũ được giữ lại.

## Mở để sửa bằng VS Code hoặc Codex

Mở thư mục này hoặc tệp `LICH-TRUC.code-workspace`. Đây là toàn bộ mã nguồn; không cần trình tạo website để chỉnh sửa. Trong Codex, chọn thư mục này làm dự án.

1. Cài Node.js bản LTS và mở Terminal trong thư mục dự án.
2. Chạy `npm ci` một lần để cài thư viện.
3. Chạy `npm run check` để kiểm tra kiểu dữ liệu, kiểm thử và tạo bản dựng giao diện/máy chủ.
4. Chạy `npm run dev` để sửa giao diện; trình duyệt tự cập nhật. Máy chủ API chạy riêng bằng `npm run api:dev` và cơ sở dữ liệu cục bộ chuẩn bị bằng `npm run db:local`.
5. Xem hướng dẫn chi tiết trong `BAO-TRI.md` trước khi cấu hình Google và cập nhật trực tuyến.

VS Code có các tác vụ tương ứng tại Terminal > Run Task. Chỉnh sửa máy cục bộ không tự thay đổi website trực tuyến; cần triển khai sau khi kiểm tra.

## Đồng bộ

Cloudflare D1 là nguồn dữ liệu chung. Durable Object gửi thông báo WebSocket sau khi giao dịch lưu thành công. Các thiết bị nhận thông báo sẽ đọc lại dữ liệu thật từ máy chủ. Không mô phỏng realtime, không tự nạp dữ liệu mẫu. Khi mất mạng, ứng dụng báo trạng thái; khi kết nối lại sẽ tải dữ liệu mới nhất. Không xếp hàng ghi ngoại tuyến để tránh ghi đè lịch đã thay đổi.

Đổi ca kiểm tra lại người nhận, chức danh, ca khóa, nghỉ phép và thời gian nghỉ. D1 batch cùng kiểm tra phiên bản ngăn hai thay đổi đồng thời ghi đè nhau. Mục tiêu vận hành 20–50 người; giới hạn hiện tại 150 kết nối và 6 kết nối mỗi phiên. Đã kiểm tra 50 kết nối WebSocket thật cùng API và D1 trên máy chủ cục bộ tách biệt. Đây chưa phải thử tải 50 người thật trên hạ tầng trực tuyến. Xem TEST-RESULTS.md để biết phạm vi và giới hạn.

## Triển khai

Website: https://lich-truc-na-ri.pages.dev

Cloudflare Pages phục vụ giao diện và gọi Worker qua service binding riêng. Worker dùng D1, Durable Object và sao lưu hằng ngày vào D1. R2 chưa được bật. Xem `CLOUDFLARE.md`, `GOOGLE-SIGN-IN.md`, `.dev.vars.example` và `BAO-TRI.md`. Không bật thanh toán hoặc dịch vụ trả phí để triển khai bản này. Hạn mức gói miễn phí vẫn áp dụng; không có cam kết miễn phí vô hạn.

Không đưa `.dev.vars`, khóa OAuth đăng nhập công cụ, cookie phiên, thư mục `.wrangler` hoặc khóa bảo mật vào Git. Google Web Client ID là công khai; luồng đăng nhập này không dùng Google Client Secret trong frontend.


## Tự phân ca khi thêm nhân sự

Thêm một người hoặc nhập nhiều người: khi lưu danh sách, máy chủ tự bổ sung vị trí trống đúng chức danh (2 giáo viên, 1 BGH, 1 bảo vệ), sau đó san sẻ ca tương lai để giảm chênh lệch số ca trong từng nhóm. Không đổi người đang trực hôm nay, ca quá khứ hoặc ca khóa. Kiểm tra nghỉ phép đã duyệt, trùng người trong ca và nghỉ tối thiểu 24 giờ. Lưu danh sách, lịch và lịch sử cùng một giao dịch; các thiết bị nhận kết quả qua WebSocket. Khi không đủ người phù hợp, thông báo số vị trí còn thiếu. Cần có lịch tháng trước để hệ thống có ngày trực cần phân bổ.


## Ca trực của tôi và tra cứu

Mục **Ca trực của tôi** nhận diện theo hồ sơ có email Google khớp, hiện ngày trực, vị trí, giờ bắt đầu/kết thúc và toàn bộ đồng nghiệp cùng ca. Mặc định hiện ca đang trực và sắp tới; có thể chọn tất cả ngày hoặc ngày cụ thể. Mục **Tìm ca trực** cho phép nhập tên không dấu, mã nhân sự hoặc số điện thoại, rồi bấm vào tên để xem lịch. Bấm tên trên bảng lịch tháng cũng mở danh sách này. Các danh sách tự cập nhật cùng lịch chung sau đổi ca.


## Xóa tất cả nhân sự

Admin mở Nhân sự > Xóa tất cả nhân sự. Hộp xác nhận hiện số nhân sự và dữ liệu liên quan trên toàn bộ danh sách, không chỉ dòng đang lọc. Nếu có ràng buộc, Admin cần tích đồng ý xóa cả phân công, đơn nghỉ phép nhân sự và đề nghị đổi ca liên quan. Phạm vi bao gồm cả phân công quá khứ và ca khóa. Sau đó nhập đúng XOA TAT CA NHAN SU để bật nút xác nhận.

Máy chủ tạo bản sao lưu trước khi xóa và thực hiện cùng một giao dịch. Giữ tài khoản Google, nhật ký hoạt động, các ngày trực và trạng thái khóa; các ngày trực sẽ trống người và mang trạng thái chưa đủ người. Nếu không chọn xóa dữ liệu liên quan thì hệ thống không tự xóa chúng. Đơn nghỉ cá nhân chưa gắn với hồ sơ nhân sự không bị xóa theo thao tác này.


## Người nhận hoặc Admin duyệt đổi ca

A gửi đề nghị cho B: lịch chỉ đổi khi B đồng ý hoặc Admin chấp nhận. B cũng có thể gửi ngược lại A cho những ca hợp lệ. Nếu hai người xử lý đồng thời, một giao dịch được ghi nhận; không đổi hai lần. Mục Lịch bận & Nghỉ phép hiển thị danh sách đơn của mọi nhân viên và phần đề nghị đổi ca. Đơn nghỉ phép luôn chờ Admin duyệt; mọi nhân viên được xem, nhưng chỉ chủ đơn được rút đơn đang chờ.
