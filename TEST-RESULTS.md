**Cập nhật 04/11/2026:** Lỗi sao lưu lớn đã được sửa và bản tự động 02:00 trên production đã được xác minh. Kết quả và giới hạn mới: [Vận hành và kiểm thử](VAN-HANH.md). Nội dung bên dưới là kết quả các đợt trước.

## Kiểm thử độ ổn định — 03/11/2026

Xem STABILITY-REPORT.md và số đo STABILITY-LOCAL.json. Đạt 56 kiểm thử cùng bộ integration; thử tải 50 tài khoản/730 ngày lịch, 1.000 lượt đọc, 10 lượt lưu cạnh tranh và phục hồi sau restart local. Phát hiện backup production FAILED do vượt 4 MiB; chưa sửa cơ chế backup trong đợt kiểm thử. Đã xuất D1 dự phòng riêng, không thay đổi dữ liệu nghiệp vụ hoặc triển khai ứng dụng.

## Sửa bố cục tiện ích và người gửi đơn — 03/11/2026

- Thông báo/Đổi mật khẩu chuyển từ details chiếm chiều cao sang dialog riêng, cuộn nội dung trong cửa sổ; có nút Đóng, Escape và trả focus về nút mở. Không đổi dữ liệu lịch.
- Đơn nghỉ hiển thị Nhân sự nghỉ và Người gửi riêng. Metadata người gửi lấy từ session server, bỏ qua giá trị giả mạo trên biểu mẫu; Admin tạo đơn qua lưu dữ liệu được ghi nhận là người gửi. Đơn cũ đối chiếu audit gửi đơn; thiếu bằng chứng thì hiển thị chưa có thông tin.
- npm run check: 56 kiểm thử đạt. Bộ integration đạt gồm kiểm tra người gửi, xem đơn từ tài khoản khác, 50 WebSocket và 34 kiểm tra phân quyền. Chưa kiểm tra thao tác dialog trực quan trên điện thoại thật.
- Không thêm migration, không chạy thao tác xóa/khôi phục dữ liệu production.

## Phân quyền Admin/User — 03/11/2026

55 kiểm thử đạt; 34 kiểm tra phân quyền mới và bộ tích hợp hiện có đạt trên local. Xem ROLE-ACCESS.md. Không đổi vai trò của tài khoản production để kiểm thử.

## Bảo mật tài khoản — 03/11/2026

Xem SECURITY-AUDIT.md: 54 kiểm thử đơn vị/render; kiểm thử tích hợp D1/DO và R2 local; production chỉ kiểm tra triển khai, quyền truy cập ẩn danh và đối chiếu số dữ liệu.

## Giao diện trang chủ theo ảnh tham chiếu — 03/11/2026

- Dùng lại DashboardView cho trang chủ: bàn giao, tháng, 6 thống kê, ca đang diễn ra/ca kế tiếp, đơn chờ duyệt, quy tắc trực.
- Tên, bộ phận, điện thoại và tổng nhân sự từng nhóm đọc từ danh sách Nhân sự, bao gồm nhân sự ngừng hoạt động trong tổng số giống danh sách; không thêm dữ liệu mẫu.
- Nhân viên chỉ xem lịch/đề nghị đổi ca; Admin có nút xếp lịch, điều chỉnh và mở thông báo Gmail.
- Bảng kiểm bàn giao là thao tác trên thiết bị, ghi rõ chưa lưu biên bản lên hệ thống.
- `npm run check`: 51 kiểm thử đạt; TypeScript, bản dựng giao diện và Worker thành công. Có kiểm thử render quyền Admin/nhân viên và thông tin người trực.
- Chưa kiểm tra trực quan trên điện thoại thật trong lần cập nhật này. Không thay đổi cơ chế realtime hay dữ liệu trên máy chủ.

# Quyền duyệt đổi ca và danh sách đơn chung — 03/11/2026

50 kiểm thử tự động đạt. Kiểm thử tích hợp cục bộ: 43 bước API/50 WebSocket, 6 bước reconnect/thu hồi phiên và 4 bước sao lưu/khôi phục.

