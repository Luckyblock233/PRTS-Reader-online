const root = document.documentElement;
const header = document.querySelector('.appHeader');
let previousTarget = null;
let previousY = 0;
let distance = 0;
let settling = false;

function setHidden(hidden) {
  if ((root.dataset.headerHidden === 'true') === hidden) return;
  root.dataset.headerHidden = String(hidden);
  header.inert = hidden;
  distance = 0;
  // Changing the header offset can itself generate a scroll event.
  settling = true;
  requestAnimationFrame(() => {
    previousY = previousTarget?.scrollTop ?? 0;
    settling = false;
  });
}

document.addEventListener(
  'scroll',
  (event) => {
    const target = event.target === document ? document.scrollingElement : event.target;
    if (
      !(target instanceof Element) ||
      (target !== document.scrollingElement && !target.matches('#readerView main, #searchView'))
    )
      return;
    const y = target.scrollTop;
    if (settling) return;
    if (target !== previousTarget) {
      previousTarget = target;
      previousY = 0;
      distance = 0;
    }
    const delta = y - previousY;
    previousY = y;
    if (Math.sign(delta) !== Math.sign(distance)) distance = 0;
    distance += delta;
    if (y < 8 || distance < -24) setHidden(false);
    else if (y > 72 && distance > 48) setHidden(true);
  },
  { capture: true, passive: true },
);

// Returning to another app view should always expose navigation again.
window.addEventListener('reader:viewchange', () => setHidden(false));
window.addEventListener('reader:layoutchange', () => {
  settling = true;
  requestAnimationFrame(() => {
    previousY = previousTarget?.scrollTop ?? 0;
    distance = 0;
    settling = false;
  });
});
