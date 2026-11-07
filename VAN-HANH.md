# Vận hành và kiểm thử – 04/11/2026

Trong ứng dụng, mở **Quản lý → Giám sát hệ thống**. Chỉ Admin được xem. Nút **Kiểm tra lại** đọc dữ liệu khi cần, không chạy vòng lặp truy vấn trên mỗi máy nhân viên. Thời điểm hiển thị dùng giờ Việt Nam; hạn mức đọc/ghi theo ngày UTC. Không có migration, không đổi database_id, giao diện nghiệp vụ, dịch vụ hoặc gói thanh toán.

- `worker/monitor.mjs`, `worker/room.mjs`: đo D1, dung lượng thực, số socket trong phòng và quyền đọc R2 nếu có. Không trả về định danh người dùng/socket, tên đối tượng R2 hoặc thông tin bí mật. Chưa cấu hình R2 thì dùng D1; không báo đã sao lưu R2.
- `src/components/SystemView.tsx`, `Sidebar.tsx`, `Header.tsx`, `src/App.tsx`: trang Admin và lối vào. Khi không đọc được nguồn thì ghi rõ chưa có số liệu. Lỗi thực thi Worker trong 24 giờ lấy từ Analytics; khác với lỗi nghiệp vụ hoặc đăng nhập sai. Lỗi sao lưu lấy riêng từ nhật ký D1.
- `worker/index.mjs`: kiểm tra quyền ở backend; quản lý tài khoản và xác thực Google chỉ đọc số phiên bản dữ liệu thay vì tải cả lịch. Không quét toàn bộ phiên hết hạn trên mọi yêu cầu. Vẫn kiểm tra thời hạn, trạng thái tài khoản mỗi lần truy cập; lịch sử hết phiên được hoàn tất khi xem lịch sử và trong tác vụ hằng ngày.
- `worker/backup.mjs`, `worker/vite.config.mjs`: lưu định dạng JSON nén gzip theo phần, xác minh SHA256/HMAC trước giải nén, đọc bản cũ. Khi khôi phục, tạo bản an toàn và chia nhỏ câu lệnh trong cùng một giao dịch. Giới hạn an toàn hiện tại: 24 MiB dữ liệu thô, 15.000 bản ghi và 4 MiB tệp mới sau nén. Vượt giới hạn thì báo lỗi, không bỏ bớt lịch sử.

## Cấu hình Analytics nếu cần xem trực tiếp từ Worker

Tài khoản Cloudflare hiện chưa có secret `CF_ANALYTICS_TOKEN` trên Worker. Admin tạo token **Account → Account Analytics → Read**, giới hạn đúng tài khoản ứng dụng. Trong Cloudflare Dashboard → Workers & Pages → `lich-truc-na-ri-api` → Settings → Variables and Secrets, thêm **Secret** tên `CF_ANALYTICS_TOKEN`, lưu/triển khai rồi mở trang giám sát và bấm **Kiểm tra lại**. Không dùng OAuth cá nhân hoặc khóa có quyền sửa; không gửi token vào chat, không đưa vào frontend/Git. Hai biến định danh không bí mật đã nằm trong cấu hình Wrangler. Không cần mở R2 hay nâng gói. Mức cảnh báo 70/85/95% tính từ số dòng đọc/ghi toàn tài khoản và dung lượng database, theo giới hạn gói miễn phí. Số lượt truy vấn là chỉ số riêng của database. Nguồn: https://developers.cloudflare.com/d1/observability/metrics-analytics/ và https://developers.cloudflare.com/d1/platform/limits/.

## Kết quả đã chạy

