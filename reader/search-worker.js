import { queryRecords } from './search-engine.js';
let dataset;
async function load(base) {
  const read = async (path) => {
    const r = await fetch(base + path);
    if (!r.ok) throw Error(`搜索数据加载失败 (${r.status})`);
    return r.json();
  };
  const [catalog, manifest] = await Promise.all([
    read('catalog.json'),
    read('search-manifest.json'),
  ]);
  const records = [];
  // Load sequentially to bound peak memory on mobile devices.
  for (const name of manifest.shards) {
    const shard = await read(name);
    for (const row of shard) records.push(row);
  }
  return { catalog, records };
}
self.onmessage = async ({ data: { id, base, params } }) => {
  try {
    dataset ||= load(base).catch((error) => {
      dataset = null;
      throw error;
    });
    const { records, catalog } = await dataset;
    self.postMessage({ id, result: queryRecords(records, catalog, params) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
