import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../apps-script/article-visibility-filter.js', import.meta.url), 'utf8'), context);
const filter = (articles, images, canRead) =>
  JSON.parse(JSON.stringify(context.filterForReader_(articles, images, canRead)));

const articles = [
  { id: 'pub', title: 'P', tags: [], synonyms: [], body: 'a ![x](img:img-pub)', visibility: 'public' },
  { id: 'pub2', title: 'P2', tags: [], synonyms: [], body: 'b', visibility: ' PUBLIC ' },
  { id: 'res', title: 'R', tags: [], synonyms: [], body: '![y](img:img-res) NOIBO', visibility: 'restricted' },
  { id: 'blank', title: 'B', tags: [], synonyms: [], body: 'c', visibility: '' },
  { id: 'typo', title: 'T', tags: [], synonyms: [], body: 'd', visibility: 'pubic' },
];
const images = { 'img-pub': 'data:image/webp;base64,AA', 'img-res': 'data:image/webp;base64,BB', unused: 'data:image/webp;base64,CC' };

test('reader outside the list gets only exact public articles', () => {
  const out = filter(articles, images, false);
  assert.deepEqual(out.articles.map((a) => a.id), ['pub', 'pub2']);
});

test('reader outside the list gets no image of restricted articles', () => {
  const out = filter(articles, images, false);
  assert.deepEqual(Object.keys(out.images), ['img-pub']);
  assert.ok(!JSON.stringify(out).includes('NOIBO'));
});

test('listed reader gets every article and only referenced images', () => {
  const out = filter(articles, images, true);
  assert.deepEqual(out.articles.map((a) => a.id), ['pub', 'pub2', 'res', 'blank', 'typo']);
  assert.deepEqual(Object.keys(out.images).sort(), ['img-pub', 'img-res']);
});

test('visibility field is not sent to the browser', () => {
  const out = filter(articles, images, true);
  assert.ok(out.articles.every((a) => !('visibility' in a)));
});
