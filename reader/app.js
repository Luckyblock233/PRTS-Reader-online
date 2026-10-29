import { initDataUpdates } from './data-updates.js';
import { initApplication, showView, setHomeStats } from './application.js';
import { initCorpusSearch, setSearchSnapshot } from './corpus-search.js';
import { speakerColor, showFigure, clearFigure, setFigureSnapshot } from './features.js';
import {
  initReadingSession,
  resolveReadingPosition,
  saveReadingPosition,
} from './reading-session.js';
const $ = (id) => document.getElementById(id);
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const plain = (text) => String(text ?? '').replace(/<[^>]*>/g, '');
let catalog,
  current,
  selected,
  request = 0,
  records = [],
  storageKey,
  dirty = false;
const byId = new Map();
let loadingChapter = false;
let searchHighlight = '';
let resumePosition = null;
let dataBase = 'data';
function updateSearchHighlight() {
  $('searchHighlightBar').hidden = !searchHighlight;
  $('searchHighlightLabel').textContent = searchHighlight
    ? `全库检索定位：${searchHighlight} · 仅高亮，保留完整上下文`
    : '';
}
function toast(s) {
  $('toast').textContent = s;
  $('toast').style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('toast').style.display = 'none'), 3000);
}
async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${r.status} ${await r.text()}`);
  return r.json();
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
    return true;
  } catch {
    toast('浏览器存储失败，请导出笔记备份');
    return false;
  }
}
function stamp() {
  return new Date().toISOString();
}
function rec() {
  return (
    selected && records.find((r) => r.chapterId === current.meta.id && r.index === selected.index)
  );
}
function saveDraft() {
  if (!dirty || !selected) return;
  let r = rec();
  if (!r) {
    r = {
      chapterId: current.meta.id,
      index: selected.index,
      sourceId: selected.sourceId,
      pointer: selected.pointer,
      member: current.meta.member,
      sha256: current.meta.sha256,
      quote: selected.text,
      speaker: selected.speaker,
      note: '',
      bookmark: false,
      updatedAt: stamp(),
    };
    records.push(r);
  }
  r.note = $('note').value;
  r.updatedAt = stamp();
  dirty = false;
  persist();
  renderNotes();
}
function renderNotes() {
  $('noteCount').textContent = records.filter((r) => r.note || r.bookmark).length;
  const list = $('noteList');
  list.replaceChildren();
  for (const r of records
    .filter((r) => r.note || r.bookmark)
    .slice()
    .reverse()) {
    const c = byId.get(r.chapterId);
    const b = make(
      'button',
      'noteItem',
      (r.bookmark ? '★ ' : '') + (r.note || plain(r.quote) || '已收藏段落').slice(0, 70),
    );
    b.append(make('small', '', `${c?.title || r.chapterId} · #${r.index}`));
    b.onclick = () => navigate(r.chapterId, r.index);
    list.append(b);
  }
}
function renderTree() {
  const q = $('catalogSearch').value.trim().toLocaleLowerCase();
  const type = $('type').value;
  const tree = $('tree');
  tree.replaceChildren();
  let events = catalog.events.slice();
  if ($('sort').value === 'release')
    events.sort((a, b) => (b.startTime ?? -1) - (a.startTime ?? -1));
  else
    events.sort(
      (a, b) =>
        (a.type === 'MAINLINE' ? -1 : 1) - (b.type === 'MAINLINE' ? -1 : 1) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
  let total = 0;
  for (const ev of events) {
    const chapters = catalog.chapters.filter(
      (c) =>
        c.eventId === ev.id &&
        (!type || c.type === type) &&
        (!q || [ev.name, c.title, c.code, c.key, c.tag].join(' ').toLocaleLowerCase().includes(q)),
    );
    if (!chapters.length) continue;
    total += chapters.length;
    const d = make('details');
    d.open = !!q || ev.id === current?.meta.eventId;
    const s = make('summary', '', ev.name);
    s.append(make('span', '', chapters.length));
    d.append(s);
    for (const c of chapters) {
      const b = make(
        'button',
        'chapter' + (c.id === current?.meta.id ? ' active' : ''),
        `${c.code} ${c.title}`,
      );
      b.append(make('small', '', c.tag || c.type));
      b.onclick = () => navigate(c.id);
      d.append(b);
    }
    tree.append(d);
  }
  if (!total) tree.append(make('p', 'hint', '没有匹配章节'));
}
function highlight(parent, text, q) {
  text = plain(text);
  if (!q) {
    parent.textContent = text;
    return;
  }
  const low = text.toLocaleLowerCase(),
    needle = q.toLocaleLowerCase();
  let pos = 0,
    i;
  while ((i = low.indexOf(needle, pos)) !== -1) {
    parent.append(
      document.createTextNode(text.slice(pos, i)),
      make('mark', '', text.slice(i, i + q.length)),
    );
    pos = i + q.length;
  }
  parent.append(document.createTextNode(text.slice(pos)));
}
const kindName = {
  dialogue: '对白',
  narration: '无发言标签文本',
  text: '文本指令',
  choice: '选项',
  branch: '分支标记',
  command: '脚本指令',
};
function renderContent() {
  if (!current) return;
  updateSearchHighlight();
  const root = $('content'),
    mode = $('mode').value,
    q = $('find').value.trim(),
    speaker = $('speaker').value,
    highlightQuery = q || searchHighlight;
  root.replaceChildren();
  if (mode === 'raw') {
    root.append(make('pre', '', JSON.stringify(current.raw, null, 2)));
    return;
  }
  let count = 0;
  for (const l of current.lines) {
    if (mode === 'read' && !l.text && !['choice', 'branch'].includes(l.kind)) continue;
    if (speaker && l.speaker !== speaker) continue;
    const attrs = l.raw.attributes || {};
    const text = l.text || (l.kind === 'choice' ? attrs.options : JSON.stringify(attrs));
    if (q && !(l.speaker + ' ' + text).toLocaleLowerCase().includes(q.toLocaleLowerCase()))
      continue;
    count++;
    const row = make('article', `line ${l.kind}${selected?.index === l.index ? ' selected' : ''}`);
    row.id = 'line-' + l.index;
    if (l.text.trim() && ['dialogue', 'narration', 'text'].includes(l.kind))
      row.dataset.readingIndex = l.index;
    if (l.speaker) row.style.setProperty('--speaker-color', speakerColor(l.speaker));
    row.tabIndex = 0;
    const head = make('div', 'lineHead');
    if (l.speaker) {
      const label = make('span', 'speakerName');
      highlight(label, l.speaker, highlightQuery);
      head.append(label);
    } else head.append(make('span', '', kindName[l.kind]));
    head.append(make('span', 'lineNo', `#${l.index} · 源 ${l.sourceId ?? '—'}`));
    row.append(head);
    const p = make('p');
    highlight(p, text, highlightQuery);
    row.append(p);
    if (l.kind === 'choice') {
      const opts = String(attrs.options || '').split(';'),
        values = String(attrs.values || '').split(';');
      opts.forEach((opt, i) => {
        const target = l.raw.targetLine?.['option' + values[i]];
        const b = make('button', '', opt + (target ? ` → ${target}` : ' · 无可靠跳转'));
        b.onclick = (e) => {
          e.stopPropagation();
          if (current.meta.optionTrace === false) return toast('上游 OPTIONTRACE=false，仅供查看');
          const rawId = Number(String(target).replace(/^line/, ''));
          const dest = current.lines.find((x) => x.sourceId === rawId);
          if (!target || !dest) return toast('上游未提供可用目标');
          jump(dest.index);
        };
        row.append(b);
      });
    }
    row.onclick = () => selectLine(l.index);
    row.onkeydown = (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectLine(l.index);
      }
    };
    root.append(row);
  }
  if (!count) root.append(make('div', 'empty', '当前条件下没有段落。可清除筛选。'));
  $('readingFooter').textContent =
    `显示 ${count} / ${current.lines.length} 条源记录 · 本文所有分支均保留 · 未模拟游戏演出`;
}
function selectLine(index) {
  saveDraft();
  selected = current.lines[index];
  if (!selected) return;
  document.querySelectorAll('.line.selected').forEach((e) => e.classList.remove('selected'));
  $('line-' + index)?.classList.add('selected');
  $('selection').textContent =
    `${current.meta.member}\n${selected.pointer} · sourceId=${selected.sourceId}\n${plain(selected.text).slice(0, 240)}`;
  $('lineRaw').textContent = JSON.stringify(selected.raw, null, 2);
  $('note').value = rec()?.note || '';
  $('bookmark').textContent = rec()?.bookmark ? '★ 已收藏' : '☆ 收藏段落';
  history.replaceState(null, '', `#${current.meta.id}/${index}`);
  showFigure(selected);
  saveReadingPosition(catalog.snapshot.id, current.meta, index);
  resumePosition = { chapterId: current.meta.id, index };
  setHomeStats(catalog, current.meta.title + ' · #' + index);
  $('readingPosition').textContent = `段落 #${index} · ↑ / ↓ 切换可见文本 · 已记住阅读位置`;
}
function jump(index) {
  if (!current || !Number.isInteger(index) || index < 0 || index >= current.lines.length) return;
  $('speaker').value = '';
  $('find').value = '';
  if ($('mode').value === 'raw') $('mode').value = 'all';
  const target = current.lines[index];
  if (target && !target.text && !['choice', 'branch'].includes(target.kind))
    $('mode').value = 'all';
  renderContent();
  selectLine(index);
  $('line-' + index)?.scrollIntoView({ block: 'center', behavior: 'instant' });
}
async function navigate(id, index, keyword = '') {
  if (!byId.has(id)) return;
  saveDraft();
  showView('reader');
  const version = ++request;
  loadingChapter = true;
  try {
    const c = await json(`${dataBase}/chapters/${id}.json`);
    if (version !== request) return;
    current = c;
    selected = null;
    searchHighlight = typeof keyword === 'string' ? keyword.trim() : '';
    clearFigure();
    $('brief').open = false;
    $('note').value = '';
    $('selection').textContent = '请选择段落';
    $('lineRaw').textContent = '';
    $('speaker').replaceChildren(make('option', '', '全部发言标签'));
    $('speaker').firstChild.value = '';
    for (const s of c.meta.speakers) {
      const o = make('option', '', s);
      o.value = s;
      $('speaker').append(o);
    }
    $('find').value = '';
    const ev = catalog.events.find((e) => e.id === c.meta.eventId);
    $('title').textContent = c.meta.title;
    $('breadcrumb').textContent = `${ev?.name || '其他'} / ${c.meta.code || c.meta.key}`;
    $('subtitle').textContent =
      `${c.meta.tag || c.meta.type} · ${c.meta.textCount} 条含文本记录 · ${c.meta.speakers.length} 个发言标签`;
    $('briefText').textContent = plain(c.brief) || '未提供';
    $('summaryText').textContent =
      typeof c.summary === 'string' ? c.summary : JSON.stringify(c.summary ?? '未提供');
    $('notice').hidden = !c.meta.hasChoices && c.meta.optionTrace !== false;
    $('notice').textContent =
      c.meta.optionTrace === false
        ? '上游标记 OPTIONTRACE=false。分支追踪不可靠，请在源 JSON 中人工核对。'
        : '本篇含选项：正文按文件顺序展示全部分支。点击选项只定位源记录，不代表实际游玩路线。';
    const siblings = catalog.chapters.filter((x) => x.eventId === c.meta.eventId);
    const pos = siblings.findIndex((x) => x.id === id);
    $('prev').disabled = pos === 0;
    $('next').disabled = pos === siblings.length - 1;
    $('prev').onclick = () => navigate(siblings[pos - 1].id);
    $('next').onclick = () => navigate(siblings[pos + 1].id);
    renderTree();
    renderContent();
    if (Number.isInteger(index) && index >= 0 && index < c.lines.length) jump(index);
    else {
      document.querySelector('main').scrollTop = 0;
      history.replaceState(null, '', '#' + id);
      saveReadingPosition(catalog.snapshot.id, c.meta, null);
      $('readingPosition').textContent = '↑ / ↓ 切换可见对白与旁白 · 自动记住所选段落';
    }
    try {
      localStorage.setItem(storageKey + '-last', id);
    } catch {}
  } catch (e) {
    toast('读取章节失败：' + e.message);
  } finally {
    if (version === request) loadingChapter = false;
  }
}
for (const id of ['mode', 'speaker', 'find'])
  $(id).addEventListener(id === 'find' ? 'input' : 'change', renderContent);
