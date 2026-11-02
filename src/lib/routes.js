export function sitePath(path = '', base = import.meta.env?.BASE_URL ?? '/') {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

// Preserve links shared before the reader became an independent page.
export function legacyReaderPath(hash, base) {
  if (!hash || hash === '#home') return null;
  if (!/^#[\w-]+(?:\/\d+)?$/.test(hash)) return null;
  return sitePath('reader/', base) + (hash === '#reader' ? '' : hash);
}
