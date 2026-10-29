const $ = (id) => document.getElementById(id);
// Hash the full source speaker label: identical labels keep their color across chapters.
export function speakerColor(name) {
  let hash = 2166136261;
  for (const c of name) {
    hash ^= c.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const h = hash >>> 0;
  const hue = ((h / 4294967296) * 360).toFixed(6),
    s = 50 + ((h >>> 20) % 20);
  return `light-dark(hsl(${hue} ${s}% ${24 + ((h >>> 16) % 4)}%), hsl(${hue} ${s}% ${74 + ((h >>> 16) % 7)}%))`;
}
let figureVersion = 0;
let figureSnapshot = '';
export function setFigureSnapshot(snapshot) {
  figureSnapshot = snapshot;
}
async function api(url, options) {
  const r = await fetch(url, options);
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error('本地服务响应无效，请重启新版服务');
  }
  if (!r.ok) throw Error(data.error || data.message || `HTTP ${r.status}`);
  return data;
}
export function clearFigure() {
  figureVersion++;
  $('figureName').textContent = '选择一段对白';
  $('figureName').style.color = '';
  $('figureImage').hidden = true;
  $('figureImage').removeAttribute('src');
  $('figureEmpty').hidden = false;
  $('figureEmpty').textContent = '点击记录，在此查看对应立绘。';
  $('figureRef').textContent = 'figure_art · 尚未选择';
  $('figureStatus').textContent = '只展示记录明确引用的资源，不用立绘推断角色身份。';
}
export async function showFigure(line) {
  const version = ++figureVersion;
  const name = line.speaker || '无发言标签';
  const ref = line.raw.figure_art;
  $('figureName').textContent = name;
  $('figureName').style.color = line.speaker ? speakerColor(line.speaker) : '';
  $('figureImage').hidden = true;
  $('figureImage').removeAttribute('src');
  $('figureEmpty').hidden = false;
  $('figureRef').textContent = 'figure_art · ' + (ref || '未提供');
  if (!ref) {
    $('figureEmpty').textContent = '此记录没有 figure_art';
    $('figureStatus').textContent = '不沿用上一条记录的立绘。';
    return;
  }
  $('figureEmpty').textContent = '正在读取立绘…';
  $('figureStatus').textContent = '从本地缓存读取；缺失时尝试下载精确匹配的 PNG。';
  try {
    const image = await api(
      '/api/figure?ref=' +
        encodeURIComponent(ref) +
        '&snapshot=' +
        encodeURIComponent(figureSnapshot),
    );
    if (version !== figureVersion) return;
    if (image.status !== 'ready') {
      $('figureEmpty').textContent = '立绘暂不可用';
      $('figureStatus').textContent = image.message;
      return;
    }
    const img = $('figureImage');
    img.alt = `${name} · ${ref}`;
    img.onload = () => {
      if (version !== figureVersion) return;
      img.hidden = false;
      $('figureEmpty').hidden = true;
    };
    img.onerror = () => {
      if (version !== figureVersion) return;
      img.hidden = true;
      $('figureEmpty').hidden = false;
      $('figureEmpty').textContent = '本地图片读取失败';
    };
    img.src = 'assets/' + image.file;
    $('figureStatus').textContent =
      '已缓存到本地 · ' + Math.round(image.bytes / 1024) + ' KB · 精确资源匹配';
  } catch (e) {
    if (version !== figureVersion) return;
    $('figureEmpty').textContent = '立绘暂不可用';
    $('figureStatus').textContent = e.message;
  }
}