Đổi ca chỉ ghi lịch khi người nhận hoặc Admin chấp nhận, vẫn kiểm tra chức danh, ca khóa, ngày nghỉ và nghỉ giữa ca. Người gửi thường không tự duyệt. Admin và người nhận xử lý đồng thời chỉ thành công một giao dịch. Kiểm tra B gửi đổi ngược lại A và Admin chấp nhận. Danh sách đơn nghỉ phép được chia sẻ cho nhân viên; chỉ chủ đơn rút đơn đang chờ, chỉ Admin duyệt. Không tự duyệt đơn nghỉ của nhân viên. Các thử nghiệm này không sửa dữ liệu production.

---

# Sửa hộp xóa nhân sự có dữ liệu liên quan — 03/11/2026

- 50 kiểm thử tự động đạt. 16 bước tích hợp xóa trên D1 cục bộ đạt.
- Có lựa chọn rõ ràng `deleteRelated=true`, mặc định không chọn. Chỉ khi Admin tích lựa chọn và nhập đúng câu xác nhận mới có thể xóa nhân sự cùng phân công, đơn nghỉ nhân sự và đề nghị đổi ca.
- Kiểm tra với ca đã khóa, đơn nghỉ và đề nghị đổi ca thật trong database kiểm thử: giao dịch xóa hết tham chiếu đúng thứ tự, giữ ngày trực và trạng thái khóa, đặt ca thành INCOMPLETE, giữ tài khoản Google và phiên đăng nhập.
- Tạo bản sao lưu có chữ ký trước khi xóa; kiểm tra revision để ngăn xóa dữ liệu thay đổi sau lúc xem trước. Nếu không chọn xóa liên quan thì backend vẫn chặn.
- Chỉ chạy thao tác xóa trong database cục bộ tách biệt. Chưa xóa dữ liệu production.

---

# Xóa danh sách nhân sự — 03/11/2026

- 50 kiểm thử tự động đạt; kiểm tra TypeScript và hai bản dựng đạt.
- 12 bước tích hợp mới trên D1 cục bộ đạt: Admin-only, xác nhận bắt buộc, kiểm tra revision, chặn xóa khi còn phân công/nghỉ phép/đề nghị đổi ca, không thay dữ liệu khi bị chặn, xóa toàn bộ khi không còn ràng buộc, sao lưu trước xóa, giữ tài khoản Google và phiên đăng nhập.
- Kiểm thử xóa chỉ chạy trên database cục bộ riêng. Không xóa nhân sự hoặc dữ liệu vận hành.
- Nút hiển thị trên trang Nhân sự cho Admin, vô hiệu hóa nếu danh sách trống. Hộp xác nhận cho biết phạm vi toàn bộ danh sách, không chỉ các dòng đang lọc.
- Giữ các ngày trực, lịch sử, tài khoản Google; bỏ tham chiếu hồ sơ trong tài khoản sau khi xóa. Không tự xóa lịch trực, đơn nghỉ hoặc đề nghị đổi ca để vượt qua ràng buộc.

---

# Ca trực cá nhân và tra cứu — 03/11/2026

- 49 kiểm thử tự động đạt; TypeScript và bản dựng giao diện/máy chủ đạt.
- Kiểm tra ca cá nhân lọc đúng ID nhân sự, thứ tự ngày trực, vị trí giáo viên/BGH/bảo vệ, lọc ngày và phạm vi sắp tới.
- Tìm tên tiếng Việt không dấu, mã nhân sự và dữ liệu thiếu điện thoại không gây lỗi.
- Bấm tên trên lịch tháng mở danh sách ca, chặn sự kiện nổi lên để không mở nhầm hộp sửa lịch.
- Nếu chưa nhận diện được hồ sơ qua email Google, hiển thị hướng dẫn; không tự nhận người khác là chủ tài khoản.
- Không thay đổi backend hay nguồn dữ liệu. Danh sách ca sử dụng cùng dữ liệu lịch được WebSocket cập nhật.
- Bộ kiểm thử tích hợp backend 48 bước từ lần cập nhật ngay trước vẫn áp dụng; không tuyên bố đã chạy lại 50 thiết bị hoặc Google tương tác cho thay đổi giao diện này.

---

# Tự phân ca khi thêm nhân sự — 03/11/2026

