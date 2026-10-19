import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { evaluate } from './domain.js';
import { matchJob, selectTracks } from './matching.js';
import { currentReview } from './review.js';
import { extractRequirements } from './requirements.js';
import { createMaterials, validateTranslations } from './materials.js';
import { createBrief } from './brief.js';
import { page, escapeHtml as e } from './report.js';

export function buildQueue(store, profile, trackId, limit = 5, outputDir = 'private/queue', catalog = null) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('--limit 必须为 1–30');
  if (selectTracks(profile, trackId).length !== 1) throw new Error('queue 需要 --track 指定一个方向');
  if (catalog) validateTranslations(catalog, profile);
  const items = store.jobs().map(job => ({ job, assessment: evaluate(job, profile), match: matchJob(job, profile, trackId).best, review: currentReview(store, job, profile, trackId) }));
  const candidates = items.filter(x => x.assessment.status !== 'ineligible' && !(x.review && !x.review.stale && ['skip','hold'].includes(x.review.decision)) && (x.match.score >= 60 || (x.review?.decision === 'shortlist' && !x.review.stale)));
  candidates.sort((a, b) => Number(b.review?.decision === 'shortlist' && !b.review.stale) - Number(a.review?.decision === 'shortlist' && !a.review.stale) || b.match.score - a.match.score || a.job.id.localeCompare(b.job.id));
  mkdirSync(outputDir, { recursive: true });
  const selected = candidates.slice(0, limit).map(item => {
    const { path } = createBrief(item.job, profile, trackId, join(outputDir, 'briefs'));
    const material = catalog ? createMaterials(profile, trackId, catalog, item.job, join(outputDir, 'materials')) : null;
    return { material_path: material?.path || null, job_id: item.job.id, title: item.job.title, company: item.job.company, score: item.match.score, eligibility: item.assessment.status, review: item.review, requirements: extractRequirements(item.job), brief_path: path };
  });
  const report = { generated_at: new Date().toISOString(), track_id: trackId, total_candidates: candidates.length, selected, note: '这是人工审核/材料准备队列，不是已授权提交队列。shortlist 不改变资格或提交权限。' };
  const path = join(outputDir, `${trackId}.html`);
  writeFileSync(join(outputDir, `${trackId}.json`), JSON.stringify(report, null, 2));
  writeFileSync(path, page('申请准备队列', `<h1>申请准备队列</h1><p>${e(trackId)} · ${selected.length}/${candidates.length} 个候选岗位</p><p>${e(report.note)}</p>${selected.map(x => `<article><h2>${e(x.title)}</h2><p>${e(x.company)} · 相关性 ${x.score} · 资格 ${e(x.eligibility)}</p><p>审核：${x.review ? `${e(x.review.decision)}${x.review.stale ? '（版本变化，需重审）' : ''}` : '尚未人工审核'}</p><p>${e(x.review?.note || '')}</p><ul>${x.requirements.evidence.slice(0, 8).map(r => `<li>${e(r.type)}：${e(r.quote)}</li>`).join('')}</ul><a href="${e(relative(outputDir, x.brief_path))}">打开材料准备包</a>${x.material_path ? ` · <a href="${e(relative(outputDir, x.material_path))}">英文简历与求职信草稿</a>` : ''}<details><summary>岗位 ID</summary><code>${e(x.job_id)}</code></details></article>`).join('') || '<p>暂无符合条件的岗位。请查看完整报告或明确记录 shortlist 决定。</p>'}`));
  return { path: resolve(path), report };
}
