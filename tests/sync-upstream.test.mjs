import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncUpstream } from '../scripts/sync-upstream.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'prts-sync-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (name, text) => writeFileSync(join(cwd, name), text);
  const commit = () => {
    git('add', '.');
    git('commit', '-qm', 'fixture');
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(cwd, 'reader'));
  write('reader/ui.css', 'original\n');
  commit();
  git('branch', 'upstream');
  write('astro.config.mjs', 'online adaptation\n');
  commit();
  return { cwd, git, write, commit };
}
test('no upstream changes leaves HEAD untouched', (t) => {
  const f = fixture(t),
    head = f.git('rev-parse', 'HEAD');
  assert.equal(syncUpstream(f.cwd, 'upstream').changed, false);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
});
test('clean UI updates merge and preserve online adaptation and ancestry', (t) => {
  const f = fixture(t);
  f.git('switch', '-q', 'upstream');
  f.write('reader/ui.css', 'new UI\n');
  f.commit();
  const upstream = f.git('rev-parse', 'HEAD');
  f.git('switch', '-q', 'main');
  assert.equal(syncUpstream(f.cwd, 'upstream').changed, true);
  assert.equal(f.git('show', 'HEAD:astro.config.mjs'), 'online adaptation');
  assert.equal(f.git('show', 'HEAD:reader/ui.css'), 'new UI');
  f.git('merge-base', '--is-ancestor', upstream, 'HEAD');
});
test('protected configuration changes never merge', (t) => {
  const f = fixture(t);
  f.git('switch', '-q', 'upstream');
  f.write('package.json', '{}\n');
  f.commit();
  f.git('switch', '-q', 'main');
  const head = f.git('rev-parse', 'HEAD');
  assert.throws(() => syncUpstream(f.cwd, 'upstream'), /人工迁移/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
});
test('conflicting UI edits abort the merge and preserve a clean main', (t) => {
  const f = fixture(t);
  f.write('reader/ui.css', 'local UI\n');
  f.commit();
  const head = f.git('rev-parse', 'HEAD');
  f.git('switch', '-q', 'upstream');
  f.write('reader/ui.css', 'upstream UI\n');
  f.commit();
  f.git('switch', '-q', 'main');
  assert.throws(() => syncUpstream(f.cwd, 'upstream'), /合并失败/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.git('status', '--porcelain'), '');
});
