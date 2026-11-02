import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPublishedAt } from '../src/lib/date.js';

test('release publication uses Beijing time including midnight and year rollover', () => {
  assert.equal(formatPublishedAt('2026-12-31T16:00:00Z'), '2027/01/01 00:00');
  assert.equal(formatPublishedAt('2026-11-02T15:30:00Z'), '2026/11/02 23:30');
});

test('missing or malformed publication dates have a readable fallback', () => {
  for (const value of [undefined, null, '', 'not-a-date']) {
    assert.equal(formatPublishedAt(value), '暂无发布时间');
  }
});
