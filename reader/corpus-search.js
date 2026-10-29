const $ = (id) => document.getElementById(id);
let corpusSnapshot = '';
export function setSearchSnapshot(snapshot) {
  corpusSnapshot = snapshot;
}
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function highlighted(target, text, query) {
  const source = String(text ?? '').replace(/<[^>]*>/g, '');
  const lower = source.toLocaleLowerCase(),
    needle = query.toLocaleLowerCase();
  let pos = 0,
    i;
  while (needle && (i = lower.indexOf(needle, pos)) >= 0) {
    target.append(
      document.createTextNode(source.slice(pos, i)),
      node('mark', source.slice(i, i + query.length)),
    );
    pos = i + query.length;
  }
  target.append(document.createTextNode(source.slice(pos)));
}
export function initCorpusSearch(navigate) {
  let version = 0,
    active = null,
    page = 1,
    pages = 1;
  function contextPanel(record, query, snapshot) {
    const details = node('details', undefined, 'searchContext');
    details.append(node('summary', '展开命中行前后文'));
    const status = node('p', '展开后读取前后各 3 条可读记录；保留分支标记。', 'hint');
    const body = node('div', undefined, 'contextBody');
    const more = node('button', '更多上下文（前后各 8 条）', 'contextMore');
    more.hidden = true;
    details.append(status, body, more);
    let loaded = false,
      busy = false,
      nextRadius = 3;
    async function load(radius) {
      if (busy) return;
      busy = true;
      more.disabled = true;
      status.textContent = '正在读取本篇上下文…';
      try {
        const params = new URLSearchParams({
          chapter: record.chapter,
          index: String(record.index),
          radius: String(radius),
          snapshot,
        });
        const response = await fetch('/api/search/context?' + params);
        const data = await response.json();
        if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
        body.replaceChildren();
        for (const line of data.lines) {
          const button = node(
            'button',
            undefined,
            'contextLine' + (line.index === record.index ? ' contextHit' : ''),
          );
          const label =
            {
              choice: '选项',
              branch: '分支标记',
              narration: '旁白',
              command: '脚本指令',
              text: '文本',
            }[line.kind] || '对白';
          button.append(
            node(
              'small',
              `${line.index === record.index ? '命中行 · ' : ''}#${line.index} · 源行 ${line.sourceId ?? '—'} · ${label}`,
            ),
          );
          const speaker = node('strong');
          highlighted(speaker, line.speaker || label, query);
          button.append(speaker);
          const text = node('p');
          highlighted(text, line.text, query);
          button.append(text);
          button.onclick = () => navigate(record.chapter, line.index, query);
          body.append(button);
        }
        loaded = true;
        status.textContent = `前 ${data.beforeCount} 条 / 后 ${data.afterCount} 条 · 按源文件顺序展示，分支不代表全部实际发生。点击任一行回到正文。`;
        nextRadius = radius < 8 ? 8 : 20;
        more.hidden = radius >= 20 || (!data.hasEarlier && !data.hasLater);
        more.textContent = `更多上下文（前后各 ${nextRadius} 条）`;
      } catch (error) {
        status.textContent = '上下文读取失败：' + error.message;
        more.hidden = false;
        more.textContent = '重试读取上下文';
        nextRadius = radius;
      } finally {
        busy = false;
        more.disabled = false;
      }
    }
    details.ontoggle = () => {
      if (details.open && !loaded) load(3);
    };
    more.onclick = () => load(nextRadius);
    return details;
  }
  const pager = (loading = false) => {
    $('searchPrev').disabled = loading || page <= 1;
    $('searchNext').disabled = loading || page >= pages;
  };
  async function run(requestedPage = 1, newQuery = false) {
    const q = newQuery ? $('globalQuery').value.trim() : active?.q;
    if (!q || q.length > 100) {
      $('searchStatus').textContent = '请输入 1–100 个字符';
      return;
    }
    if (newQuery) {
      active = { q, field: $('searchField').value };
      $('searchChapter').value = '';
      $('topSearchQuery').value = q;
    }
    const ticket = ++version;
    const selectedChapter = $('searchChapter').value;
    $('searchStatus').textContent = '正在检索全库…';
    $('results').replaceChildren();
    pager(true);
    $('searchChapter').disabled = true;
    try {
      const snapshot = corpusSnapshot;
      const params = new URLSearchParams({
        q: active.q,
        field: active.field,
        page: String(requestedPage),
        page_size: '50',
        chapter: selectedChapter,
        snapshot,
      });
      const response = await fetch('/api/search?' + params);
      const data = await response.json();
      if (ticket !== version) return;
      if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
      page = data.page;
      pages = data.pages;
      $('searchStatus').textContent =
        `“${active.q}”命中 ${data.chapterCount.toLocaleString()} 篇、${data.globalTotal.toLocaleString()} 条记录。${selectedChapter ? '当前篇章：' : ''}显示 ${data.start}–${data.end} / ${data.total.toLocaleString()} 条。`;
      $('searchPage').textContent = `${page} / ${pages} 页`;
      $('searchChapter').replaceChildren(node('option', `全部命中篇章（${data.chapterCount} 篇）`));
      $('searchChapter').firstChild.value = '';
      for (const chapter of data.chapters) {
        const o = node(
          'option',
          `${chapter.eventName} / ${chapter.code} ${chapter.title} ${chapter.tag} · ${chapter.count} 条`,
        );
        o.value = chapter.id;
        $('searchChapter').append(o);
      }
      $('searchChapter').value = selectedChapter;
      $('searchChapter').disabled = !data.chapterCount;
      let previousChapter = null;
      const resultQuery = data.query;
      for (const record of data.results) {
        if (record.chapter !== previousChapter) {
          const h = node(
            'h3',
            `${record.eventName} · ${record.code} ${record.title} ${record.tag}`,
            'searchGroup',
          );
          $('results').append(h);
          previousChapter = record.chapter;
        }
        const button = node('button', undefined, 'result');
        button.append(
          node('small', `段落 #${record.index} · 源行 ${record.sourceId ?? '—'} · ${record.kind}`),
        );
        const speaker = node('strong');
        highlighted(speaker, record.speaker || '无发言标签', active.q);
        button.append(speaker);
        const text = node('p');
        const hit = record.text.toLocaleLowerCase().indexOf(active.q.toLocaleLowerCase());
        const start = Math.max(0, hit - 45);
        highlighted(
          text,
          (start ? '…' : '') +
            record.text.slice(start, start + 220) +
            (record.text.length > start + 220 ? '…' : ''),
          active.q,
        );
        button.append(text);
        const path = node('small', `${record.member}\n${record.pointer}`, 'searchSource');
        button.append(path);
        button.onclick = () => navigate(record.chapter, record.index, resultQuery);
        const hitCard = node('article', undefined, 'searchHit');
        hitCard.append(button, contextPanel(record, resultQuery, snapshot));
        $('results').append(hitCard);
      }
      if (!data.total)
        $('results').append(node('p', '没有匹配记录。可换个关键词或检索字段。', 'hint'));
      pager();
    } catch (error) {
      if (ticket !== version) return;
      $('searchStatus').textContent = '检索失败：' + error.message;
      $('searchPage').textContent = '—';
      page = 1;
      pages = 1;
      pager();
      $('searchChapter').disabled = true;
    }
  }
  $('searchGo').onclick = () => run(1, true);
  $('globalQuery').onkeydown = (event) => {
    if (event.key === 'Enter' && !event.isComposing) run(1, true);
  };
  $('searchField').onchange = () => {
    if (active) run(1, true);
  };
  $('searchChapter').onchange = () => run(1);
  $('searchPrev').onclick = () => run(page - 1);
  $('searchNext').onclick = () => run(page + 1);
}