for (const id of ['type', 'sort', 'catalogSearch'])
  $(id).addEventListener(
    id === 'catalogSearch' ? 'input' : 'change',
    () => catalog && renderTree(),
  );
$('clearFilters').onclick = () => {
  $('speaker').value = '';
  $('find').value = '';
  renderContent();
};
$('note').oninput = () => (dirty = true);
$('note').onblur = saveDraft;
$('saveNote').onclick = () => {
  if (!selected) return toast('请先选择段落');
  saveDraft();
  toast('观察已保存到当前浏览器');
};
$('bookmark').onclick = () => {
  if (!selected) return toast('请先选择段落');
  dirty = true;
  saveDraft();
  const r = rec();
  r.bookmark = !r.bookmark;
  r.updatedAt = stamp();
  persist();
  renderNotes();
  $('bookmark').textContent = r.bookmark ? '★ 已收藏' : '☆ 收藏段落';
};
$('export').onclick = () => {
  if (!catalog) return;
  saveDraft();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          schemaVersion: 'reader-notes/v1',
          snapshotId: catalog.snapshot.id,
          exportedAt: stamp(),
          records,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const a = make('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'terra-notes.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('import').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f || !catalog) return;
  try {
    if (f.size > 5e6) throw Error('文件超过 5 MB');
    const data = JSON.parse(await f.text());
    if (
      data.schemaVersion !== 'reader-notes/v1' ||
      data.snapshotId !== catalog.snapshot.id ||
      !Array.isArray(data.records)
    )
      throw Error('格式或数据快照不匹配');
    const imported = [];
    for (const r of data.records) {
      const c = byId.get(r.chapterId);
      if (
        !c ||
        !Number.isInteger(r.index) ||
        r.index < 0 ||
        r.index >= c.lineCount ||
        r.sha256 !== c.sha256 ||
        r.member !== c.member ||
        r.pointer !== `/storyList/${r.index}` ||
        typeof r.note !== 'string' ||
        typeof r.bookmark !== 'boolean' ||
        typeof r.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(r.updatedAt))
      )
        throw Error('存在无效的段落记录');
      imported.push(r);
    }
    saveDraft();
    for (const r of imported) {
      const i = records.findIndex((x) => x.chapterId === r.chapterId && x.index === r.index);
      if (i < 0) records.push(r);
      else if (Date.parse(r.updatedAt) > Date.parse(records[i].updatedAt)) records[i] = r;
    }
    persist();
    renderNotes();
    if (selected) selectLine(selected.index);
    toast('已按段落合并笔记');
  } catch (e) {
    toast('导入失败：' + e.message);
  } finally {
    $('import').value = '';
  }
};
$('sources').onclick = () => $('sourceDialog').showModal();
$('closeDialog').onclick = () => $('sourceDialog').close();
window.addEventListener('beforeunload', saveDraft);
initReadingSession({
  getSelected: () => selected,
  selectLine,
  isLoading: () => loadingChapter || document.documentElement.dataset.view !== 'reader',
  notify: toast,
});
function openPage(view, push = true) {
  saveDraft();
  request++;
  loadingChapter = false;
  showView(view);
  if (push && location.hash !== '#' + view) history.pushState(null, '', '#' + view);
  if (view === 'home') $('homeView').scrollTop = 0;
}
function resumeReader() {
  if (!catalog) return toast('资料库尚未载入');
  if (current) {
    showView('reader');
    history.pushState(null, '', '#' + current.meta.id + (selected ? '/' + selected.index : ''));
    return;
  }
  if (resumePosition) navigate(resumePosition.chapterId, resumePosition.index);
}
function openSearch(query = '') {
  openPage('search');
  if (query) {
    $('globalQuery').value = query;
    $('searchField').value = 'all';
    $('searchGo').click();
  }
  $('globalQuery').focus({ preventScroll: true });
  $('searchView').scrollTop = 0;
}
initApplication({ home: () => openPage('home'), read: resumeReader, search: openSearch });
window.addEventListener('hashchange', () => {
  if (!catalog) return;
  const hash = location.hash;
  if (hash === '#home' || !hash) return openPage('home', false);
  if (hash === '#search') return openPage('search', false);
  if (!byId.has(hash.slice(1).split('/')[0])) return;
  const target = resolveReadingPosition(catalog.chapters, hash, null, null);
  navigate(target.chapterId, target.index);
});
initCorpusSearch((id, index, query) => navigate(id, index, query));
$('clearSearchHighlight').onclick = () => {
  searchHighlight = '';
  renderContent();
  if (selected) $('line-' + selected.index)?.focus({ preventScroll: true });
};
try {
  const active = await json('/api/data/status');
  dataBase = active.dataBase;
  catalog = await json(dataBase + '/catalog.json');
  setSearchSnapshot(catalog.snapshot.id);
  setFigureSnapshot(catalog.snapshot.id);
  initDataUpdates(() => catalog.snapshot.id);
  catalog.chapters.forEach((c) => byId.set(c.id, c));
  storageKey = 'terra-source-notes-' + catalog.snapshot.id;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    records = Array.isArray(saved) ? saved : [];
  } catch {
    toast('无法读取浏览器笔记，请从导出文件恢复');
  }
  $('stats').textContent =
    `${catalog.chapters.length.toLocaleString()} 篇 · ${catalog.events.filter((e) => catalog.chapters.some((c) => c.eventId === e.id)).length} 个目录`;
  $('sourceInfo').textContent = JSON.stringify(catalog.snapshot, null, 2);
  $('releaseLink').href = catalog.snapshot.releaseUrl;
  for (const t of [...new Set(catalog.chapters.map((c) => c.type))].sort()) {
    const o = make(
      'option',
      '',
      {
        MAINLINE: '主线',
        ACTIVITY: '活动',
        ROGUELIKE: '集成战略',
        EXTRA: '补充',
        NONE: '其他 / 密录',
      }[t] || t,
    );
    o.value = t;
    $('type').append(o);
  }
  renderTree();
  renderNotes();
  let last, previous;
  try {
    last = localStorage.getItem(storageKey + '-last');
    previous = JSON.parse(
      localStorage.getItem('terra-reading-position-' + catalog.snapshot.id) || 'null',
    );
  } catch {}
  resumePosition = resolveReadingPosition(catalog.chapters, '', previous, last);
  setHomeStats(
    catalog,
    byId.get(resumePosition.chapterId)?.title +
      (Number.isInteger(resumePosition.index) ? ' · #' + resumePosition.index : ''),
  );
  if (byId.has(location.hash.slice(1).split('/')[0])) {
    const initial = resolveReadingPosition(catalog.chapters, location.hash, previous, last);
    await navigate(initial.chapterId, initial.index);
  } else showView(location.hash === '#search' ? 'search' : 'home');
} catch (e) {
  $('homeResumeLabel').textContent = '资料库未就绪，请先准备数据。';
  $('content').textContent =
    '资料库未就绪。请先运行 scripts/prepare.py，再运行 scripts/serve.py。\n' + e.message;
}