- 44 kiểm thử tự động đạt; TypeScript và bản dựng giao diện/máy chủ đạt.
- 38 bước tích hợp API + 6 bước kết nối lại adapter + 4 bước sao lưu/khôi phục đạt, tổng 48 bước.
- Thêm 50 nhân sự trong một lần lưu, tự bổ sung 80 vị trí trống; xác minh đúng chức danh và chênh lệch số ca trong từng nhóm không quá 1 với bộ dữ liệu không có xung đột.
- Kiểm tra thêm một người, thêm nhiều nhóm, ca khóa, ca quá khứ, người đang trực, nghỉ phép đã duyệt, nhân sự ngừng hoạt động và khoảng nghỉ 24 giờ.
- Tự phân bổ chạy phía máy chủ trong cùng giao dịch với danh sách nhân sự và lịch sử; WebSocket báo sau commit.
- Việc phân bổ ưu tiên chỗ trống từ hôm nay; chỉ san sẻ lại người đã phân công từ ngày mai. Không thay ca khóa/quá khứ. Nếu không có lịch, hệ thống báo cần tạo lịch tháng trước; không tự bịa ngày trực.
- Các ràng buộc cứng có thể khiến không thể chia đều tuyệt đối hoặc lấp đầy mọi vị trí. Hệ thống giữ chỗ thiếu và thông báo, không xếp sai chức danh hay vi phạm ngày nghỉ để đủ số lượng.

---

# Kết quả hiện tại — 03/11/2026

## Đã đạt

- `npm run check`: 39 kiểm thử tự động, kiểm tra TypeScript, bản dựng React và bản dựng Worker.
- `npm run integration:test`: 33 bước API/50 WebSocket thật, 6 bước adapter ứng dụng và 4 bước sao lưu/khôi phục, tổng 43 bước tích hợp.
- 50 kết nối WebSocket cùng nhận thông báo sau commit; các thiết bị đọc lại D1 thật trên máy chủ cục bộ.
- Hai xác nhận cùng lúc chỉ một giao dịch thành công; lịch hai ngày và lịch sử cập nhật nguyên tử.
- Nhân viên không sửa được lịch/chấp thuận đơn thay Admin, không rút đơn của người khác, không xem danh sách tài khoản hoặc sao lưu.
- Chặn origin/CSRF sai, JSON null; email hồ sơ trùng nhiều người không tự đoán; không nhận hồ sơ đã thuộc tài khoản khác.
- Khi email được nhận diện, đơn cá nhân cũ chuyển cùng hồ sơ và đơn đã duyệt được kiểm tra khi đổi ca, kể cả hồ sơ đã được nhận diện bởi bản trước.
- Mất mạng/kết nối lại: adapter ứng dụng báo ngắt, giữ bản cũ và tự tải bản mới từ D1 khi có mạng; không cần tải trang.
- Khóa người dùng: gửi thông báo hết phiên ngay, hủy session; thiết bị không tiếp tục gọi API được.
- Sao lưu thật trên D1 cục bộ; chặn bản bị sửa, khôi phục nguyên tử, tạo bản an toàn và hủy phiên cũ.
- Log máy chủ sau lượt cuối không có lỗi đóng WebSocket không hợp lệ như trước.

## Các lỗi đã sửa trong đợt này

1. Đơn nghỉ gửi trước khi nhận diện hồ sơ chưa tham gia kiểm tra đổi ca.
2. Lỗi mã đóng WebSocket dành riêng (1005) khi thiết bị đóng kết nối bất thường.
3. Độ trễ kết thúc phiên trên giao diện khi khóa tài khoản; bổ sung sự kiện kết thúc phiên và dừng tự kết nối lại.
4. Thao tác đã commit nhưng mất mạng lúc tải lại bị báo như lưu thất bại.
5. Yêu cầu mạng không phản hồi khiến giao diện chờ quá lâu; thêm thời hạn và hướng dẫn xác minh trước khi gửi lại.
6. So sánh chuỗi bảo mật có thể ném lỗi khi nhận ký tự nhiều byte cùng độ dài ký tự.
7. Nội dung JSON null/array được từ chối bằng thông báo rõ ràng.

## Giới hạn của kết quả

Toàn bộ dữ liệu và phiên kiểm thử tích hợp nằm trong database cục bộ tách biệt, không ghi dữ liệu kiểm thử vào database vận hành. Phiên được cấp trực tiếp trong D1 cục bộ để kiểm tra API sau đăng nhập; đây không phải một lần đăng nhập Google tương tác mới. Chưa thử lại Google trên hai thiết bị vật lý hoặc đo tải 50 người trên Cloudflare production. Google JWT/chữ ký/nonce được kiểm tra bằng bộ kiểm thử mật mã riêng.

