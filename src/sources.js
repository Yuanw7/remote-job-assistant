import { plain, safeUrl } from './domain.js';

export async function getJson(url, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}${response.headers.get('retry-after') ? `; Retry-After=${response.headers.get('retry-after')}（本次不立即重试）` : ''}`);
  return response.json();
}
export function normalizeHimalayas(row) {
  const apply = safeUrl(row.applicationLink);
  if (!row.guid || !row.title || !row.companyName || !apply) throw new Error('Himalayas 职位缺少 guid/title/companyName/有效申请链接');
  return { source: 'himalayas', external_id: String(row.guid), title: row.title, company: row.companyName, location: (row.locationRestrictions || []).join(', '), allowed_countries: row.locationRestrictions || [], timezone_restrictions: row.timezoneRestrictions || row.timezoneRestriction || [], description: plain(row.description), remote: true, apply_url: apply, source_url: safeUrl(row.guid) || apply, published_at: row.pubDate || null, expiry_date: row.expiryDate || null, raw: row };
}
export function normalizeGreenhouse(row, board) {
  if (!row.id || !row.title || !safeUrl(row.absolute_url)) throw new Error('Greenhouse 职位缺少 id/title/有效申请链接');
  return { source: 'greenhouse', board, external_id: String(row.id), title: row.title, company: board, location: row.location?.name || '', allowed_countries: [], description: plain(row.content), remote: /\bremote\b/i.test(row.location?.name || '') ? true : null, apply_url: safeUrl(row.absolute_url), source_url: safeUrl(row.absolute_url), published_at: row.updated_at || null, raw: row };
}
export async function collectHimalayas({ query, pages = 2, fetcher } = {}) {
  const jobs = []; let cursor;
  for (let page = 1; page <= pages; page++) {
    const url = new URL(query ? 'https://himalayas.app/jobs/api/search' : 'https://himalayas.app/jobs/api');
    if (query) { url.searchParams.set('q', query); url.searchParams.set('page', page); }
    else { url.searchParams.set('limit', '20'); if (cursor) url.searchParams.set('cursor', cursor); }
    const data = await getJson(url, fetcher);
    if (!Array.isArray(data.jobs)) throw new Error('Himalayas 返回格式变化：缺少 jobs 数组');
    jobs.push(...data.jobs.map(normalizeHimalayas));
    if (query) { if (!data.jobs.length) break; }
    else { if (!data.nextCursor) break; cursor = data.nextCursor; }
  }
  return jobs;
}
export async function collectGreenhouse(board, fetcher) {
  if (!/^[a-zA-Z0-9_-]+$/.test(board)) throw new Error('无效 Greenhouse board 标识');
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, fetcher);
  if (!Array.isArray(data.jobs)) throw new Error('Greenhouse 返回格式变化：缺少 jobs 数组');
  return data.jobs.map(row => normalizeGreenhouse(row, board));
}
export async function importGreenhouse(url, fetcher) {
  const u = new URL(url);
  const match = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)\/?$/);
  if (u.protocol !== 'https:' || !/^(boards|job-boards)\.greenhouse\.io$/.test(u.hostname) || !match) throw new Error('首版 URL 导入仅支持 https://job-boards.greenhouse.io/{board}/jobs/{id}');
  const [, board, id] = match;
  const row = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}`, fetcher);
  return normalizeGreenhouse(row, board);
}
