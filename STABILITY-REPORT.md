**Cập nhật 04/11/2026:** Lỗi sao lưu lớn đã được sửa và bản tự động 02:00 trên production đã được xác minh. Kết quả và giới hạn mới: [Vận hành và kiểm thử](VAN-HANH.md). Nội dung bên dưới là kết quả các đợt trước.

# Kiểm thử độ ổn định — 03/11/2026

## Kết luận

Chưa ghi nhận ứng dụng/máy chủ local sập trong các bài kiểm thử đã chạy. Không thể suy ra phần mềm không bao giờ sập, cũng không thể coi số đo localhost là cam kết hiệu năng production.

**Phát hiện quan trọng trên production: sao lưu qua ứng dụng đang thất bại do vượt ngưỡng 4 MiB.** Ba bản ghi gần nhất đều FAILED với thông báo vượt giới hạn. Đây là rủi ro khôi phục dữ liệu, không phải bằng chứng máy chủ lịch trực đã sập. Tại thời điểm kiểm tra có 8 lần SUCCESS và 8 lần FAILED trong nhật ký backup. Không xóa hoặc sửa các bản ghi này.

## Thử tải thực tế local

Dùng workerd + D1 + Durable Objects cục bộ, dữ liệu thử riêng, 50 tài khoản và 730 ngày lịch. Không dùng endpoint production cho bài tải.

| Kiểm tra | Kết quả |
|---|---|
| 1.000 lượt đọc, mỗi đợt 50 yêu cầu đồng thời | Hoàn tất, không có lỗi ngoài dự kiến |
| Tổng yêu cầu HTTP, gồm thao tác hợp lệ và cố ý sai | 1.050 |
| Đọc toàn bộ lịch: P50 / P95 / lớn nhất | 1.884 / 2.337 / 2.533 ms |
| 3 lần ghi thành công: P50 / lớn nhất | 90 / 244 ms; số mẫu nhỏ |
| 10 lần lưu cùng phiên bản | 1 thành công, 9 xung đột bị chặn; không ghi đè im lặng |
| 50 WebSocket nhận thay đổi | Đủ 50; không ngắt bất thường |
| Ngắt/kết nối lại 25 thiết bị | Tải được dữ liệu hiện hành |
| JSON sai, dữ liệu null, yêu cầu quá 5 MiB | Bị từ chối, revision và 730 ca không đổi |
| 150 kết nối WebSocket | Hoạt động; kết nối vượt giới hạn bị trả 429 |
| Khởi động lại máy chủ local | Client báo mất kết nối, giữ dữ liệu, tự kết nối lại; dữ liệu còn nguyên |

Thông báo WebSocket trong lần đo đến trong khoảng 63 ms từ lúc bắt đầu gửi yêu cầu ghi (local). Không đo được riêng thời điểm D1 commit hoặc thời gian React vẽ lại trên 50 thiết bị; không công bố chỉ số này là SLA realtime trên Internet.

Bài kiểm thử là đợt tải ngắn, không phải soak test nhiều giờ. Không có số đo RAM/CPU production hoặc kiểm thử trực quan trên 50 điện thoại.

## Kiểm thử hồi quy

- `npm run check`: 56 kiểm thử đạt, TypeScript/build thành công.
- `npm run integration`: các kiểm tra tài khoản, phân quyền, 50 WebSocket, đổi ca đồng thời, mất mạng/kết nối lại, backup/restore với fixture nhỏ đều đạt; 34 kiểm tra phân quyền đạt.
- `scripts/stress-local.mjs`: thực hiện bài tải, lưu số đo vào STABILITY-LOCAL.json.
- `scripts/recovery-local.mjs`: sử dụng adapter đồng bộ thật với HTTP/WebSocket local, giả lập sự kiện môi trường trình duyệt; lưu kết quả vào RECOVERY-LOCAL.json. Việc dừng/khởi động server do người chạy kiểm thử thực hiện.

## Rủi ro còn lại và việc nên sửa trước

1. **Backup lớn hơn 4 MiB:** cần hỗ trợ sao lưu/khôi phục dữ liệu lớn, giữ tương thích bản cũ, kiểm tra chữ ký và thử restore trọn vẹn. Không nên chỉ tăng hằng số giới hạn: mã restore hiện gom cả bảng vào một chuỗi JSON cho một truy vấn, có thể vướng giới hạn chuỗi D1. Cần chia lô hoặc thiết kế bản sao lưu phân đoạn, đồng thời hạn chế bộ nhớ.
2. **Giới hạn miễn phí:** Cloudflare có hạn mức CPU, bộ nhớ, số truy vấn và đọc/ghi mỗi ngày. Vượt giới hạn có thể làm yêu cầu thất bại dù thử tải localhost đạt. Không đổi gói hoặc bật thanh toán.
3. **Kích thước gói frontend:** build vẫn cảnh báo bundle lớn; chưa đo tốc độ tải trên mạng di động yếu hoặc thiết bị RAM thấp.
4. Chưa thử lỗi toàn vùng Cloudflare, gián đoạn DNS/Google, dữ liệu Excel rất lớn hoặc vận hành liên tục nhiều giờ.

Nguồn giới hạn nền tảng: [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/).

## Bảo toàn production

Đợt này không đổi mã vận hành, không triển khai bản mới, không tạo/xóa/sửa nhân sự hoặc lịch thật. Chỉ đọc nhật ký backup, kiểm tra tình trạng trang và xuất thêm bản D1 dự phòng riêng trong thư mục work. Không đưa bản SQL riêng tư vào ZIP mã nguồn.

Các bài kiểm thử phá dữ liệu/restore/reset fixture chỉ dùng local. Chỉ chạy stress sau khi chuẩn bị fixture local; không đổi URL cố định trong script sang production.
