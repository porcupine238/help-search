import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../apps-script/doc-markdown-conversion.js', import.meta.url), 'utf8'), context);
const hash = (b64) => 'h' + b64.length;
const extract = (markdown) => JSON.parse(JSON.stringify(context.extractImages_(markdown, hash)));
const sample = readFileSync(new URL('./fixtures/doc-export-sample.md', import.meta.url), 'utf8');

test('parseDocId_ accepts a full link or a bare id and rejects anything else', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123456789';
  assert.equal(context.parseDocId_(`https://docs.google.com/document/d/${id}/edit?tab=t.0`), id);
  assert.equal(context.parseDocId_(` ${id} `), id);
  assert.equal(context.parseDocId_(`https://docs.google.com/document/u/0/d/${id}/edit`), id);
  assert.equal(context.parseDocId_(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(context.parseDocId_('https://example.com'), null);
  assert.equal(context.parseDocId_('mau-dong-bo'), null);
  assert.equal(context.parseDocId_(''), null);
});

test('real Docs export: images move out and the text stays', () => {
  const out = extract(sample);
  assert.ok(out.images.length >= 1);
  assert.ok(out.images.every((image) => image.mimeType.startsWith('image/')));
  assert.ok(out.markdown.includes('](img:'));
  assert.ok(out.markdown.includes('DOCSYNC-4821'));
  assert.ok(!out.markdown.includes('data:image/'));
});

test('real Docs export keeps the hard break between the image and the next line', () => {
  const out = extract(sample);
  assert.match(out.markdown, /!\[\]\(img:h\d+\) {2}\r?\nMã kiểm thử/);
  assert.match(out.markdown, /\*\*Quên mật khẩu\*\* {2}\r?\n/);
});

test('two identical inline images are stored once and linked twice', () => {
  const out = extract('a ![x](data:image/png;base64,AAAA) b ![y](data:image/png;base64,AAAA)');
  assert.equal(out.images.length, 1);
  assert.equal(out.markdown.split('img:').length - 1, 2);
});

test('the same reference used twice is stored once and linked twice', () => {
  const out = extract('![][image1]\n\n![][image1]\n\n[image1]: <data:image/png;base64,AAAA>\n');
  assert.equal(out.images.length, 1);
  assert.equal(out.markdown, '![](img:h4)\n\n![](img:h4)');
});

test('image1 and image10 are not confused', () => {
  const out = extract('![][image1] ![][image10]\n\n[image1]: <data:image/png;base64,AA>\n[image10]: <data:image/jpeg;base64,BBBBBB>\n');
  assert.equal(out.markdown, '![](img:h2) ![](img:h6)');
  assert.deepEqual(out.images.map((image) => image.mimeType), ['image/png', 'image/jpeg']);
});

test('CRLF line endings are handled', () => {
  const out = extract('Chữ  \r\n![][image1]\r\n\r\n[image1]: <data:image/png;base64,AAAA>\r\n');
  assert.equal(out.markdown, 'Chữ  \r\n![](img:h4)');
  assert.equal(out.images.length, 1);
});

test('a reference without a definition is left as is', () => {
  const out = extract('![][missing]');
  assert.equal(out.markdown, '![][missing]');
  assert.equal(out.images.length, 0);
});

test('markdown without images is returned unchanged', () => {
  const out = extract('## Các bước\n\n1. Nhập email');
  assert.equal(out.markdown, '## Các bước\n\n1. Nhập email');
  assert.equal(out.images.length, 0);
});

test('sheetSafeText_ escapes formula-like starts only', () => {
  assert.equal(context.sheetSafeText_('- mục'), "'- mục");
  assert.equal(context.sheetSafeText_('## Các bước'), '## Các bước');
});

const extractWith = (markdown, originals) =>
  JSON.parse(JSON.stringify(context.extractImages_(markdown, hash, originals)));

test('originals replace exported copies in document order', () => {
  const md = '![a][image2] ![b](data:image/png;base64,AA) ![c][image1]\n\n' +
    '[image1]: <data:image/png;base64,AAAA>\n[image2]: <data:image/png;base64,AAAAAA>\n';
  const out = extractWith(md, [
    { type: 'jpeg', base64: 'BBBBBBBB' },
    null,
    { type: 'png', base64: 'CCCCCCCCCC' },
  ]);
  assert.equal(out.markdown, '![a](img:h8) ![b](img:h2) ![c](img:h10)');
  assert.deepEqual(out.images.map((image) => image.mimeType), ['image/jpeg', 'image/png', 'image/png']);
});

test('originals are ignored when their count does not match the images found', () => {
  const md = '![][image1] ![][image1]\n\n[image1]: <data:image/png;base64,AAAA>\n';
  const out = extractWith(md, [{ type: 'png', base64: 'BBBBBBBB' }]);
  assert.equal(out.markdown, '![](img:h4) ![](img:h4)');
});

test('an undefined reference is not counted when pairing originals', () => {
  const out = extractWith('![][missing] ![](data:image/png;base64,AA)', [{ type: 'png', base64: 'BBBB' }]);
  assert.equal(out.markdown, '![][missing] ![](img:h4)');
});
