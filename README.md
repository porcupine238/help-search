# help-search

Tra cứu bài hướng dẫn bằng Gmail. Chỉ email có trong tab `Users` (`active` = `TRUE`) mới đọc được bài; Gmail khác đăng nhập xong sẽ thấy thông báo chưa được cấp quyền.

## Kiến trúc

- `web/`: trang tĩnh trên Netlify (`https://watv-tracuu.netlify.app`), đăng nhập bằng Google Identity Services, tìm kiếm phía trình duyệt (`search.js`). Không chứa nội dung bài.
- `apps-script/`: Apps Script Web App gắn vào Google Sheet `help-search-data`. API này kiểm tra ID token và tab `Users` rồi mới trả bài và ảnh; email ngoài danh sách nhận lỗi `forbidden`.
- Google Sheet: nơi admin quản trị trực tiếp người dùng, bài viết, ảnh và log truy vấn.

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

Luôn dùng `-i <DEPLOYMENT_ID>` để giữ nguyên URL `/exec` trong `web/config.js`. Chỉ `clasp push` thì không cập nhật bản đang chạy.

Trang web tự deploy khi push lên `main`: Netlify chạy `npm test` rồi publish thư mục `web/`; test lỗi thì không deploy.

## Hướng dẫn admin (trên Google Sheet)

- **Người được dùng trang:** tab `Users`. Thêm dòng gồm `email` và `active` = `TRUE`. Đổi `active` thành `FALSE` hoặc xóa dòng để thu hồi; trang của người đó bị xóa dữ liệu và hiện thông báo chưa được cấp quyền trong tối đa 15 phút.
- **Bài viết:** tab `Articles`. Điền `id` (không dấu, nối bằng `-`), `title`, `tags` và `synonyms` (phân cách bằng dấu phẩy), `body` (markdown; xuống dòng trong ô bằng Ctrl+Enter), `status` = `published`.
- **Ảnh:** mở `tools/image-to-datauri.html` trong trình duyệt và chọn ảnh. Dán kết quả vào cột `data_uri` của tab `Images` và đặt `id`. Trong bài, chèn ảnh bằng `![mô tả](img:<id>)`.
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

Mục nào FAIL thì dừng, ghi lại bước làm và kết quả thấy được rồi mới sửa.
