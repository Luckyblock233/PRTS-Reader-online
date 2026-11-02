const $ = (id) => document.getElementById(id);

export function showView(view) {
  document.documentElement.dataset.view = view;
  $('homeView').hidden = view !== 'home';
  $('readerView').hidden = view !== 'reader';
  $('searchView').hidden = view !== 'search';
  for (const [id, key] of [
    ['homeNav', 'home'],
    ['readerNav', 'reader'],
  ]) {
    if (view === key) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  $('openGlobalSearch').classList.toggle('active', view === 'search');
}

export function setHomeStats(catalog, resume) {
  $('homeChapterCount').textContent = catalog.chapters.length.toLocaleString();
  $('homeLineCount').textContent = catalog.chapters
    .reduce((sum, chapter) => sum + chapter.lineCount, 0)
    .toLocaleString();
  const publishedAt = catalog.snapshot.publishedAt;
  const published = $('homePublishedAt');
  published.textContent = formatPublishedAt(publishedAt);
  if (published.textContent !== '暂无发布时间') published.dateTime = publishedAt;
  else published.removeAttribute('datetime');
  $('homeResumeLabel').textContent = resume ? '上次读到 · ' + resume : '选择一篇剧情，开始阅读';
}

export function formatPublishedAt(value) {
  const date = new Date(value || NaN);
  if (!Number.isFinite(date.getTime())) return '暂无发布时间';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function initApplication({ home, read, search }) {
  $('homeNav').onclick = home;
  $('readerNav').onclick = read;
  $('homeRead').onclick = read;
  $('homeSearch').onclick = () => search('');
  $('topSearchForm').onsubmit = (event) => {
    event.preventDefault();
    search($('topSearchQuery').value.trim());
  };
}
