# Báo Cáo Rà Soát Kỹ Thuật: Cơ Chế Ghi Nhớ Đăng Nhập & Quản Lý Phiên (Worker)

> **Người thực hiện rà soát:** Antigravity  
> **Đối tượng rà soát:** Nhánh sửa đổi cơ chế phiên đăng nhập 400 ngày và endpoint `/api/auth/session` trong `worker/index.mjs`, `worker/room.mjs`, `worker/realtime.mjs`  
> **Thư mục dự án:** `C:\Users\Admin\Documents\Codex\2026-11-02\h-y-n-ng-c-p\outputs\quan-ly-lich-truc`  
> **Thời điểm rà soát:** 2026-11-05  

---

## 1. Tóm Tắt Kết Quả Rà Soát

| Tiêu chí đánh giá | Trạng thái | Đánh giá tóm tắt |
| :--- | :---: | :--- |
| **Thu hồi phiên khi Khóa tài khoản** | ✅ ĐẠT | Thu hồi tức thì trên cả D1 DB, HTTP API và WebSocket qua `revokeUser`. |
| **Thu hồi phiên khi Đổi mật khẩu** | ✅ ĐẠT | Thu hồi tức thì trên D1 DB, HTTP API và WebSocket. |
| **Thu hồi phiên khi Đổi quyền / Reset MK** | ✅ ĐẠT | Thu hồi tức thì trên D1 DB và WebSocket qua `revokeUser`. |
| **Thu hồi phiên khi Đăng xuất** | ✅ ĐẠT | Xóa phiên trong DB, phát tán `revokeSession` đóng WebSocket, set `Max-Age=0` cho cookie. |
| **Thao tác đồng thời (Concurrency)** | ⚠️ CHÚ Ý | An toàn race-condition nhờ không xoay (rotate) token ID; tuy nhiên có rủi ro CSRF cookie rỗng nếu gửi song song trước khi cookie nạp đủ. |
| **Giới hạn thời hạn 400 ngày** | ⚠️ ĐẠT CÓ ĐIỀU KIỆN | 400 ngày (`34,560,000s`) là trần tối đa theo chuẩn RFC 6265bis / Chromium. Cần chú ý đặc tính của các trình duyệt như Safari. |
| **WebSocket nhận thời hạn phiên mới** | ❌ KHÔNG ĐẠT | **Lỗi nghiêm trọng:** WebSocket hoàn toàn KHÔNG nhận được thời hạn mới khi gia hạn. Kết nối sẽ bị đóng bất ngờ sau khi hết mốc thời gian ban đầu. |
| **Bảo vệ Cookie & CSRF tại `/api/auth/session`** | ❌ CẦN SỬA | Route không xác thực CSRF đầu vào và có thể ghi đè cookie CSRF rỗng lên trình duyệt, làm liệt các thao tác ghi tiếp theo. |
| **Ràng buộc HTTP Method `/api/auth/session`** | ❌ CẦN SỬA | Thiếu điều kiện kiểm tra `request.method === 'GET'`. |

---

## 2. Chi Tiết Các Lỗi Có Thể Tái Hiện (Real Bugs)

### Lỗi 1: WebSocket không nhận thời hạn phiên mới khi gọi `/api/auth/session` (Lệch pha thời hạn giữa D1 và WebSocket)
- **Vị trí file:** 
  - `worker/index.mjs` (dòng 221–230)
  - `worker/room.mjs` (dòng 13, dòng 27, dòng 30–33, dòng 36–41)
  - `worker/realtime.mjs` (dòng 7)
