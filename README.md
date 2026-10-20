# help-search

Tra cứu bài hướng dẫn bằng Gmail. Chỉ email có trong tab `Users` (`active` = `TRUE`) mới đọc được bài; Gmail khác đăng nhập xong sẽ thấy thông báo chưa được cấp quyền.

## Kiến trúc

- `web/`: trang tĩnh trên Netlify (`https://watv-tracuu.netlify.app`), đăng nhập bằng Google Identity Services, tìm kiếm phía trình duyệt (`search.js`). Không chứa nội dung bài.
- `apps-script/`: Apps Script Web App gắn vào Google Sheet `help-search-data`. API này kiểm tra ID token và tab `Users` rồi mới trả bài và ảnh; email ngoài danh sách nhận lỗi `forbidden`.
- Google Sheet: nơi admin quản trị trực tiếp người dùng, bài viết, ảnh và log truy vấn.
- Bài có thể soạn trong Google Doc: Apps Script đồng bộ mỗi 10 phút sang cột `body`. Ảnh trong Doc được lưu trong thư mục Drive riêng `help-search-images` (chỉ chia sẻ cho email trong `SYNC_EMAILS`) và chỉ trả về qua API khi mở bài.

## Chạy test

```bash
npm test
```

Chạy thử cục bộ: `python3 -m http.server 8080 -d web` rồi mở http://localhost:8080.

## Deploy Apps Script

```bash
cd apps-script
clasp push -f && clasp deploy -i <DEPLOYMENT_ID> -d "vN"
```

Luôn dùng `-i <DEPLOYMENT_ID>` để giữ nguyên URL `/exec` trong `web/config.js`. Chỉ `clasp push` thì không cập nhật API web đang chạy, nhưng trigger đồng bộ Doc và menu trên Sheet luôn chạy code mới nhất đã push.

Cài lần đầu (Gmail dự án, trong Apps Script editor): chạy `setupFolders` (tạo `help-search-images` và `help-search-bai-viet`, log in URL), rồi `installTriggers`. Tab `Articles` cần có các cột `doc`, `doc_synced_at`, `doc_status`.

Người được bấm **Đồng bộ ngay**: Project Settings → Script Properties → `SYNC_EMAILS`, các email phân cách bằng dấu phẩy (gồm cả Gmail dự án). Mỗi email khác Gmail dự án cần quyền sửa Sheet và quyền **Editor** trên cả `help-search-bai-viet` lẫn `help-search-images`, vì đồng bộ chạy bằng chính tài khoản bấm menu; lần đầu bấm sẽ phải cấp quyền Drive. Thu hồi: xóa email khỏi `SYNC_EMAILS` và bỏ chia sẻ hai thư mục.

Trang web tự deploy khi push lên `main`: Netlify chạy `npm test` rồi publish thư mục `web/`; test lỗi thì không deploy.

## Hướng dẫn admin (trên Google Sheet)

- **Người được dùng trang:** tab `Users`. Thêm dòng gồm `email` và `active` = `TRUE`. Đổi `active` thành `FALSE` hoặc xóa dòng để thu hồi; trang của người đó bị xóa dữ liệu và hiện thông báo chưa được cấp quyền trong tối đa 15 phút.
- **Bài viết — cách khuyến nghị: Google Docs.** Chia hai vai:
  - *Người soạn* (chỉ có quyền Editor trên thư mục `help-search-bai-viet`, không vào Sheet): tạo Doc **ngay trong thư mục đó**, không để trong thư mục con hay My Drive. Doc tạo ở chỗ khác thì dùng **Di chuyển** vào thư mục (không dùng "Thêm lối tắt"). Soạn bình thường: Heading, danh sách, in đậm, dán ảnh bằng Ctrl+V. Chỉ dùng một tab trong Doc, không dùng bảng phức tạp. Soạn xong gửi link Doc cho admin.
  - *Admin hoặc người được phân quyền sửa Sheet:* dán link Doc vào cột `doc` bằng **Ctrl+Shift+V** để ô giữ nguyên URL `https://docs.google.com/document/d/…`. Nếu ô chỉ hiện tên Doc (khung "chip"), xóa đi và dán lại. Điền `id`, `title`, `tags`, `synonyms`, `status` = `published`.
  - Trong tối đa 10 phút bài tự cập nhật, kể cả mỗi lần người soạn sửa Doc. Muốn cập nhật ngay thì bấm menu **Help Search → Đồng bộ ngay**; chỉ email trong `SYNC_EMAILS` bấm được, tài khoản khác nhận thông báo không có quyền và Sheet không bị thay đổi.
  - Cột `doc_status` = `OK` là đồng bộ thành công; khác `OK` là câu báo lỗi. Cột `doc_synced_at` là giờ sửa Doc lần cuối đã được đồng bộ. Bài không cập nhật thì xem hai cột này trước.
  - Khi đã có link Doc, **không sửa tay cột `body`** (sẽ bị ghi đè). Đổi link sang Doc khác thì xóa ô `doc_synced_at` hoặc bấm menu đồng bộ ngay.
  - Ảnh được lấy ở độ phân giải gốc qua Google Docs API. Ảnh gốc lớn hơn 3MB, hoặc khi Docs API lỗi (xem Executions trong Apps Script), sẽ dùng bản thu nhỏ theo khổ trang của Doc. Bài cũ chỉ đổi sang ảnh gốc sau khi Doc được sửa hoặc bấm **Đồng bộ ngay**.
  - Bài dài quá 45.000 ký tự, hoặc Doc quá 10MB (thường do dán quá nhiều ảnh chụp màn hình), sẽ báo lỗi; khi đó chia thành nhiều bài.
  - Bảo mật: chỉ Doc nằm trực tiếp trong `help-search-bai-viet` mới được đồng bộ (Doc ở chỗ khác báo `Lỗi: Doc không nằm trong thư mục help-search-bai-viet`). Ai có quyền Editor trên thư mục đều sửa được nội dung bài đang hiển thị, nên chỉ chia sẻ thư mục cho người soạn tin cậy. Chỉ chia sẻ `help-search-images` cho email trong `SYNC_EMAILS` (họ xem được mọi ảnh của mọi bài). Người soạn không cần quyền vào Sheet.
