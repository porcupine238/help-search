import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, buildIndex, search } from '../web/search.js';

const articles = [
  { id: 'khoi-phuc-mat-khau', title: 'Khôi phục mật khẩu tài khoản',
    tags: ['tai-khoan', 'mat-khau'],
    synonyms: ['quên mật khẩu', 'quên pass', 'reset password'],
    body: 'Bấm Quên mật khẩu ở màn hình đăng nhập.' },
  { id: 'cap-nhat-thong-tin', title: 'Cập nhật thông tin cá nhân',
    tags: ['tai-khoan', 'thong-tin-ca-nhan'],
    synonyms: ['đổi số điện thoại', 'đổi email', 'sửa tên'],
    body: 'Vào mục Hồ sơ để đổi thông tin. Không liên quan mật khẩu.' },
];
const index = buildIndex(articles);
const ids = (q) => search(index, q).map((a) => a.id);

test('normalize bỏ dấu, đ→d, lowercase, gộp khoảng trắng', () => {
  assert.equal(normalize('  Đổi   SỐ điện thoại! '), 'doi so dien thoai');
  assert.equal(normalize('Khôi phục Mật Khẩu'), 'khoi phuc mat khau');
});
test('"quên pass" trả bài khôi phục mật khẩu đầu tiên', () => {
  assert.equal(ids('quên pass')[0], 'khoi-phuc-mat-khau');
});
test('gõ không dấu vẫn tìm được', () => {
  assert.equal(ids('quen mat khau')[0], 'khoi-phuc-mat-khau');
});
test('"đổi số điện thoại" trả bài cập nhật thông tin', () => {
  assert.equal(ids('đổi số điện thoại')[0], 'cap-nhat-thong-tin');
});
test('khớp từ đồng nghĩa xếp trên khớp nội dung', () => {
  assert.deepEqual(ids('mật khẩu'), ['khoi-phuc-mat-khau', 'cap-nhat-thong-tin']);
});
test('truy vấn rỗng hoặc không liên quan trả mảng rỗng', () => {
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('xyzabc'), []);
});
test('truy vấn 1 ký tự không khớp cả cụm tag/từ đồng nghĩa', () => {
  assert.deepEqual(ids('a'), []);
  assert.deepEqual(ids('t'), []);
});