- `npm run check`: 63/63 kiểm thử đạt, TypeScript và hai bản build thành công. Còn cảnh báo kích thước gói giao diện.
- `npm run integration` trên workerd/D1/Durable Objects local: đạt kiểm tra đăng nhập/đăng xuất, tạo/khóa tài khoản, phân quyền, nghỉ phép, tạo nhân sự và xếp lịch, đổi ca đồng thời, 50 WebSocket nhận lịch, sao lưu/khôi phục, thu hồi phiên. Admin đọc được giám sát; nhân viên nhận 403. Các nhóm: 30 kiểm tra bảo mật, 44 API, 6 đồng bộ client, kiểm thử khôi phục và 34 kiểm tra phân quyền.
- Dừng và khởi động lại máy chủ **local**: client giữ dữ liệu đang xem và tự kết nối, đọc lại D1. Xem `RECOVERY-LOCAL.json`. Không dùng dữ liệu lịch thật để thử ghi.
- Kiểm thử sao lưu lớn **local**: dữ liệu thô 15.165.862 byte, tệp nén 122.240 byte. Đọc lại đủ 100 bản ghi lịch sử thử; tệp bị sửa bị từ chối, phiên cũ mất hiệu lực, bản cũ khôi phục được. Xem `BACKUP-TEST-RESULTS.json`. Script `scripts/integration-backup-large.mjs --prepare` tạo SQL cho D1 local riêng (.wrangler/integration-20261103); chạy trên fixture đã chuẩn bị, không chạy với D1 production.
- Production: Worker `352b5079-a021-4623-ac6c-a3fe9cd7664e`, Pages `81b3c245`. Trang và JS mới trả 200, `/api/system` không đăng nhập trả 401. Truy vấn Analytics chỉ đọc qua tài khoản triển khai trả được số liệu thật; Worker cần secret riêng để đọc được các số liệu đó. Không thử đăng nhập Google trên hai thiết bị thật hay thử tải trên production.
- Backup tự động 02:00:10 ngày 04/11/2026 (giờ VN) được ghi SUCCESS và đã đọc lại, kiểm tra chữ ký thành công. Không thử khôi phục trên production.
- Dữ liệu vận hành: nhật ký có thao tác `PERSONNEL_DELETE_ALL` lúc 21:16:23 ngày 03/11/2026 (VN). Khi kiểm tra: 29 ngày lịch, 0 nhân sự, 0 vị trí phân công. Bản an toàn liên kết với thao tác đó (21:16:19) đã xác minh chữ ký và nội dung: 18 nhân sự, 29 ngày lịch, 112 vị trí. Không tự phục hồi; khôi phục toàn bộ sẽ thay thế dữ liệu mới hơn. Không đóng gói bản sao lưu hoặc dữ liệu nội bộ vào mã nguồn.

## Sao lưu riêng và xử lý sự cố
Worker sao lưu lúc 02:00 giờ Việt Nam. Tác vụ Windows LichTrucNaRi-PrivateBackup trên máy triển khai chạy lúc 02:30 theo giờ máy và có thể chạy bù khi máy sẵn sàng. Máy cần có mạng, phiên người dùng Windows và thông tin Wrangler còn hiệu lực. Bản sao riêng nằm trong work/private-backups ngoài thư mục mã nguồn. Giữ kín thư mục work và khóa ký. Kiểm tra Last Run Result trong Task Scheduler và ngày của tệp mới nhất. Khi lệnh lỗi, xem kết quả tác vụ, kiểm tra mạng/quyền Wrangler và chạy lại scripts/copy-daily-backup.mjs từ thư mục dự án. Lệnh kiểm tra phục hồi riêng là node scripts/check-private-restore.mjs. Cả hai giữ kín nội dung bản sao.

Cửa sổ lưu bản sao là 21 ngày. Chỉ dọn bản sao hết hạn sau một lần sao lưu thành công. Nếu sao lưu bị gián đoạn, bản cũ có thể tồn tại lâu hơn để tránh mất điểm phục hồi. Chính sách này không xóa lịch, tài khoản hoặc đơn nghiệp vụ.

| Sự cố | Việc làm |
|---|---|
| Không đăng nhập được | Kiểm tra Worker, kết nối mạng, tình trạng tài khoản và phiên. |
| Không thấy lịch | Kiểm tra D1, ngày/tháng đang xem và số vị trí đã phân công. |
| Lịch sai hoặc mất | Dừng chỉnh sửa, xem nhật ký, chọn bản trước sự cố và kiểm thử phục hồi riêng trước khi Admin quyết định phục hồi thật. |
| Không lưu được đơn nghỉ | Ghi thời điểm và thông báo lỗi, kiểm tra API, quyền và dữ liệu mới nhất trước khi gửi lại. |
| Phiên bản mới bị lỗi | Quay lại bản Worker hoặc Pages hoạt động trước đó. Không khôi phục dữ liệu chỉ vì lỗi mã nguồn. |

Trước cập nhật lớn, chạy npm run check và kiểm thử tích hợp trên D1 cục bộ riêng. Theo dõi lỗi sao lưu qua nhật ký ứng dụng và kết quả tác vụ sao chép qua Task Scheduler.

Tác vụ LichTrucNaRi-Watchdog kiểm tra từ máy trường mỗi 10 phút. Xem kết quả tại work/watchdog-status.json. Sau hai lần liên tiếp không đọc được website, Worker hoặc D1, tác vụ gửi thông báo Windows cho người dùng đang đăng nhập. Thiếu bản sao riêng trong 48 giờ sẽ cảnh báo ngay trong lần kiểm tra. Nếu báo D1, kiểm tra cả mạng và quyền Wrangler. Khi máy tắt hoặc người dùng đăng xuất, tác vụ không theo dõi được sự cố. Kiểm tra bản sao dựa vào thời điểm của tệp đã được xác minh lúc sao chép; phép thử khôi phục riêng vẫn chạy theo tháng.
