import { readData } from './static-data.js';
const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

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
  let content = null;
  async function api(options) {
    const key = 'terra-online-home';
    if (options?.method === 'POST') {
      const data = JSON.parse(options.body);
      localStorage.setItem(key, JSON.stringify(data));
      return data;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.title && Array.isArray(saved.sections)) return saved;
    } catch {}
    return readData('home.json');
  }

  function render(data) {
    content = data;
    $('homeTitle').textContent = data.title;
    $('homeIntro').textContent = data.intro;
    $('homeSections').replaceChildren();
    data.sections.forEach((section, i) => {
      const card = node('article', undefined, 'homeSection');
      card.append(
        node('span', String(i + 1).padStart(2, '0'), 'homeNumber'),
        node('h2', section.title),
        node('p', section.body),
      );
      $('homeSections').append(card);
    });
  }
  api()
    .then((data) => {
      render(data);
      $('editHome').disabled = false;
      $('homeLoadStatus').textContent = '';
    })
    .catch((error) => ($('homeLoadStatus').textContent = '首页说明读取失败：' + error.message));
  function addSection(section = { title: '', body: '' }) {
    const row = node('fieldset', undefined, 'homeEditSection');
    row.append(node('legend', '说明区块'));
    const title = node('input');
    title.value = section.title;
    title.maxLength = 100;
    title.required = true;
    title.className = 'sectionTitle';
    const body = node('textarea');
    body.value = section.body;
    body.rows = 5;
    body.maxLength = 6000;
    body.required = true;
    body.className = 'sectionBody';
    const titleLabel = node('label', '区块标题');
    titleLabel.append(title);
    const bodyLabel = node('label', '正文（纯文本，支持换行）');
    bodyLabel.append(body);
    const remove = node('button', '移除此区块');
    remove.type = 'button';
    remove.onclick = () => {
      row.remove();
      updateAdd();
    };
    row.append(titleLabel, bodyLabel, remove);
    $('homeEditSections').append(row);
    updateAdd();
  }
  function updateAdd() {
    $('addHomeSection').disabled = $('homeEditSections').children.length >= 8;
  }
  $('editHome').onclick = () => {
    if (!content) return;
    $('editHomeTitle').value = content.title;
    $('editHomeIntro').value = content.intro;
    $('homeEditSections').replaceChildren();
    content.sections.forEach(addSection);
    $('homeEditStatus').textContent = '仅保存到当前浏览器，不影响其他访客。';
    $('homeEditor').showModal();
  };
  $('addHomeSection').onclick = () => addSection();
  $('cancelHomeEdit').onclick = () => $('homeEditor').close();
  $('homeEditForm').onsubmit = async (event) => {
    event.preventDefault();
    const sections = [...$('homeEditSections').children].map((row) => ({
      title: row.querySelector('.sectionTitle').value,
      body: row.querySelector('.sectionBody').value,
    }));
    if (!sections.length) {
      $('homeEditStatus').textContent = '请至少保留一个说明区块。';
      return;
    }
    $('saveHomeEdit').disabled = true;
    $('homeEditStatus').textContent = '正在保存到当前浏览器…';
    try {
      const data = await api({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: $('editHomeTitle').value,
          intro: $('editHomeIntro').value,
          sections,
        }),
      });
      render(data);
      $('homeEditor').close();
      $('homeLoadStatus').textContent = '首页已保存到当前浏览器。';
    } catch (error) {
      $('homeEditStatus').textContent = '保存失败：' + error.message;
    } finally {
      $('saveHomeEdit').disabled = false;
    }
  };
}
