/* Apply before first paint; this key contains appearance only, never notes or API keys. */
(() => {
  const key = 'terra-reading-preferences-v1';
  const defaults = {
    theme: 'light',
    font: 'serif',
    density: 'comfortable',
    size: 'standard',
    focus: 'off',
    spacing: 'comfortable',
    notes: 'auto',
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
    spacing: ['comfortable', 'close', 'loose'],
    notes: ['auto', 'pinned'],
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
      spacing: prefs.spacing,
      focus: prefs.focus,
      notes: prefs.notes,
    });
  }
  apply();
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const $ = (id) => document.getElementById(id);
      function render() {
        const light = prefs.theme === 'light';
        $('themeToggle').textContent = light ? '☾' : '☀';
        $('themeToggle').setAttribute('aria-label', light ? '切换到夜间模式' : '切换到白天模式');
        $('readingFont').value = prefs.font;
        $('lineSpacing').value = prefs.spacing;
        $('notesBehavior').value = prefs.notes;
        $('compactToggle').setAttribute('aria-pressed', String(prefs.density === 'compact'));
        $('compactToggle').textContent = prefs.density === 'compact' ? '✓ 紧凑模式' : '紧凑模式';
        $('size').setAttribute('aria-pressed', String(prefs.size === 'large'));
        $('size').textContent = prefs.size === 'large' ? '大字 · 21 px' : '标准 · 18 px';
        $('focusToggle').setAttribute('aria-pressed', String(prefs.focus === 'on'));
        $('focusToggle').textContent = prefs.focus === 'on' ? '退出专注' : '专注阅读';
        $('exitFocus').hidden = prefs.focus !== 'on';
      }
      function update(name, value) {
        window.dispatchEvent(new Event('reader:beforeappearance'));
        prefs[name] = value;
        apply();
        render();
        window.dispatchEvent(new Event('reader:appearance'));
        try {
          localStorage.setItem(key, JSON.stringify(prefs));
        } catch {
          /* In-memory controls still work. */
        }
      }
      $('themeToggle').onclick = () => update('theme', prefs.theme === 'light' ? 'dark' : 'light');
      $('notesBehavior').onchange = (event) => update('notes', event.target.value);
      $('lineSpacing').onchange = (event) => update('spacing', event.target.value);
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
