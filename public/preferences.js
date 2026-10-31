/* Apply before first paint; this key contains appearance only, never notes or API keys. */
(() => {
  const key = 'terra-reading-preferences-v1';
  const defaults = {
    theme: 'light',
    font: 'wenkai',
    density: 'comfortable',
    size: 'standard',
    focus: 'off',
  };
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    saved = {};
  }
  const options = {
    theme: ['light', 'dark'],
    font: ['wenkai', 'serif', 'sans'],
    density: ['comfortable', 'compact'],
    size: ['standard', 'large'],
    focus: ['off', 'on'],
  };
  const prefs = { ...defaults };
  for (const name of Object.keys(options)) {
    if (options[name].includes(saved?.[name])) prefs[name] = saved[name];
  }
  function apply() {
    Object.assign(document.documentElement.dataset, {
      theme: prefs.theme,
      font: prefs.font,
      density: prefs.density,
      textSize: prefs.size,
      focus: prefs.focus,
    });
    window.dispatchEvent(new Event('reader:appearance'));
  }
  apply();
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const $ = (id) => document.getElementById(id);
      function render() {
        const light = prefs.theme === 'light';
        $('themeToggle').textContent = light ? '☾ 夜间模式' : '☀ 白天模式';
        $('themeToggle').setAttribute('aria-label', light ? '切换到夜间模式' : '切换到白天模式');
        $('readingFont').value = prefs.font;
        $('compactToggle').setAttribute('aria-pressed', String(prefs.density === 'compact'));
        $('compactToggle').textContent = prefs.density === 'compact' ? '✓ 紧凑模式' : '紧凑模式';
        $('size').setAttribute('aria-pressed', String(prefs.size === 'large'));
        $('size').textContent = prefs.size === 'large' ? 'Aa · 大字' : 'Aa · 标准';
        $('appearanceHint').textContent =
          `${prefs.density === 'compact' ? '紧凑行距' : '舒适行距'} · ${prefs.size === 'large' ? '21' : '18'} px`;
        $('focusToggle').setAttribute('aria-pressed', String(prefs.focus === 'on'));
        $('focusToggle').textContent = prefs.focus === 'on' ? '退出专注' : '专注阅读';
        $('exitFocus').hidden = prefs.focus !== 'on';
      }
      function update(name, value) {
        prefs[name] = value;
        apply();
        render();
        try {
          localStorage.setItem(key, JSON.stringify(prefs));
        } catch {
          /* In-memory controls still work. */
        }
      }
      $('themeToggle').onclick = () => update('theme', prefs.theme === 'light' ? 'dark' : 'light');
      $('readingFont').onchange = (event) => update('font', event.target.value);
      $('compactToggle').onclick = () =>
        update('density', prefs.density === 'compact' ? 'comfortable' : 'compact');
      $('size').onclick = () => update('size', prefs.size === 'large' ? 'standard' : 'large');
      $('focusToggle').onclick = () => update('focus', prefs.focus === 'on' ? 'off' : 'on');
      render();
    },
    { once: true },
  );
})();
