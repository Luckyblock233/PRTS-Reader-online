export const siteUrl = (path) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;
export async function readData(path) {
  const response = await fetch(siteUrl(path));
  if (!response.ok) throw Error(`数据加载失败 (${response.status})`);
  return response.json();
}
