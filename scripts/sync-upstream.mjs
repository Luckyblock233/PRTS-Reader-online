import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Changes to these files need a deliberate online-port review, even if Git can merge them.
export const protectedPaths = [
  '.github/',
  'astro.config.mjs',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'reader/static-',
  'reader/search-engine.js',
  'reader/search-worker.js',
  'scripts/export-static.mjs',
  'scripts/sync-upstream.mjs',
  'scripts/check-online.mjs',
  'tests/static-search.test.mjs',
  'tests/sync-upstream.test.mjs',
];
export function protectedChanges(paths) {
  return paths.filter((path) => protectedPaths.some((prefix) => path.startsWith(prefix)));
}
export function syncUpstream(cwd = process.cwd(), ref = 'upstream/main') {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain')) throw Error('工作区不干净，停止同步');
  const target = git('rev-parse', ref);
  if (spawnSync('git', ['merge-base', '--is-ancestor', target, 'HEAD'], { cwd }).status === 0)
    return { changed: false, target };
  const base = git('merge-base', 'HEAD', target);
  const paths = git('diff', '--name-only', base, target).split('\n');
  const blocked = protectedChanges(paths);
  if (blocked.length)
    throw Error('上游改动涉及在线适配或发布配置，需要人工迁移：\n' + blocked.join('\n'));
  const merge = spawnSync('git', ['merge', '--no-ff', '--no-edit', target], {
    cwd,
    encoding: 'utf8',
  });
  if (merge.status !== 0) {
    const conflicts = git('diff', '--name-only', '--diff-filter=U');
    spawnSync('git', ['merge', '--abort'], { cwd });
    throw Error('上游合并失败，主分支未更新：\n' + (conflicts || merge.stderr));
  }
  return { changed: true, target };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = syncUpstream();
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `上游提交：\`${result.target}\`。${result.changed ? '已在临时工作区合并，等待验证。' : '已同步，无需更新。'}\n`,
    );
  console.log(JSON.stringify(result));
}
