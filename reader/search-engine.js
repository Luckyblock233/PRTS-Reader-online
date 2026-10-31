export function queryRecords(records, catalog, params) {
  const query = (params.q || '').trim();
  if (!query || query.length > 100) throw Error('请输入 1–100 个字符');
  const needle = query.toLowerCase();
  const field = params.field || 'all';
  const matches = records.filter(
    (r) =>
      (field !== 'speaker' && r[3].toLowerCase().includes(needle)) ||
      (field !== 'text' && r[2].toLowerCase().includes(needle)),
  );
  const counts = new Map();
  matches.forEach((r) => counts.set(r[0], (counts.get(r[0]) || 0) + 1));
  const events = new Map(catalog.events.map((e) => [e.id, e.name]));
  const chapters = catalog.chapters
    .filter((c) => counts.has(c.id))
    .map((c) => ({ ...c, eventName: events.get(c.eventId) || c.eventId, count: counts.get(c.id) }));
  const meta = new Map(chapters.map((c) => [c.id, c]));
  const visible = matches.filter((r) => !params.chapter || r[0] === params.chapter);
  const total = visible.length,
    pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.max(1, Math.min(Number(params.page) || 1, pages));
  const offset = (page - 1) * 50;
  return {
    query,
    page,
    pages,
    total,
    globalTotal: matches.length,
    chapterCount: chapters.length,
    chapters,
    start: total ? offset + 1 : 0,
    end: Math.min(total, offset + 50),
    results: visible
      .slice(offset, offset + 50)
      .map((r) => ({ ...meta.get(r[0]), chapter: r[0], index: r[1], speaker: r[2], text: r[3] })),
  };
}
export function contextLines(doc, index, radius) {
  const readable = doc.lines.filter(
    (l) => l.text.trim() || ['choice', 'branch'].includes(l.kind) || l.index === index,
  );
  const center = readable.findIndex((l) => l.index === index);
  if (center < 0) throw Error('段落编号无效');
  const start = Math.max(0, center - radius),
    end = Math.min(readable.length, center + radius + 1);
  return {
    beforeCount: center - start,
    afterCount: end - center - 1,
    hasEarlier: start > 0,
    hasLater: end < readable.length,
    lines: readable
      .slice(start, end)
      .map((l) => ({
        ...l,
        text:
          l.text ||
          (l.kind === 'branch'
            ? '分支引用：' + (l.raw.attributes?.references ?? '未提供')
            : String(l.raw.attributes?.options ?? '')),
      })),
  };
}
