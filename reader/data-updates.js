const $ = (id) => document.getElementById(id);
const date = (value) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—');
const size = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function initDataUpdates(getSnapshot) {
  let candidate = null,
    timer = null,
    busy = false;
  async function api(path, body) {
    const response = await fetch(
      '/api/data/' + path,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error('请先重启新版阅读器服务');
    }
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  function render(data) {
    const current = data.current.snapshot;
    $('currentDataTag').textContent = current.releaseTag;
    $('currentDataDate').textContent = '发布时间 · ' + date(current.publishedAt);
    candidate = data.candidate;
    const running = data.state === 'running';
    $('checkDataUpdates').disabled = running || busy;
    $('installDataUpdate').hidden = !candidate?.available || running;
    $('installDataUpdate').disabled = busy;
    const needsReload = data.state === 'complete' && getSnapshot() !== current.id;
    $('reloadDataUpdate').hidden = !needsReload;
    $('dataUpdateCandidate').hidden = !candidate;
    if (candidate) {
      $('latestDataTag').textContent = candidate.releaseTag;
      $('latestDataDetail').textContent =
        `${date(candidate.publishedAt)} · 中文剧情包 ${size(candidate.size)} · SHA-256 ${candidate.sha256.slice(0, 16)}…`;
      $('dataReleaseLink').href = candidate.releaseUrl;
      const astr = candidate.astr;
      $('latestAstr').textContent = astr
        ? `ASTR · ${astr.source || 'ASTR-Script'}${astr.sourceCommit ? ' @ ' + astr.sourceCommit.slice(0, 12) : ''}`
        : '';
      $('dataCheckTime').textContent = '检查于 ' + date(candidate.checkedAt);
    }
    const progress = $('dataUpdateProgress');
    progress.hidden = !running;
    if (running && data.phase === 'download' && data.totalBytes) {
      progress.max = data.totalBytes;
      progress.value = data.bytesReceived || 0;
    } else progress.removeAttribute('value');
    const downloading = running && data.phase === 'download' && data.totalBytes;
    $('dataUpdateStatus').textContent =
      (data.state === 'complete' && !needsReload
        ? '当前应用已载入更新后的资料库。'
        : data.state === 'idle' && candidate
          ? candidate.message
          : data.message) +
      (downloading ? ` ${size(data.bytesReceived || 0)} / ${size(data.totalBytes)}` : '');
    if (running) poll();
  }
  function poll() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        render(await api('updates'));
      } catch (error) {
        $('dataUpdateStatus').textContent =
          '读取更新进度失败：' + error.message + '。可稍后重新检查状态。';
        $('checkDataUpdates').disabled = false;
      }
    }, 1500);
  }
  $('checkDataUpdates').onclick = async () => {
    if (busy) return;
    busy = true;
    $('checkDataUpdates').disabled = true;
    $('installDataUpdate').hidden = true;
    $('dataUpdateStatus').textContent = '正在检查 GitHub 正式剧情发布包…';
    try {
      const state = await api('updates');
      if (state.state === 'running') {
        busy = false;
        render(state);
        return;
      }
      const data = await api('check', {});
      busy = false;
      render(data);
    } catch (error) {
      busy = false;
      $('checkDataUpdates').disabled = false;
      $('dataUpdateStatus').textContent = '检查失败：' + error.message;
    }
  };
  $('installDataUpdate').onclick = async () => {
    if (busy || !candidate?.available) return;
    busy = true;
    $('installDataUpdate').disabled = true;
    $('checkDataUpdates').disabled = true;
    try {
      const data = await api('install', { token: candidate.token });
      busy = false;
      render(data);
    } catch (error) {
      busy = false;
      $('installDataUpdate').disabled = false;
      $('checkDataUpdates').disabled = false;
      $('dataUpdateStatus').textContent = '未开始更新：' + error.message;
    }
  };
  $('reloadDataUpdate').onclick = () => {
    location.hash = 'home';
    location.reload();
  };
  api('updates')
    .then(render)
    .catch((error) => ($('dataUpdateStatus').textContent = '更新状态不可用：' + error.message));
}