Các phần bên dưới lưu lịch sử kiểm thử trước đây; số lượng và trạng thái ở trên là kết quả của bản hiện tại.

---

# Kết quả kiểm thử — 02/11/2026

## Đã chạy thành công

- TypeScript kiểm tra toàn bộ mã nguồn: đạt.
- React production build và Workers build: đạt.
- 13 kiểm tra nghiệp vụ/ngày giờ: đạt. Bao gồm đổi hai ca, trực thay, đề nghị lỗi thời, sai chức danh, trùng người, ca khóa, nghỉ phép, nghỉ giữa ca, nhân sự ngừng hoạt động, ngày không hợp lệ, ca thiếu người và mốc bàn giao 07:00 trên bốn múi giờ thiết bị.
- Kiểm thử tích hợp workerd cục bộ dùng D1, Durable Object và WebSocket thật: đạt.
- Kiểm thử qua HTTPS trên bản triển khai Cloudflare tại lich-truc-na-ri.pages.dev: đạt với hai tài khoản nhân viên và các phiên HTTP/WebSocket độc lập. Không giả lập API, database hoặc sự kiện realtime.

Luồng tích hợp trực tuyến kiểm tra:
1. Chặn đọc lịch khi chưa đăng nhập.
2. Admin đăng nhập, cookie session có HttpOnly/Secure/SameSite=Strict.
3. Admin ghi dữ liệu D1 và tạo hai tài khoản nhân viên.
4. Nhân viên đăng nhập và đọc cùng lịch chung.
5. Chặn nhân viên quản lý tài khoản, sửa lịch, tải backup.
6. Chặn Origin giả mạo và mutation thiếu CSRF.
7. Chặn đề nghị khác chức danh.
8. Gửi đề nghị không làm thay đổi lịch.
9. Chỉ người nhận được xử lý đề nghị.
10. Hai yêu cầu xác nhận đồng thời chỉ một yêu cầu thành công, một nhận 409; lịch hai ngày và lịch sử cập nhật nguyên tử.
11. Người còn lại nhận sự kiện WebSocket và đọc lịch mới từ D1.
12. Từ chối giữ nguyên lịch.
13. Đóng kết nối, sửa dữ liệu khi kết nối đã đóng, kết nối lại và đọc được dữ liệu mới nhất.
14. Ghi bằng phiên bản cũ bị từ chối.
15. Ca khóa và nghỉ đã duyệt bị từ chối ở backend.
16. Khóa tài khoản làm session cũ mất quyền; mở khóa cho phép đăng nhập lại.
17. Đổi mật khẩu kết thúc phiên cũ; đăng nhập bằng mật khẩu mới thành công.
18. Tạo backup, tải về, chặn tệp bị sửa; phục hồi đúng dữ liệu, xóa session và đăng nhập lại.
19. Đăng xuất chặn đọc dữ liệu; dữ liệu vẫn còn sau đăng nhập.
20. Phục hồi baseline và xác minh xóa dữ liệu kiểm thử trực tuyến, chỉ giữ Admin ban đầu.

Kiểm thử Cron handler cục bộ qua endpoint kiểm thử scheduled của Wrangler trả 200. Cron production đã được Cloudflare triển khai với lịch 0 19 * * * (02:00 Việt Nam).
Trang đăng nhập production đã quan sát qua trình duyệt: đúng nhãn tên đăng nhập, mật khẩu và nút đăng nhập.

## Giới hạn kiểm chứng

- Hai client/tài khoản trực tuyến độc lập không tương đương hai thiết bị vật lý. Chưa đăng nhập trên hai điện thoại thật và chưa kiểm thử bố cục sau đăng nhập trên mọi kích thước màn hình.
- Mất mạng được kiểm thử bằng ngắt và nối lại WebSocket; chưa tắt Wi-Fi của thiết bị vật lý.
- Chưa chờ tới 02:00 để quan sát Cron production tự chạy. Tạo/tải/khôi phục backup production đã kiểm thử qua API; cần theo dõi backup_logs sau lần Cron đầu tiên.
- R2 chưa bật trên tài khoản. Đã chuẩn bị module và cấu hình R2, nhưng bản triển khai sử dụng D1 fallback; không tuyên bố R2 production đã hoạt động.
- Chưa kiểm thử tải đồng thời đủ 50 người hoặc xác nhận không bao giờ chạm hạn mức Free. Không bật gói trả phí hoặc phương thức thanh toán.
- Bộ kiểm thử thuật toán cũ vẫn giữ trong dự án, nhưng không dùng các kết quả giả lập đăng nhập cũ để chứng minh tính năng thật.

