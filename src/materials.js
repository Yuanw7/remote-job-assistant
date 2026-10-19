import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { hash, evaluate } from './domain.js';
import { jobVersion } from './requirements.js';
import { matchJob, selectTracks } from './matching.js';
import { page, escapeHtml as e } from './report.js';

const sections = { education: 'Education', experience: 'Selected Experience', projects: 'Selected Projects', skills: 'Skills' };
export function validateTranslations(catalog, profile) {
  if (!profile.candidate_id || catalog.candidate_id !== profile.candidate_id) throw new Error('英文表述库与候选人不一致');
  if (catalog.language !== 'en' || !Array.isArray(catalog.entries)) throw new Error('英文表述库格式无效');
  const ids = new Set();
  const facts = new Map((profile.facts || []).map(f => [f.id, f]));
  for (const entry of catalog.entries) {
    if (ids.has(entry.fact_id)) throw new Error(`英文表述重复：${entry.fact_id}`);
    ids.add(entry.fact_id);
    const fact = facts.get(entry.fact_id);
    if (!fact || !['resume_supported','confirmed'].includes(fact.status)) throw new Error(`英文表述缺少有效事实：${entry.fact_id}`);
    if (entry.fact_hash !== hash(fact)) throw new Error(`事实已变化，请重新核对英文表述：${entry.fact_id}`);
    if (!Object.hasOwn(sections, entry.section) || typeof entry.text !== 'string' || !entry.text.trim()) throw new Error(`英文表述内容或分类无效：${entry.fact_id}`);
    if (entry.status !== 'draft_translation') throw new Error('当前只支持 draft_translation，不能将未实现的批准流程当作已批准');
    if (/\b(TODO|TBD|INSERT HERE)\b|\{\{.*?\}\}/i.test(entry.text)) throw new Error(`英文表述含占位符：${entry.fact_id}`);
    if (entry.review_notes != null && (!Array.isArray(entry.review_notes) || entry.review_notes.some(n => typeof n !== 'string'))) throw new Error('review_notes 必须是字符串数组');
  }
  return catalog;
}
export function createMaterials(profile, trackId, catalog, job = null, outputDir = 'private/materials') {
  validateTranslations(catalog, profile);
  const tracks = selectTracks(profile, trackId);
  if (tracks.length !== 1) throw new Error('生成材料必须指定一个有效方向');
  const track = tracks[0];
  const matching = job ? matchJob(job, profile, trackId).best : null;
  const supported = (profile.facts || []).filter(f => ['resume_supported','confirmed'].includes(f.status));
  const commonIds = supported.filter(f => f.tags?.includes('education') || f.id === 'english').map(f => f.id);
  // Role-specific facts come from matching; do not pad a weak match with unrelated claims.
  const focusIds = matching ? matching.fact_ids : track.preferred_fact_ids || [];
  const wanted = [...new Set([...commonIds, ...focusIds])];
  const index = new Map(catalog.entries.map(t => [t.fact_id,t]));
  const missing = wanted.filter(id => !index.has(id));
  const entries = wanted.filter(id => index.has(id)).map(id => ({ ...index.get(id), source_fact: supported.find(f => f.id === id) }));
  const preferred = track.preferred_fact_ids || [];
  entries.sort((a,b) => {
    const rank = id => preferred.indexOf(id) < 0 ? 999 : preferred.indexOf(id);
    return rank(a.fact_id)-rank(b.fact_id);
  });
  const blockers = [...(profile.pending_questions || []), ...entries.flatMap(x => x.review_notes || [])];
  if (!profile.identity?.full_name_latin) blockers.push('Confirm your preferred English / Latin-script name; the source name is retained.');
  blockers.push('Review all English translations against the source before any submission.');
  if (missing.length) blockers.push(`Missing English translations: ${missing.join(', ')}`);
  if (matching && !matching.fact_ids.length) blockers.push('No role-specific factual match was found; no experience claims were added.');
  const assessment = job ? evaluate(job,profile) : null;
  if (assessment) blockers.push(...assessment.reasons.filter(r=>r.status!=='pass').map(r=>r.reason),...matching.cautions);
  const identity = profile.identity || {};
  const name = identity.full_name_latin || identity.full_name || 'Name not provided';
  const contact = [identity.email, identity.phone, ...(identity.links || [])].filter(Boolean).join(' | ');
  const textParts = ['DRAFT — NOT APPROVED FOR SUBMISSION', name, contact, `Target direction: ${track.label}`, ''];
  for (const [key,label] of Object.entries(sections)) {
    const values = entries.filter(x=>x.section===key);
    if (values.length) textParts.push(label, ...values.map(x=>`- ${x.text}`), '');
  }
  const resumeText = textParts.join('\n');
  const letterFacts = entries.filter(x=>['experience','projects'].includes(x.section)).slice(0,3);
  const coverText = job && letterFacts.length ? [
    'DRAFT — NOT APPROVED FOR SUBMISSION', 'Dear Hiring Team,', '',
    `I am applying for the ${job.title} position at ${job.company}.`,
    'The following examples describe work from my internships and projects:',
    ...letterFacts.map(x=>`- ${x.text}`), '',
    'I would welcome the opportunity to discuss how this experience relates to the role.',
    'Thank you for considering my application.', name
  ].join('\n') : null;
  const manifest = { status:'draft_not_for_submission', created_at:new Date().toISOString(), template_version:1,
    candidate_id:profile.candidate_id, track_id:trackId, job_id:job?.id || null,
    profile_hash:hash(profile), translations_hash:hash(catalog), job_hash:job ? jobVersion(job) : null,
    missing_translation_ids:missing, blockers:[...new Set(blockers)], entries,
    cover_letter_fact_ids:coverText ? letterFacts.map(f=>f.fact_id) : [],
    validation_note:'Checks validate references, versions and structure only; translation accuracy and completeness still require human review.',
    resume_text:resumeText, cover_letter_text:coverText };
  const stem = `${trackId}-${job ? hash(job.id).slice(0,10) : 'master'}-${hash({profile:manifest.profile_hash,catalog:manifest.translations_hash,job:manifest.job_hash,template:1}).slice(0,12)}`;
  mkdirSync(outputDir,{recursive:true});
  const out=join(outputDir,`${stem}.html`);
  const body=`<h1>英文材料草稿</h1><p>${e(track.label)}${job ? ` · ${e(job.company)} / ${e(job.title)}` : ' · 方向母版'}</p><p><b>Draft — not approved for submission.</b> 以下为可审阅的内容草稿，尚未输出正式投递版。</p><h2>待确认项</h2><ul>${manifest.blockers.map(x=>`<li>${e(x)}</li>`).join('')}</ul><h2>Resume draft</h2><article><pre style="white-space:pre-wrap;font:inherit">${e(resumeText)}</pre></article>${coverText ? `<h2>Cover letter draft</h2><article><pre style="white-space:pre-wrap;font:inherit">${e(coverText)}</pre></article>` : ''}<h2>逐条来源与翻译核对</h2>${entries.map(x=>`<article><p>${e(x.text)}</p><p>${e(x.source_fact.statement)}</p><small>${e(x.fact_id)} · ${e(x.source_fact.source_id)} 第 ${x.source_fact.page} 页 · ${e(x.status)}</small></article>`).join('')}<small>${e(manifest.validation_note)}</small>`;
  writeFileSync(out,page('英文材料草稿',body));
  writeFileSync(join(outputDir,`${stem}.resume.txt`),resumeText);
  if (coverText) writeFileSync(join(outputDir,`${stem}.cover-letter.txt`),coverText);
  writeFileSync(join(outputDir,`${stem}.json`),JSON.stringify(manifest,null,2));
  return {path:resolve(out), manifest};
}
