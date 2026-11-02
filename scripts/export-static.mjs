import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const write = async (p, data) => writeFile(p, JSON.stringify(data));
// Export only public, reproducible content, never local notes or configuration.
const source = 'reader/data';
const out = 'public/data';
await mkdir(`${out}/chapters`, { recursive: true });
const catalog = await read(`${source}/catalog.json`);
const lock = await read('config/data-source.json');
if (catalog.snapshot.id !== lock.sha256)
  throw Error('Data snapshot differs from config/data-source.json; run data:bootstrap');
await write(`${out}/catalog.json`, catalog);
for (const chapter of catalog.chapters) {
  await write(
    `${out}/chapters/${chapter.id}.json`,
    await read(`${source}/chapters/${chapter.id}.json`),
  );
}
// Compact tuples reduce transfer size and worker memory substantially.
const records = await read(`${source}/search.json`);
const shards = [];
for (let i = 0; i < records.length; i += 20000) {
  const name = `search-${shards.length}.json`;
  await write(
    `${out}/${name}`,
    records.slice(i, i + 20000).map((r) => [r.chapter, r.index, r.speaker, r.text]),
  );
  shards.push(name);
}
await write(`${out}/search-manifest.json`, { snapshot: catalog.snapshot.id, shards });
await cp('reader/assets/fonts', 'public/assets/fonts', { recursive: true });
await write('public/figure-source.json', await read('config/figure-source.json'));
console.log(
  `Exported ${catalog.chapters.length} chapters and ${records.length} searchable lines (${shards.length} shards).`,
);
