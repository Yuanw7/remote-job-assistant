import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { evaluate, hash } from './domain.js';
import { extractRequirements, jobVersion } from './requirements.js';
import { matchJob } from './matching.js';
import { escapeHtml, page } from './report.js';

export function createBrief(job, profile, trackId, outputDir = 'private/briefs') {
  const matching = matchJob(job, profile, trackId);
  if (!matching.best) throw new Error('材料准备单需要配置求职方向 tracks');
  const selected = matching.best;
  const track = profile.tracks.find(t => t.id === selected.track_id);
  const facts = (profile.facts || []).filter(f => selected.fact_ids.includes(f.id));
  facts.sort((a, b) => {
    const rank = id => { const i = (track.preferred_fact_ids || []).indexOf(id); return i < 0 ? 999 : i; };
    return rank(a.id) - rank(b.id);
  });
  const assessment = evaluate(job, profile);
  const brief = {
    status: 'draft_not_for_submission', created_at: new Date().toISOString(),
    job: { id: job.id, title: job.title, company: job.company, apply_url: job.apply_url },
    profile_version: profile.profile_version, profile_hash: hash(profile), job_snapshot_hash: jobVersion(job),
    requirements: extractRequirements(job),
    matching, assessment, selected_facts: facts, sources: profile.sources || [],
    unresolved: [...(profile.pending_questions || []), ...assessment.reasons.filter(r => r.status !== 'pass').map(r => r.reason), ...selected.cautions],
    note: '仅从简历选择已存在陈述，保留来源；不是完成的英文简历/求职信，不上传、不提交。resume_supported 表示文档支持，不代表独立核验或用户新确认。'
  };
  mkdirSync(outputDir, { recursive: true });
  const stem = `${selected.track_id}-${hash(job.id).slice(0, 12)}-${brief.profile_hash.slice(0, 8)}-${brief.job_snapshot_hash.slice(0, 8)}`;
  const out = join(outputDir, `${stem}.html`);
  writeFileSync(join(outputDir, `${stem}.json`), JSON.stringify(brief, null, 2));
  const e = escapeHtml;
  writeFileSync(out, page('岗位材料准备单', `<h1>${e(job.title)}</h1><p>${e(job.company)} · ${e(track.label)} · 本地草稿</p><p>${e(brief.note)}</p><h2>建议使用的简历事实</h2>${facts.length ? facts.map(f => `<article><p>${e(f.statement)}</p><small>${e(f.id)} · 来源 ${e(f.source_id)} 第 ${f.page} 页 · ${e(f.status)}</small></article>`).join('') : '<p>暂无明确事实匹配，不自动生成空泛或虚构经历。</p>'}<h2>JD 显式要求片段</h2><p>${e(brief.requirements.note)}</p><ul>${brief.requirements.evidence.map(r => `<li><b>${e(r.type)}</b>：${e(r.quote)}</li>`).join('')}</ul><h2>申请前待核实</h2><ul>${brief.unresolved.map(r => `<li>${e(r)}</li>`).join('')}</ul><h2>绑定版本</h2><p>Profile ${e(brief.profile_version)} · ${e(brief.profile_hash.slice(0, 16))}<br>Job snapshot ${e(brief.job_snapshot_hash.slice(0, 16))}</p>`));
  return { path: resolve(out), brief };
}
