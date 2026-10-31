import { readData, siteUrl } from './static-data.js';
import { contextLines } from './search-engine.js';
let worker,
  sequence = 0;
const pending = new Map();
async function chapter(id) {
  return readData(`data/chapters/${encodeURIComponent(id)}.json`);
}
export async function search(params) {
  if (!worker) {
    worker = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
    };
    worker.onerror = () => {
      pending.forEach((p) => p.reject(Error('搜索线程启动失败，请刷新重试')));
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  const result = await new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker.postMessage({
      id,
      base: new URL(siteUrl('data/'), location.origin).href,
      params: Object.fromEntries(params),
    });
  });
  const docs = new Map(
    await Promise.all(
      [...new Set(result.results.map((r) => r.chapter))].map(async (id) => [id, await chapter(id)]),
    ),
  );
  result.results = result.results.map((r) => {
    const line = docs.get(r.chapter).lines[r.index];
    return { ...r, sourceId: line.sourceId, pointer: line.pointer, kind: line.kind };
  });
  return result;
}
export async function context(params) {
  return contextLines(
    await chapter(params.get('chapter')),
    Number(params.get('index')),
    Number(params.get('radius')),
  );
}
