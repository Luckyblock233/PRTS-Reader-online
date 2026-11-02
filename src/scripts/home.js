import { legacyReaderPath } from '../lib/routes.js';

function routeLegacyLink() {
  const target = legacyReaderPath(location.hash);
  if (target) location.replace(target);
}
routeLegacyLink();
window.addEventListener('hashchange', routeLegacyLink);

const home = document.getElementById('homeView');
try {
  const snapshot = home.dataset.snapshotId;
  const saved = JSON.parse(localStorage.getItem('terra-reading-position-' + snapshot) || 'null');
  const legacy = localStorage.getItem('terra-source-notes-' + snapshot + '-last');
  if (saved?.chapterId || legacy) {
    document.getElementById('homeResumeLabel').textContent = '已保存阅读进度 · 点击继续阅读';
  }
} catch {
  // The reader can still open when browser storage is unavailable.
}