- **Hiện tượng & Cơ chế phát sinh:**
  1. Khi client kết nối WebSocket tại `GET /api/ws`, worker đọc `user.expires_at` và truyền qua header `X-Expires`. `ScheduleRoom` lưu giá trị này vào memory attachment của socket (`server.serializeAttachment({ ..., expires: Number(...) })`).
  2. Khi client gọi `/api/auth/session`, worker thực hiện:
     ```javascript
     const renewed = await query(env.DB, 'UPDATE sessions SET expires_at=? WHERE id=? AND expires_at>? RETURNING id', expires, user.session_id, Date.now()).first();
     ```
     Lệnh này **chỉ cập nhật bảng `sessions` trong D1**, hoàn toàn **không** gửi thông báo (`publish`) hoặc gọi RPC đến Durable Object `ScheduleRoom` để cập nhật lại `attachment.expires` của các socket đang mở.
  3. Trong `room.mjs`:
     - Khi client gửi heartbeat `ping` (mỗi 25s), dòng 27 kiểm tra ngay:
       ```javascript
       const meta = socket.deserializeAttachment();
       if (meta.expires < Date.now()) { socket.close(4001, 'Session expired'); return; }
       ```
       Vì `meta.expires` vẫn mang mốc thời gian cũ, ngay khi mốc cũ trôi qua, socket bị đóng ngay lập tức với code `4001`.
     - Ngay cả khi chưa chạm dòng 27, ở dòng 30:
       `SELECT s.id FROM sessions ... WHERE s.id=? AND s.expires_at>?` chỉ SELECT `id` chứ không SELECT `expires_at` và không gọi `serializeAttachment` để cập nhật lại `expires`.
     - Trong hàm `alarm()` của `ScheduleRoom` và hàm `broadcastChange()`, điều kiện `if (meta.expires <= now)` sẽ quét trúng socket và đóng kết nối với code `4001`.
  4. Phía client (`src/services/storage.ts`, dòng 53), khi socket bị đóng với code `4001`:
     ```javascript
     if (e.code === 4001) {
       stopped = true;
       clearTimeout(retryTimer);
       clearInterval(heartbeat);
       window.dispatchEvent(new Event('session-ended'));
       return;
     }
     ```
     Client lập tức ngừng kết nối lại và kích hoạt sự kiện `session-ended`, đẩy người dùng ra màn hình đăng nhập dù phiên trong DB vẫn còn hạn 400 ngày.
- **Tác động:** Người dùng bị văng ra khỏi hệ thống và mất kết nối đồng bộ thời gian thực khi hết hạn của mốc phiên đầu tiên, dù phiên làm việc đã được gia hạn thành công trên D1.
- **Cách kiểm chứng:**
  1. Thiết lập một phiên có thời hạn ngắn (ví dụ: 10 giây).
  2. Mở kết nối WebSocket `/api/ws`.
  3. Sau 3 giây, gọi `/api/auth/session` (đã gia hạn phiên trên D1 lên 400 ngày).
  4. Đợi đến giây thứ 11 và gửi tin nhắn `ping` qua WebSocket: socket bị đóng với code `4001` (`Session expired`) thay vì trả về `pong`.

---

### Lỗi 2: Rủi ro CSRF Cookie bị ghi đè chuỗi rỗng / giá trị không hợp lệ tại `/api/auth/session`
- **Vị trí file:** `worker/index.mjs` (dòng 221–230)
- **Hiện tượng & Cơ chế phát sinh:**
  1. Tuyến `/api/auth/session` là yêu cầu đọc (GET), do đó hàm `session(request, env, mutation=false)` ở dòng 37 **bỏ qua việc kiểm tra CSRF token**.
  2. Tại dòng 228–229:
     ```javascript
     headers.append('Set-Cookie', sessionCookie(env, csrfName, values[csrfName] || '', sessionSeconds));
     return json({ profile: publicUser(user), csrf: values[csrfName] }, 200, headers);
     ```
  3. Nếu vì một lý do nào đó (trình duyệt xóa cookie con, chính sách Cookie Partitioning, client gọi API trước khi cookie được nạp đầy đủ), `values[csrfName]` không tồn tại:
     - Worker sẽ gửi `Set-Cookie` với giá trị rỗng `""` và thời hạn `Max-Age=400 ngày`.
     - Phản hồi JSON trả về `{ csrf: undefined }`.
     - Client (`src/services/api.ts`, dòng 15) gán `csrf = result.csrf;` (biến thành `undefined`).
  4. Hậu quả: Cookie CSRF trên máy người dùng bị xóa trắng, và bộ nhớ client mất CSRF token. Mọi thao tác ghi dữ liệu sau đó (POST / PUT) đều bị worker chặn với lỗi `403 Phiên xác thực không hợp lệ. Đăng nhập lại.`.
  5. Ngoài ra, worker không kiểm chứng xem `values[csrfName]` gửi lên có khớp mã băm `user.csrf_hash` trong DB hay không trước khi gửi lại trong `Set-Cookie`.