Bản kiểm thử local: tests/cloudflare.integration.mjs. Chế độ kiểm thử live được khóa bằng biến CF_LIVE_TEST, kiểm tra database còn trống và có đúng Admin ban đầu trước khi tạo fixture. Không chạy lại live test sau khi đã nhập dữ liệu thật.

## Cập nhật Google
Đã triển khai Client ID 43585717168-k9l6h7i4bdffvurq9ag1hqicelsb7l1g.apps.googleusercontent.com, migration 0003 và bản Google-only. 20 unit tests và TypeScript đạt. Endpoint config production trả configured=true, cookie nonce Secure/HttpOnly, token giả bị 401 và lịch khi chưa đăng nhập bị 401. Luồng Google thật cần người dùng đăng nhập để xác nhận; các kết quả tích hợp tài khoản/mật khẩu ở trên thuộc bản trước khi chuyển Google.

## Sửa lỗi menu lặp
Đã loại bỏ thao tác splice/push bên trong vòng lặp render Sidebar. 3 kiểm tra render React xác nhận Admin có 13 mục duy nhất, nhân viên có 5 mục phù hợp, và render 20 lần không thêm/lặp mục. TypeScript, production build và toàn bộ 23 kiểm tra đạt. Kiểm tra D1 chỉ đọc tại thời điểm sửa: 2 tài khoản Google, 0 nhân sự, 0 ca trực; không có thao tác xóa dữ liệu trong bản sửa menu.

## Lịch bận/nghỉ phép cho nhân viên
Đã bổ sung menu leaves cho nhân viên (6 mục). Nhân viên chỉ gửi đơn cho hồ sơ nhân sự của mình; backend buộc PENDING, từ chối giả mạo employeeId/status, ngày quá khứ, đơn trùng và rút đơn của người khác/đã duyệt. 5 kiểm tra nghiệp vụ và 2 kiểm tra render được thêm; tổng 30 kiểm tra đạt cùng TypeScript/build. Profile được làm mới theo snapshot D1 để nhận liên kết nhân sự sau khi Admin cập nhật. Chưa dùng tài khoản Google thật của nhân viên để gửi một đơn vận hành; cần người dùng nghiệm thu sau triển khai.


## Bỏ liên kết thủ công tài khoản — 02/11/2026
- Bỏ biểu mẫu và API liên kết tài khoản do Admin thao tác.
- Người đăng nhập Google gửi/rút đơn nghỉ phép trực tiếp; quyền sở hữu lấy từ phiên đăng nhập.
- Hồ sơ nhân sự được nhận diện bằng email Google đã xác thực trùng duy nhất email nhân sự đang hoạt động; không nhận diện theo tên.
- Đơn chưa có hồ sơ trùng email có hộp duyệt riêng; không tự sửa ca trực của người khác.
- 32 kiểm thử tự động, kiểm tra TypeScript và hai bản dựng đạt. Chưa kiểm thử tương tác Google trên hai thiết bị cho thay đổi này.


## Giao diện nội bộ và độ bền đồng bộ — 02/11/2026
- Thu gọn menu, đưa chức năng quản trị vào nhóm Quản lý; giữ các chức năng cũ và bố cục điện thoại.
- Bỏ tải phông chữ ngoài; thêm màn hình khôi phục khi render lỗi.
- Cô lập lỗi từng WebSocket khi broadcast để một kết nối hỏng không ngăn các kết nối khác nhận cập nhật.
- `npm run check` đạt: TypeScript, 35 kiểm thử tự động, frontend build và Worker build.
- Kiểm thử 50 đối tượng socket nhận đúng metadata; kiểm thử một socket hỏng, session hết hạn và thu hồi quyền. Đây là unit test, không phải thử tải 50 thiết bị thật.
- Chưa nghiệm thu lại Google tương tác trên hai thiết bị cho bản giao diện này. Không tuyên bố phần mềm không bao giờ lỗi.
