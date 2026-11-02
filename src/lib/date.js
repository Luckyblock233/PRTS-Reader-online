export function formatPublishedAt(value) {
  const date = new Date(value || NaN);
  if (!Number.isFinite(date.getTime())) return '暂无发布时间';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