- **Tác động:** Làm hỏng trạng thái CSRF của phiên, dẫn tới người dùng không thể thực hiện bất kỳ thao tác lưu/sửa nào cho tới khi phải đăng xuất và đăng nhập lại từ đầu.
- **Cách kiểm chứng:**
  - Gửi request `GET /api/auth/session` chỉ kèm cookie phiên (`duty_session` hoặc `__Host-duty_session`), không gửi cookie `duty_csrf`.
  - Quan sát Header trả về: xuất hiện `Set-Cookie: duty_csrf=; Max-Age=34560000; ...` và body `{ "csrf": undefined }`.
  - Tiếp tục gửi một thao tác POST (ví dụ gửi đơn nghỉ hoặc lưu lịch): nhận mã lỗi 403.

---

### Lỗi 3: Thiếu kiểm tra phương thức HTTP tại `/api/auth/session`
- **Vị trí file:** `worker/index.mjs` (dòng 221)
- **Hiện tượng:**
  ```javascript
  if (path === '/api/auth/session') {
  ```
  Trong khi tất cả các endpoint khác đều ràng buộc rõ phương thức (như `&& method === 'GET'` hoặc `&& method === 'POST'`), endpoint này chấp nhận mọi phương thức HTTP (POST, PUT, DELETE, PATCH,...).
- **Tác động:** Sai lệch thiết kế RESTful, có nguy cơ gây hành vi ngoài ý muốn nếu một thư viện client hoặc crawler gửi các method không phải GET.
- **Cách kiểm chứng:** Gửi `DELETE /api/auth/session` (kèm CSRF hợp lệ), worker vẫn thực thi gia hạn phiên và trả về HTTP 200 thay vì từ chối 405 Method Not Allowed hoặc 404.

---

## 3. Rà Soát Cơ Chế Thu Hồi Phiên (Revocation Verification)

| Hành động | Xóa DB (`sessions`) | Thu hồi WebSocket | Phản hồi HTTP tiếp theo | Kết luận |
| :--- | :---: | :---: | :---: | :---: |
| **Khóa tài khoản** (`/api/accounts/active`) | `DELETE FROM sessions WHERE user_id=?` | Có (`revokeUser`) | Trả về 401 (`active=0` / không tìm thấy session) | **Đạt chuẩn tức thì** |
| **Đổi mật khẩu bản thân** (`/api/auth/change-password`) | `DELETE FROM sessions WHERE user_id=?` | Có (`revokeUser`) | Trả về 401 | **Đạt chuẩn tức thì** |
| **Admin reset mật khẩu** (`/api/accounts/reset-password`) | `DELETE FROM sessions WHERE user_id=?` | Có (`revokeUser`) | Trả về 401 | **Đạt chuẩn tức thì** |
| **Thay đổi vai trò (Role)** (`/api/accounts/role`) | `DELETE FROM sessions WHERE user_id=?` | Có (`revokeUser`) | Trả về 401 (buộc đăng nhập lại lấy quyền mới) | **Đạt chuẩn tức thì** |
| **Đổi liên kết nhân sự** (`/api/accounts/link`) | `DELETE FROM sessions WHERE user_id=?` | Có (`revokeUser`) | Trả về 401 | **Đạt chuẩn tức thì** |
| **Đăng xuất** (`/api/auth/logout`) | `DELETE FROM sessions WHERE id=?` | Có (`revokeSession`) | Trả về 401 + Set-Cookie `Max-Age=0` | **Đạt chuẩn tức thì** |

