# Phân quyền Admin/User — 03/11/2026

## Cách sử dụng

Mở **Quản lý → Tài khoản**. Mỗi tài khoản có nhãn vai trò ADMIN hoặc USER và nút **Cấp quyền Admin** / **Thu hồi quyền Admin**. Xác nhận tên người nhận trước khi đổi quyền. Có thể cấp cho nhiều nhân sự, lần lượt từng tài khoản.

Tài khoản được cấp/thu hồi quyền phải đăng nhập lại; mọi phiên cũ và WebSocket của tài khoản đó bị thu hồi. Thu hồi quyền không xóa tài khoản hoặc dữ liệu nhân sự. Tài khoản tiếp tục dùng chức năng User nếu hồ sơ nhân sự đang hoạt động; backend yêu cầu gắn hồ sơ hợp lệ trước khi thu hồi quyền của tài khoản chưa có hồ sơ.

Bộ lọc vai trò, danh sách tất cả Admin, người cấp/thời điểm cấp, lịch sử thay đổi quyền và nhật ký hoạt động nằm ngay trong trang tài khoản. Nhật ký có nút Xem thêm. Admin có từ trước khi bổ sung chức năng được ghi rõ chưa có bản ghi người cấp, không suy đoán thông tin quá khứ.

Admin có thể khóa/mở khóa Admin khác khi còn Admin hoạt động thay thế. Không thể khóa hoặc thu hồi Admin hoạt động cuối cùng. Admin vẫn gửi được đơn nghỉ cá nhân chờ duyệt và sử dụng chức năng đổi ca.

## Kiểm soát backend

- POST `/api/accounts/role`: chỉ Admin; cần `uid`, `role` ADMIN/USER, `expectedRole` và `confirm:true`. USER bên giao diện vẫn ánh xạ EMPLOYEE trong database hiện tại, không chuyển đổi/xóa dữ liệu.
- Chặn tự nâng quyền, vai trò không hợp lệ, yêu cầu không xác nhận, trạng thái quyền cũ đã thay đổi. Cấp quyền chỉ cho tài khoản hoạt động có hồ sơ nhân sự hoạt động.
- Kiểm tra quyền Admin của người thực hiện ngay trong transaction cho các thao tác quản trị. CAS đảm bảo hai thao tác đồng thời không cùng loại bỏ Admin cuối.
- Cập nhật quyền, đóng lịch sử phiên, xóa phiên cũ và ghi audit trong một transaction; phát sự kiện thu hồi WebSocket sau commit.
- Việc tạo phiên đăng nhập kiểm tra lại vai trò hiện hành để không trả phiên với quyền cũ khi trùng thời điểm phân quyền.
- Audit ghi actor ID/tên, người nhận ID/tên, quyền cũ/mới, thời gian, người cấp. API nhật ký chỉ Admin đọc được; nhật ký hoạt động trả metadata, không trả toàn bộ dữ liệu snapshot hoặc mật khẩu.

## File thay đổi

- `worker/index.mjs`: API phân quyền/nhật ký, kiểm tra Admin cuối, khóa Admin và cấp phiên đúng vai trò.
- `worker/database.mjs`: xác nhận quyền người thực hiện trong transaction quản trị.
- `src/components/AccountsView.tsx`, `AccountAudit.tsx`, `src/services/api.ts`: nút xác nhận, vai trò, danh sách Admin, thông tin cấp quyền và nhật ký.
- `src/components/AccountLeaves.tsx`: Admin cũng có biểu mẫu gửi đơn cá nhân chờ duyệt.
- `scripts/integration-roles.mjs`, `scripts/integration-local.mjs`, `tests/sidebar.test.mjs`, `package.json`: kiểm thử riêng và tích hợp.

Không cần migration mới. Dùng bảng `users`, `sessions`, `login_history`, `audit_logs` sẵn có. Không đổi database_id.

## Kiểm thử

- `npm run check`: 55 kiểm thử đạt, TypeScript và build frontend/Worker thành công; còn cảnh báo bundle frontend lớn.
- `npm run integration`: toàn bộ đạt trên D1/workerd/Durable Objects local. Gồm 28 kiểm tra bảo mật tài khoản, 43 kiểm tra API và 50 WebSocket, 6 kiểm tra adapter mất mạng/kết nối lại, backup/restore và **34 kiểm tra phân quyền mới**.
- Phân quyền mới kiểm tra cấp/thu hồi/đăng nhập lại, chặn User và phiên cũ, nhật ký đầy đủ, Admin gửi đơn cá nhân, nhiều Admin, khóa Admin, hai Admin cùng tự thu hồi và bảo vệ Admin cuối cùng. Admin ban đầu được mở lại và đăng nhập thành công trong fixture local.
- Không cấp/thu hồi/khóa tài khoản production để kiểm thử. Chỉ đối chiếu dữ liệu, kiểm tra triển khai và truy cập ẩn danh trên production.

Bản sao lưu trước triển khai nằm ngoài gói mã nguồn tại thư mục work riêng. Không đưa dữ liệu production, session fixture hoặc secret vào ZIP bàn giao.

## Triển khai

Đã triển khai Worker `fafbd525-87bb-4971-ac1a-ff19d38eb7bd` và Pages `b8c42cb7`. Production trả frontend/health 200, API nhật ký và đổi quyền trả 401 khi chưa đăng nhập. Số lượng trước/sau không đổi: 4 tài khoản, 1 Admin hoạt động, 18 nhân sự, 29 ca, 1 đơn nghỉ, 356 bản ghi lịch sử. Không thay đổi quyền thật của tài khoản production trong quá trình kiểm thử.