- **Bài viết — cách cũ: gõ markdown trong cột `body`.** Điền `id` (không dấu, nối bằng `-`), `title`, `tags` và `synonyms` (phân cách bằng dấu phẩy), `body` (markdown; xuống dòng trong ô bằng Ctrl+Enter), `status` = `published`, để trống cột `doc`.
- **Ảnh (chỉ cho cách cũ):** mở `tools/image-to-datauri.html` trong trình duyệt và chọn ảnh. Dán kết quả vào cột `data_uri` của tab `Images` và đặt `id`. Trong bài, chèn ảnh bằng `![mô tả](img:<id>)`.
- **Cải thiện tìm kiếm:** xem tab `ZeroResultLog` (các truy vấn không ra kết quả), rồi thêm những cách gọi đó vào cột `synonyms` của bài phù hợp.

## Nghiệm thu

Chạy lại sau mỗi lần đổi code hoặc cấu hình OAuth. Cần 2 Gmail: **A** có trong `Users` với `active` = `TRUE`; **B** không có trong `Users`. Dùng cửa sổ ẩn danh cho từng tài khoản để không dính phiên cũ.

Kiểm tra tự động (chạy ở thư mục gốc repo):

1. API từ chối token sai, lệnh in ra đúng `{"ok":false,"error":"invalid_token"}`:
   ```bash
   curl -sL -H 'Content-Type: text/plain' --data '{"action":"bootstrap","idToken":"aaaaaaaaaaaaaaaaaaaaaaaaa"}' \
     "$(node -e "import('./web/config.js').then(m=>console.log(m.CONFIG.API_URL))")"
   ```
2. Trang tĩnh không chứa nội dung bài. Thay `<id-bài>` bằng `id` của một bài trong tab `Articles`; lệnh phải in ra `0`:
   ```bash
   for f in "" app.js search.js config.js; do curl -s https://watv-tracuu.netlify.app/$f; done | grep -ci "<id-bài>"
   ```

Kiểm tra trên trình duyệt (ghi PASS/FAIL từng mục):

3. **Gmail A:** đăng nhập được và thấy mọi bài `published`. Gõ `quên pass` thì bài khôi phục mật khẩu đứng đầu. Mở một bài có ảnh thì ảnh hiển thị.
4. **Gmail B:** đăng nhập Google được, không gặp màn hình "Access blocked" (chứng tỏ app đã ở chế độ In production). Trang hiện "Tài khoản … chưa được cấp quyền" và không có bài nào. Trong DevTools → Network, response của request tới `script.googleusercontent.com` đúng là `{"ok":false,"error":"forbidden"}`.
5. **Thu hồi quyền:** để tab của Gmail A mở ở danh sách bài, đổi `active` của A thành `FALSE`. Trong tối đa 15 phút, không reload trang, danh sách bài biến mất và hiện thông báo chưa được cấp quyền. Xong thì đổi lại `TRUE`.
6. **Log truy vấn:** Gmail A gõ một chuỗi vô nghĩa (ví dụ `xyzabc`) rồi Enter. Tab `ZeroResultLog` có dòng mới với đúng email A và chuỗi đó.
7. **Điện thoại** (hoặc DevTools chế độ 360px): không có cuộn ngang, đọc bài được.
8. **Netlify deploy:** Netlify → Deploys có bản deploy từ commit mới nhất của `main` (so với `git log -1 --format=%h`), log build có `# fail 0`.

9. **Google Docs:** Doc mẫu trong `help-search-bai-viet` có tiêu đề, danh sách số, chữ đậm và một ảnh; dán link vào cột `doc`, bấm menu đồng bộ ngay thì `doc_status` = `OK`. Gmail A mở bài thấy đủ định dạng và ảnh.

Mục nào FAIL thì dừng, ghi lại bước làm và kết quả thấy được rồi mới sửa.
