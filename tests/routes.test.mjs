import assert from 'node:assert/strict';
import test from 'node:test';
import { sitePath, legacyReaderPath } from '../src/lib/routes.js';

test('page links respect GitHub Pages base with or without a trailing slash', () => {
  for (const base of ['/PRTS-Reader-online', '/PRTS-Reader-online/']) {
    assert.equal(sitePath('reader/', base), '/PRTS-Reader-online/reader/');
    assert.equal(sitePath('', base), '/PRTS-Reader-online/');
  }
  assert.equal(sitePath('reader/', '/'), '/reader/');
});
test('old chapter, paragraph and search bookmarks move to the reader route', () => {
  for (const hash of ['#story_01', '#story_01/0', '#story_01/99', '#search']) {
    assert.equal(legacyReaderPath(hash, '/book'), '/book/reader/' + hash);
  }
  assert.equal(legacyReaderPath('#reader', '/book'), '/book/reader/');
  for (const hash of ['', '#home', '#https://example.com', '#story/NaN']) {
    assert.equal(legacyReaderPath(hash, '/book'), null);
  }
});