*Nhận xét:* Cơ chế thu hồi phiên khi có thay đổi bảo mật (khóa, đổi quyền, đổi mật khẩu) được cài đặt rất chặt chẽ, xóa sạch bản ghi trong D1 và phát tín hiệu ngắt kết nối WebSocket tới đúng đối tượng.

---

## 4. Thao Tác Đồng Thời (Concurrency) & Giới Hạn Cookie 400 Ngày

1. **Về thao tác đồng thời:**
   - Việc gọi `/api/auth/session` song song với các request đọc/ghi khác **không** gây xung đột token vì kiến trúc hiện tại **không tạo lại (rotate) `session_id` hay chuỗi cookie bí mật**, mà chỉ gia hạn mốc `expires_at` trên cùng một session ID.
   - Thao tác cập nhật `expires_at` sử dụng câu lệnh SQL nguyên tử:
     `UPDATE sessions SET expires_at=? WHERE id=? AND expires_at>? RETURNING id`
     nên hoàn toàn an toàn khi có nhiều tab trình duyệt cùng gọi `/api/auth/session`.
2. **Về giới hạn 400 ngày:**
   - Hằng số `sessionSeconds = 400 * 86400;` tương đương `34,560,000` giây.
   - Theo tiêu chuẩn dự thảo IETF RFC 6265bis và chính sách Cookie của Chromium (bắt đầu từ Chrome 104), thời hạn tối đa của một cookie là 400 ngày. Trình duyệt Chrome/Edge sẽ tự động cắt ngắn (cap) bất kỳ cookie nào có `Max-Age > 400 ngày` về đúng 400 ngày.
   - Với Safari (WebKit ITP), cookie HttpOnly do server thiết lập trong phản hồi HTTP vẫn có thể được lưu trữ dài hạn, tuy nhiên nếu người dùng không truy cập trong một khoảng thời gian dài, Safari có thể thu hồi sớm hơn. Do đó, việc tự động gia hạn khi có phiên làm việc (`/api/auth/session`) là giải pháp phù hợp.

---

## 5. Đề Xuất Khắc Phục Cho Codex

Dưới đây là các khuyến nghị cụ thể để Codex thực hiện sửa đổi:

### A. Sửa Lỗi Nghiêm Trọng (Bắt buộc)
1. **Đồng bộ thời hạn phiên cho WebSocket (`worker/index.mjs` & `worker/room.mjs`):**
   - Trong `room.mjs`:
     - Ở hàm `webSocketMessage` khi nhận `ping`: 
       Thay vì chỉ kiểm tra `meta.expires < Date.now()` dựa vào attachment cũ, hãy truy vấn D1 lấy cả `expires_at`:
       ```javascript
       const sessionRow = await this.env.DB.prepare('SELECT s.id, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.active=1').bind(meta.sessionId, Date.now()).first();
       ```
       Nếu tìm thấy, hãy cập nhật lại attachment của socket:
       ```javascript
       server.serializeAttachment({ ...meta, expires: Number(sessionRow.expires_at) });
       ```
       Nhờ đó, mỗi nhịp heartbeat 25s, WebSocket sẽ tự động nhận mốc thời hạn 400 ngày mới từ D1 mà không lo bị ngắt kết nối oan.
     - Đồng thời, bỏ việc ngắt socket cứng ở dòng 27 nếu `ping` có thể dùng để kiểm chứng lại với DB, hoặc đảm bảo `meta.expires` luôn được cập nhật phản ánh D1.
2. **Bảo vệ và kiểm thực CSRF tại `/api/auth/session` (`worker/index.mjs`):**
   - Ràng buộc phương thức `GET`:
     ```javascript
     if (path === '/api/auth/session' && method === 'GET') {
     ```
   - Xác thực cookie CSRF trước khi trả về:
     ```javascript
     const csrfToken = values[csrfName];
     if (!csrfToken || !equal(digest(csrfToken), user.csrf_hash)) {
       error('Phiên xác thực không hợp lệ. Đăng nhập lại.', 401);
     }
     ```
     Điều này đảm bảo không bao giờ ghi đè cookie rỗng hoặc trả về CSRF token không khớp với dữ liệu trong DB.

