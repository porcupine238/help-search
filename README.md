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
