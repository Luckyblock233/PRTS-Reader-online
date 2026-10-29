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

export function initReadingSession({ getSelected, selectLine, isLoading, notify }) {
  const root = document.documentElement;
  const portrait = document.querySelector('.figureCard');
  const anchor = document.createComment('portrait home');
  portrait.before(anchor);
  let focus = null;
  function applyFocus() {
    const active = root.dataset.focus === 'on';
    if (active === focus) return;
    focus = active;
    if (active) {
      document.getElementById('focusFigureSlot').append(portrait);
      const main = document.querySelector('main');
      main.tabIndex = -1;
      (document.querySelector('.line.selected') || main).focus({ preventScroll: true });
    } else anchor.after(portrait);
  }
  applyFocus();
  window.addEventListener('reader:appearance', applyFocus);
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
