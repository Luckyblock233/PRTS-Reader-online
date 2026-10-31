import { readData } from './static-data.js';
let sourcePromise;
const trees = new Map();
async function tree(source, sha) {
  if (!trees.has(sha))
    trees.set(
      sha,
      (async () => {
        const response = await fetch(
          `https://api.github.com/repos/${source.repo}/git/trees/${sha}`,
        );
        if (!response.ok) throw Error('立绘目录暂不可用，请稍后重试');
        const data = await response.json();
        if (data.truncated) throw Error('立绘目录不完整');
        return data.tree;
      })().catch((error) => {
        trees.delete(sha);
        throw error;
      }),
    );
  return trees.get(sha);
}
export async function resolveFigure(ref) {
  sourcePromise ||= readData('figure-source.json').catch((e) => {
    sourcePromise = null;
    throw e;
  });
  const source = await sourcePromise;
  const entries = await tree(source, source.directoryTree);
  let entry = entries.find((e) => e.path.toLowerCase() === (ref + '.png').toLowerCase());
  let prefix = source.directory;
  if (!entry) {
    const base = ref.split('#')[0].split('$')[0];
    const folder = entries.find(
      (e) => e.type === 'tree' && e.path.toLowerCase() === base.toLowerCase(),
    );
    if (folder) {
      const files = await tree(source, folder.sha);
      const candidates = [ref + '.png'];
      if (ref.includes('#') && !ref.includes('$'))
        candidates.push(
          base.replace(/_[^_]*$/, '') + '_' + ref.split('#')[1] + '.png',
          base + '_' + ref.split('#')[1] + '.png',
        );
      if (!ref.includes('#')) candidates.push(base + '.png');
      entry = candidates
        .map((n) =>
          files.find((e) => e.type === 'blob' && e.path.toLowerCase() === n.toLowerCase()),
        )
        .find(Boolean);
      prefix += '/' + folder.path;
    }
  }
  if (!entry || entry.type !== 'blob')
    return { status: 'missing', message: '固定资源快照中未找到精确对应的立绘。' };
  return {
    status: 'ready',
    url:
      `https://raw.githubusercontent.com/${source.repo}/${source.commit}/` +
      (prefix + '/' + entry.path).split('/').map(encodeURIComponent).join('/'),
  };
}
