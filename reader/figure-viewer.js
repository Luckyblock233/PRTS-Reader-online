const $ = (id) => document.getElementById(id);
let currentFigure = null;

export function setViewerFigure(figure) {
  currentFigure = figure;
  $('figureOpen').hidden = !figure;
}

export function initFigureViewer() {
  const scales = [100, 125, 150, 200];
  const scaleStorageKey = 'terra-portrait-scale-v1';
  let scaleIndex = 0;
  try {
    const savedIndex = scales.indexOf(Number(localStorage.getItem(scaleStorageKey)));
    if (savedIndex !== -1) scaleIndex = savedIndex;
  } catch {
    // The default size remains available when browser storage is disabled.
  }
  const scaleButton = $('figureScale');
  function applyScale() {
    const percent = scales[scaleIndex];
    $('readerView').style.setProperty('--portrait-size', `${(180 * percent) / 100}px`);
    scaleButton.textContent = `${percent}%`;
    scaleButton.setAttribute('aria-label', `立绘大小 ${percent}%，点击切换`);
  }
  applyScale();
  scaleButton.onclick = () => {
    scaleIndex = (scaleIndex + 1) % scales.length;
    applyScale();
    try {
      localStorage.setItem(scaleStorageKey, String(scales[scaleIndex]));
    } catch {
      // Keep size switching usable even when the preference cannot be saved.
    }
    scaleButton.closest('details').open = true;
  };

  const dialog = $('figureViewer');
  const viewport = $('figureViewerViewport');
  const image = $('figureViewerImage');
  const closeButton = $('figureViewerClose');
  let zoom = 1;
  let fitting = true;
  let drag = null;
  let returnFocus = null;
  let readingScroll = 0;
  let notesScroll = 0;

  function renderZoom(next, point) {
    if (!image.naturalWidth || !dialog.open) return;
    const oldWidth = image.width;
    const oldHeight = image.height;
    const x = point?.x ?? viewport.clientWidth / 2;
    const y = point?.y ?? viewport.clientHeight / 2;
    const imageX =
      (viewport.scrollLeft + x - Math.max(0, (viewport.clientWidth - oldWidth) / 2)) / oldWidth;
    const imageY =
      (viewport.scrollTop + y - Math.max(0, (viewport.clientHeight - oldHeight) / 2)) / oldHeight;
    zoom = Math.max(0.05, Math.min(8, next));
    image.style.width = `${image.naturalWidth * zoom}px`;
    image.style.height = `${image.naturalHeight * zoom}px`;
    viewport.scrollLeft =
      imageX * image.width - x + Math.max(0, (viewport.clientWidth - image.width) / 2);
    viewport.scrollTop =
      imageY * image.height - y + Math.max(0, (viewport.clientHeight - image.height) / 2);
    $('figureZoomLabel').textContent = `${Math.round(zoom * 100)}%`;
    $('figureZoomOut').disabled = zoom <= 0.05;
    $('figureZoomIn').disabled = zoom >= 8;
  }
  function fit() {
    fitting = true;
    renderZoom(
      Math.min(
        (viewport.clientWidth - 32) / image.naturalWidth,
        (viewport.clientHeight - 32) / image.naturalHeight,
        1,
      ),
    );
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  function changeZoom(factor, point) {
    fitting = false;
    renderZoom(zoom * factor, point);
  }
  $('figureOpen').onclick = () => {
    if (!currentFigure) return;
    const figure = currentFigure;
    returnFocus = document.activeElement;
    readingScroll = document.querySelector('#readerView main').scrollTop;
    notesScroll = $('notesPanel').scrollTop;
    $('figureViewerTitle').textContent = figure.name;
    $('figureViewerSource').textContent = [
      `figure_art · ${figure.ref}`,
      figure.member,
      `${figure.pointer ?? ''} · sourceId=${figure.sourceId ?? '—'}`,
    ]
      .filter(Boolean)
      .join('\n');
    $('figureViewerOriginal').href = figure.url;
    image.alt = `${figure.name} · ${figure.ref}`;
    image.style.width = '';
    image.style.height = '';
    image.onload = fit;
    image.src = figure.url;
    dialog.showModal();
    if (image.complete && image.naturalWidth) fit();
    closeButton.focus({ preventScroll: true });
  };
  closeButton.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    drag = null;
    viewport.classList.remove('dragging');
    returnFocus?.focus({ preventScroll: true });
    document.querySelector('#readerView main').scrollTop = readingScroll;
    $('notesPanel').scrollTop = notesScroll;
  });
  $('figureZoomIn').onclick = () => changeZoom(1.25);
  $('figureZoomOut').onclick = () => changeZoom(1 / 1.25);
  $('figureZoomFit').onclick = fit;
  $('figureZoomOriginal').onclick = () => {
    fitting = false;
    renderZoom(1);
  };
  dialog.addEventListener('keydown', (event) => {
    if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      changeZoom(event.key === '-' ? 1 / 1.25 : 1.25);
    }
  });
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      changeZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    { passive: false },
  );
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  });
  function endDrag(event) {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    viewport.classList.remove('dragging');
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);
  new ResizeObserver(() => {
    if (dialog.open && fitting && image.naturalWidth) fit();
  }).observe(viewport);
}
