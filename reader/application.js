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
  $('homeResumeLabel').textContent = resume ? '上次读到 · ' + resume : '选择一篇剧情，开始阅读';
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
