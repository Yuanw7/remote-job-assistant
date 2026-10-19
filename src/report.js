import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { evaluate, safeUrl } from './domain.js';
import { currentReview } from './review.js';
import { extractRequirements } from './requirements.js';
import { matchJob, selectTracks } from './matching.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function page(title, body, script = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:1080px;margin:40px auto;padding:0 24px;background:#f5f7fa;color:#172534}h1{font-size:32px}h2{font-size:21px;margin:10px 0}article{background:white;border:1px solid #dae2e8;border-radius:12px;padding:22px;margin:18px 0}a{color:#126a78}button,input,select{font:inherit;padding:9px 12px;margin:4px;border:1px solid #ccd7df;background:white;border-radius:8px}button{cursor:pointer}.tag{display:inline-block;padding:2px 10px;border-radius:5px;background:#fff3cc}.ineligible{background:#ffe3e3}.eligible{background:#d8f5e4}small{color:#52616b}code{word-break:break-all}details{margin:12px 0}.metrics{padding:16px;background:#e8f1f3;border-radius:10px}nav{position:sticky;top:0;background:#f5f7fa;padding:8px 0}article[hidden]{display:none}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}
const label = { eligible: '资格通过', unknown: '待核实', ineligible: '已排除' };
export function makeReport(store, profile, output, mode, trackId) {
  const tracks = selectTracks(profile, trackId);
  const jobs = store.jobs().map(job => ({ ...job, assessment: evaluate(job, profile), matching: matchJob(job, profile, trackId) }));
  const order = { eligible: 0, unknown: 1, ineligible: 2 };
  jobs.sort((a, b) => order[a.assessment.status] - order[b.assessment.status] || (b.matching.best?.score ?? b.assessment.title_score ?? 0) - (a.matching.best?.score ?? a.assessment.title_score ?? 0));
  const counts = Object.fromEntries(Object.keys(order).map(key => [key, jobs.filter(j => j.assessment.status === key).length]));
  const relevant = jobs.filter(j => j.assessment.status !== 'ineligible' && (j.matching.best?.score || 0) >= 60).length;
  const report = { generated_at: new Date().toISOString(), mode, profile_is_example: profile.is_example, profile_status: profile.profile_status || null, track: trackId || 'all', counts, relevant, runs: store.runs(), jobs };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output.replace(/\.html$/, '') + '.json', JSON.stringify(report, null, 2));
  const e = escapeHtml;
  const cards = jobs.map(job => {
    const best = job.matching.best;
    const review = currentReview(store, job, profile, best?.track_id);
    const requirements = extractRequirements(job);
    return `<article data-status="${job.assessment.status}" data-score="${best?.score || 0}" data-track="${e(best?.track_id || '')}"><div class="tag ${job.assessment.status}">${label[job.assessment.status]}</div><h2>${e(job.title)}</h2><p>${e(job.company)} · ${e(job.location || '地域未明确')}</p>${best ? `<p><b>${e(best.track_label)} · 方向相关性 ${best.score}/100</b></p><small>${e(best.explanation)}</small><p>有依据的能力词：${e(best.matched_skills.map(m => m.tag).join(' / ') || '未匹配')}</p><p>无简历依据的方向词：${e(best.unsupported_mentions.join(' / ') || '词表范围内未发现；不代表满足全部要求')}</p><ul>${best.cautions.map(c => `<li>${e(c)}</li>`).join('')}</ul>` : `<p>名称关键词命中：${job.assessment.title_score ?? '未设置'}</p>`}<ul>${job.assessment.reasons.map(r => `<li>${e(r.reason)}</li>`).join('')}</ul><p>人工审核：${review ? `${e(review.decision)}${review.stale ? '（需重审）' : ''} · ${e(review.note)}` : '未审核'}</p><details><summary>JD 显式要求（${requirements.evidence.length}）</summary><p>${e(requirements.note)}</p><ul>${requirements.evidence.map(r => `<li>${e(r.type)}：${e(r.quote)}</li>`).join('')}</ul></details><details><summary>职位描述与证据 ID</summary><p>${e(job.description)}</p><small>${e(best?.fact_ids.join(', ') || '')}</small></details><p>${job.sources.map(s => `<a rel="noreferrer" target="_blank" href="${e(safeUrl(s.url) || '#')}">${e(s.source)} 原始来源</a>`).join(' · ')} · <a rel="noreferrer" target="_blank" href="${e(safeUrl(job.apply_url) || '#')}">打开职位页面</a></p><details><summary>生成该岗位材料准备单</summary><p>运行 CLI 的 prepare 命令，将下面的岗位 ID 作为 --job 参数，并使用对应的 --track；ID 是数据，不应作为 shell 代码执行。</p><code>${e(job.id)}</code></details><small>最近观察 ${e(job.last_seen.slice(0, 10))}</small></article>`;
  }).join('');
  const body = `<h1>Remote 岗位审核清单</h1><p>${mode === 'demo' ? '演示模式：虚构岗位和测试画像，与真实数据隔离。' : profile.is_example ? '真实公开职位 · 使用示例画像。' : '真实公开职位 · 简历来源支持的本地画像，待确认实际求职条件。'}</p><p>${tracks.map(t => e(t.label)).join(' / ')}</p><div class="metrics">共 ${jobs.length} 个独立岗位 · 方向优先复核 ${relevant} · 待核实 ${counts.unknown} · 排除 ${counts.ineligible}</div><p><small>相关性仅用于筛选阅读顺序，不是 ATS 得分或录用概率。简历事实不等于工作授权；未核实项不会自动通过。无上传或提交功能。</small></p><nav><input id="search" placeholder="搜索岗位或公司" aria-label="搜索岗位或公司"><select id="status" aria-label="筛选状态"><option value="all">全部状态</option><option value="priority">方向优先复核</option><option value="unknown">待核实</option><option value="ineligible">已排除</option></select><select id="track" aria-label="筛选方向"><option value="all">全部方向</option>${tracks.map(t => `<option value="${e(t.id)}">${e(t.label)}</option>`).join('')}</select><small id="visible"></small></nav>${cards || '<p>尚无职位，请先运行采集命令。</p>'}<h2>最近采集记录</h2><ul>${report.runs.map(r => `<li>${e(r.source)} · ${e(r.status)} · ${r.count} 条 ${e(r.error || '')}</li>`).join('')}</ul><small>生成于 ${e(report.generated_at)}</small>`;
  const script = `const search=document.querySelector('#search'),status=document.querySelector('#status'),track=document.querySelector('#track');function filter(){let count=0;document.querySelectorAll('article').forEach(a=>{const s=status.value;const ok=(s==='all'||(s==='priority'?Number(a.dataset.score)>=60&&a.dataset.status!=='ineligible':a.dataset.status===s))&&(track.value==='all'||a.dataset.track===track.value)&&a.textContent.toLowerCase().includes(search.value.toLowerCase());a.hidden=!ok;if(ok)count++;});document.querySelector('#visible').textContent='显示 '+count+' 条';}for(const el of [search,status,track])el.addEventListener('input',filter);filter();`;
  writeFileSync(output, page('Remote 岗位审核清单', body, script));
  return report;
}
