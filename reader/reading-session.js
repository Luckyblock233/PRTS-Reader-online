// Source indices stay independent of upstream sourceId and of the filtered DOM order.
export function stepReadingIndex(indices, current, direction) {
  if (!indices.length) return null;
  if (!Number.isInteger(current)) return indices[0];
  const ordered = direction > 0 ? indices : indices.slice().reverse();
  return ordered.find((index) => (direction > 0 ? index > current : index < current)) ?? null;
}

export function resolveReadingPosition(chapters, hash, saved, legacyId) {
  const lookup = new Map(chapters.map((ch) => [ch.id, ch]));
  const savedChapter = saved && lookup.get(saved.chapterId);
  const validSaved =
    savedChapter &&
    saved.sourceHash === savedChapter.sha256 &&
    (saved.index === null ||
      (Number.isInteger(saved.index) && saved.index >= 0 && saved.index < savedChapter.lineCount));
  const [hashId, hashLine] = hash.replace(/^#/, '').split('/');
  if (lookup.has(hashId)) {
    const meta = lookup.get(hashId);
    const explicit = /^\d+$/.test(hashLine ?? '') ? Number(hashLine) : null;
    if (explicit !== null && Number.isSafeInteger(explicit) && explicit < meta.lineCount) {
      return { chapterId: hashId, index: explicit };
    }
    return {
      chapterId: hashId,
      index: validSaved && saved.chapterId === hashId ? saved.index : null,
    };
  }
  if (validSaved) return { chapterId: saved.chapterId, index: saved.index };
  const initial = lookup.has(legacyId)
    ? legacyId
    : (chapters.find((ch) => ch.type === 'MAINLINE')?.id ?? chapters[0]?.id);
  return { chapterId: initial, index: null };
}

export function saveReadingPosition(snapshotId, meta, index) {
  try {
    localStorage.setItem(
      'terra-reading-position-' + snapshotId,
      JSON.stringify({
        chapterId: meta.id,
        index,
        sourceHash: meta.sha256,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* Reading remains available when site storage is disabled. */
  }
}

export function revealCurrentChapter() {
  const panel = document.getElementById('chapterPanel');
  const chapter = panel?.querySelector('.chapter.active');
  if (!chapter || !panel.clientHeight) return;
  chapter.closest('details').open = true;
  const bounds = panel.getBoundingClientRect();
  const target = chapter.getBoundingClientRect();
  panel.scrollTop += target.top - bounds.top - (panel.clientHeight - target.height) / 2;
}

export function initReadingSession({ getSelected, selectLine, isLoading, notify }) {
  const root = document.documentElement;
  const main = document.querySelector('main');
  const header = document.querySelector('.readerHeader');
  let anchor;
  function capturePosition() {
    if (main.scrollTop === 0) return { scrollTop: 0 };
    const edge = main.getBoundingClientRect().top + header.offsetHeight;
    const row = [...main.querySelectorAll('.line')].find(
      (el) => el.getBoundingClientRect().bottom > edge,
    );
    return row
      ? { row, offset: row.getBoundingClientRect().top - edge }
      : { scrollTop: main.scrollTop };
  }
  function restorePosition(position) {
    if (!position) return;
    if (position.row?.isConnected) {
      const edge = main.getBoundingClientRect().top + header.offsetHeight;
      main.scrollTop += position.row.getBoundingClientRect().top - edge - position.offset;
    } else if ('scrollTop' in position) main.scrollTop = position.scrollTop;
  }
  window.addEventListener('reader:beforeappearance', () => {
    anchor = capturePosition();
  });
  const view = document.getElementById('readerView');
  const wide = matchMedia('(min-width: 1151px)');
  const portrait = document.querySelector('.figureCard');
  const portraitHome = document.createComment('portrait home');
  portrait.before(portraitHome);
  let floatingPortrait = false;
  let sidebarPortraitOpen = portrait.open;
  let thumbnailOpen = null;
  const pinnedVisible = () => root.dataset.notes === 'pinned' && root.dataset.focus !== 'on';
  function syncPortrait() {
    const floating = view.dataset.panel !== 'notes' && !pinnedVisible();
    if (floating === floatingPortrait) return;
    if (floating) {
      sidebarPortraitOpen = portrait.open;
      document.getElementById('focusFigureSlot').append(portrait);
      portrait.open = thumbnailOpen ?? matchMedia('(min-width: 1200px)').matches;
    } else {
      thumbnailOpen = portrait.open;
      portraitHome.after(portrait);
      portrait.open = sidebarPortraitOpen;
    }
    floatingPortrait = floating;
  }
  function syncPanels() {
    syncPortrait();
    revealCurrentChapter();
    document
      .getElementById('inspectorToggle')
      .setAttribute('aria-expanded', String(view.dataset.panel === 'notes' || pinnedVisible()));
  }
  let lastFocus = root.dataset.focus;
  window.addEventListener('reader:appearance', () => {
    if (root.dataset.focus === 'on' && lastFocus !== 'on') closePanel(false);
    lastFocus = root.dataset.focus;
    syncPanels();
    restorePosition(anchor);
    anchor = null;
  });
  wide.addEventListener('change', syncPanels);
  syncPanels();
  function closePanel(restoreFocus = true) {
    const position = capturePosition();
    const previous = view.dataset.panel;
    delete view.dataset.panel;
    for (const id of ['catalogToggle', 'inspectorToggle'])
      document.getElementById(id).setAttribute('aria-expanded', 'false');
    syncPanels();
    if (previous && restoreFocus)
      document
        .getElementById(previous === 'catalog' ? 'catalogToggle' : 'inspectorToggle')
        .focus({ preventScroll: true });
    restorePosition(position);
  }
  for (const [id, panel] of [
    ['catalogToggle', 'catalog'],
    ['inspectorToggle', 'notes'],
  ]) {
    document.getElementById(id).onclick = () => {
      if (panel === 'notes' && pinnedVisible()) {
        const setting = document.getElementById('notesBehavior');
        setting.value = 'auto';
        setting.dispatchEvent(new Event('change'));
        return closePanel();
      }
      if (view.dataset.panel === panel) return closePanel();
      const position = capturePosition();
      closePanel(false);
      view.dataset.panel = panel;
      document.getElementById(id).setAttribute('aria-expanded', 'true');
      syncPanels();
      document
        .querySelector(panel === 'catalog' ? '#catalogSearch' : '#notesPanel [data-close-panel]')
        .focus({ preventScroll: true });
      restorePosition(position);
    };
  }
  document.querySelectorAll('[data-close-panel]').forEach(
    (button) =>
      (button.onclick = () => {
        if (button.closest('#notesPanel') && pinnedVisible()) {
          const setting = document.getElementById('notesBehavior');
          setting.value = 'auto';
          setting.dispatchEvent(new Event('change'));
        }
        closePanel();
      }),
  );
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element)) return;
    if (
      view.dataset.panel === 'notes' &&
      !event.target.closest('#notesPanel, #inspectorToggle') &&
      root.dataset.notes !== 'pinned'
    )
      closePanel(false);
    if (view.dataset.panel === 'catalog' && !event.target.closest('#chapterPanel, #catalogToggle'))
      closePanel(false);
    for (const id of ['readingSettings', 'readerFilters']) {
      if (!event.target.closest('#' + id)) document.getElementById(id).open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view.dataset.panel) {
      closePanel();
      event.preventDefault();
    }
  });
  document.getElementById('tree').addEventListener('click', (event) => {
    if (event.target.closest('.chapter')) closePanel();
  });
  for (const id of ['readingSettings', 'readerFilters']) {
    document.getElementById(id).addEventListener('toggle', (event) => {
      if (event.target.open)
        document.getElementById(
          id === 'readingSettings' ? 'readerFilters' : 'readingSettings',
        ).open = false;
    });
  }
  document.getElementById('exitFocus').onclick = () =>
    document.getElementById('focusToggle').click();
  document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    const editing =
      target instanceof Element &&
      target.closest(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
      );
    if (editing) return;
    if (event.key === 'Escape' && root.dataset.focus === 'on') {
      event.preventDefault();
      document.getElementById('focusToggle').click();
      return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || isLoading()) return;
    if (target instanceof Element && target.closest('button,a,summary,[role="button"]')) return;
    const rows = [...document.querySelectorAll('#content .line[data-reading-index]')];
    if (!rows.length) return; // Source JSON and an empty filter keep normal browser keys.
    const indices = rows.map((row) => Number(row.dataset.readingIndex));
    const index = stepReadingIndex(
      indices,
      getSelected()?.index,
      event.key === 'ArrowDown' ? 1 : -1,
    );
    event.preventDefault();
    if (index === null) {
      notify(event.key === 'ArrowDown' ? '已到当前可见文本的最后一段' : '已到当前可见文本的第一段');
      return;
    }
    selectLine(index);
    const row = document.getElementById('line-' + index);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
}
