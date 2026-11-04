import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const read = (path) => readFile(path, 'utf8');
const page = await read('src/pages/reader.astro');
const pages = {
  home: await read('dist/index.html'),
  reader: await read('dist/reader/index.html'),
  acknowledgements: await read('dist/acknowledgements/index.html'),
};
const app = await read('reader/app.js');
const config = await read('astro.config.mjs');
assert.match(config, /base:\s*['"]\/PRTS-Reader-online['"]/);
assert.match(config, /output:\s*['"]static['"]/);
assert.match(page, /import.*reader\/app\.js/);
for (const [name, html] of Object.entries(pages)) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${name}: duplicate component IDs`);
  for (const id of ['homeNav', 'readerNav', 'thanksNav', 'topSearchForm', 'themeToggle'])
    assert.ok(html.includes(`id="${id}"`), `${name}: missing shared #${id}`);
  assert.match(html, /src="\/PRTS-Reader-online\/preferences\.js\?v=/);
  assert.match(html, /action="\/PRTS-Reader-online\/reader\/"/);
  assert.match(html, /name="q"/);
  assert.match(html, /href="\/PRTS-Reader-online\/acknowledgements\/"/);
}
assert.doesNotMatch(pages.home, /id="(?:readerView|searchView|notesPanel)"/);
assert.doesNotMatch(pages.reader, /id="homeView"/);
assert.doesNotMatch(pages.acknowledgements, /id="(?:readerView|homeView|notesPanel)"/);
assert.match(pages.home, /id="homePublishedAt"[^>]*datetime=/);
assert.match(app, /siteUrl\(url\)/);
for (const file of [
  'reader/app.js',
  'reader/application.js',
  'reader/corpus-search.js',
  'reader/features.js',
  'reader/figure-viewer.js',
  'reader/reading-session.js',
  'public/preferences.js',
]) {
  const source = await read(file);
  assert.doesNotMatch(source, /['"`]\/api\//, `${file} reintroduced a server API`);
  // Check direct DOM dependencies: upstream UI changes must arrive with matching markup.
  const ids = [...source.matchAll(/(?:\$|getElementById)\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  for (const id of ids)
    assert.ok(pages.reader.includes(`id="${id}"`), `${file}: missing #${id} in reader page`);
}
for (const id of [
  'homeView',
  'homeRead',
  'homeResumeLabel',
  'sources',
  'sourceDialog',
  'closeDialog',
])
  assert.ok(pages.home.includes(`id="${id}"`), `home: missing #${id}`);
for (const file of [
  'reader/static-data.js',
  'reader/static-search.js',
  'reader/static-figures.js',
  'public/preferences.js',
])
  await access(file);
const built = await read('dist/index.html');
assert.match(built, /\/PRTS-Reader-online\/_astro\//);
const catalog = JSON.parse(await read('dist/data/catalog.json'));
const lock = JSON.parse(await read('config/data-source.json'));
assert.equal(catalog.snapshot.id, lock.sha256);
assert.deepEqual(Object.keys(catalog.snapshot).sort(), [
  'id',
  'publishedAt',
  'releaseTag',
  'releaseUrl',
]);
assert.ok(
  Number.isFinite(Date.parse(catalog.snapshot.publishedAt)),
  'Missing release publication date',
);
assert.ok(catalog.chapters.length > 0);
for (const chapter of catalog.chapters) await access(`dist/data/chapters/${chapter.id}.json`);
const manifest = JSON.parse(await read('dist/data/search-manifest.json'));
assert.equal(manifest.snapshot, catalog.snapshot.id);
for (const shard of manifest.shards) await access(`dist/data/${shard}`);
console.log(
  `Online compatibility passed: ${catalog.chapters.length} chapters, ${manifest.shards.length} search shards.`,
);
