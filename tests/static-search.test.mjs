import test from 'node:test';
import assert from 'node:assert/strict';
import { queryRecords, contextLines } from '../reader/search-engine.js';
const catalog = {
  events: [{ id: 'e', name: '主线' }],
  chapters: [
    { id: 'a', eventId: 'e' },
    { id: 'b', eventId: 'e' },
  ],
};
const rows = Array.from({ length: 65 }, (_, i) => [i < 60 ? 'a' : 'b', i, '阿米娅', '博士，HELLO']);
test('literal search paginates and preserves global counts under chapter filter', () => {
  const result = queryRecords(rows, catalog, { q: 'hello', chapter: 'a', page: '2' });
  assert.equal(result.total, 60);
  assert.equal(result.globalTotal, 65);
  assert.equal(result.chapterCount, 2);
  assert.equal(result.results.length, 10);
  assert.equal(result.start, 51);
  assert.equal(result.end, 60);
});
test('single Chinese character, field filtering, empty results and invalid queries', () => {
  assert.equal(queryRecords(rows, catalog, { q: '娅', field: 'speaker' }).total, 65);
  assert.equal(queryRecords(rows, catalog, { q: '娅', field: 'text' }).total, 0);
  assert.equal(queryRecords(rows, catalog, { q: '[', page: '99' }).page, 1);
  assert.throws(() => queryRecords(rows, catalog, { q: ' ' }));
});
test('context retains branch markers and original source indices', () => {
  const lines = [
    { index: 0, kind: 'command', text: '', raw: {} },
    { index: 1, kind: 'dialogue', text: '之前', raw: {} },
    { index: 2, kind: 'branch', text: '', raw: { attributes: { references: 'A' } } },
    { index: 3, kind: 'dialogue', text: '命中', raw: {} },
    { index: 4, kind: 'choice', text: '', raw: { attributes: { options: '继续' } } },
  ];
  const result = contextLines({ lines }, 3, 1);
  assert.deepEqual(
    result.lines.map((l) => l.index),
    [2, 3, 4],
  );
  assert.equal(result.lines[0].text, '分支引用：A');
  assert.equal(result.lines[2].text, '继续');
  assert.equal(result.hasEarlier, true);
  assert.equal(result.hasLater, false);
});