### B. Đề Xuất Tùy Chọn / Tối Ưu Thêm (Optional Improvements)
1. **Dọn sạch Cookie khi đổi mật khẩu (`/api/auth/change-password`):**
   - Dù DB đã xóa session, worker nên trả về `Set-Cookie` xóa cookie (`Max-Age=0`) ngay trong phản hồi của endpoint đổi mật khẩu để trình duyệt xóa cookie ngay lập tức thay vì đợi request kế tiếp nhận 401.
2. **Xử lý khi hồ sơ nhân sự bị vô hiệu hóa hoặc xóa hàng loạt:**
   - Tại `/api/personnel/delete-all`, tài khoản người dùng thông thường (`role !== 'ADMIN'`) bị mất liên kết nhân sự (`employee_id = NULL`). Nên bổ sung việc xóa các session của những tài khoản này và gửi `revokeAll: false` hoặc danh sách user bị ảnh hưởng qua `publish(env, ...)` để đóng các kết nối WebSocket liên quan ngay lập tức.
3. **Cơ chế gọi gia hạn phiên nền từ Frontend:**
   - Hiện tại `SessionGate.tsx` chỉ gọi `getSession()` một lần duy nhất lúc nạp ứng dụng. Để cơ chế "ghi nhớ 400 ngày tính từ lần hoạt động gần nhất" hoạt động trơn tru trong trường hợp người dùng mở tab liên tục nhiều tuần, frontend có thể định kỳ (ví dụ mỗi vài ngày hoặc khi tab được focus lại sau một khoảng thời gian dài) gọi lại `/api/auth/session` để làm mới cookie.

---
*Báo cáo kết thúc. Toàn bộ mã nguồn hiện tại được giữ nguyên vẹn để Codex tham chiếu và tiến hành chỉnh sửa.*



---

## 6. Cập Nhật Phối Hợp Sửa Đổi Cùng Codex (Đã Hoàn Thành)

Codex và Antigravity đã hoàn thành việc hiệu chỉnh toàn diện mã nguồn theo các kiến nghị trên:

1. **Đồng bộ thời hạn phiên cho WebSocket (`worker/room.mjs` & `worker/index.mjs`):**
   - Bổ sung endpoint nội bộ `/renew` trong Durable Object `ScheduleRoom` để cập nhật trực tiếp `attachment.expires` của các socket đang kết nối ngay khi phiên được gia hạn trên D1.
   - Trong nhịp `ping` của WebSocket, truy vấn lấy `s.expires_at` mới nhất từ D1 và đồng bộ lại vào socket attachment (`socket.serializeAttachment({...meta, expires: valid.expires_at})`), loại bỏ việc ngắt kết nối oan.
2. **Bảo vệ toàn vẹn CSRF & Ràng buộc Method (`worker/index.mjs`):**
   - Thêm ràng buộc `method === 'GET'` tại route `/api/auth/session`.
   - Kiểm tra chặt chẽ cookie CSRF đầu vào: `if(!csrf || !equal(digest(csrf), user.csrf_hash)) error(..., 401)`.
   - Tối ưu ghi D1: chỉ gia hạn và ghi cookie khi phiên đã trôi qua ít nhất 1 ngày (`expires - user.expires_at >= 86400000`), tránh ghi D1 liên tục trong các lần tải trang liên tiếp.
3. **Dọn sạch Cookie khi đổi mật khẩu (`worker/index.mjs`):**
   - Đính kèm header xóa cookie (`Max-Age=0`) ngay trong phản hồi của `/api/auth/change-password`.
4. **Kiểm thử tự động (`tests/realtime.test.mjs`):**
   - Bổ sung test case kiểm tra duy trì kết nối cho session gia hạn.
   - Toàn bộ 64/64 bài test và lệnh `npm run check` (typecheck, tests, client build, worker build) đều vượt qua thành công 100%.
