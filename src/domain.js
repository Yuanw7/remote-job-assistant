import { conditionReasons } from './job-conditions.js';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function plain(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
export function jobKey(job) {
  const u = new URL(job.apply_url);
  const greenhouse = /^(?:boards|job-boards)\.greenhouse\.io$/.test(u.hostname);
  const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (greenhouse && m) return `greenhouse:${m[1]}:${m[2]}`;
  if (job.source === 'greenhouse') return `greenhouse:${job.board}:${job.external_id}`;
  return `${job.source}:${job.external_id}`;
}
export function validateProfile(p) {
  if (!p || typeof p !== 'object' || !p.identity || !p.targets) throw new Error('画像缺少 identity / targets');
  if (!Array.isArray(p.targets.role_titles) || p.targets.role_titles.some(x => typeof x !== 'string')) throw new Error('role_titles 必须是字符串数组');
  const country = p.identity.residence_country;
  if (country != null && !/^[A-Z]{2}$/.test(country)) throw new Error('residence_country 使用 ISO 两位大写代码，例如 CN');
  if (typeof p.targets.remote_required !== 'boolean') throw new Error('remote_required 必须是布尔值');
  if (p.tracks != null) {
    if (!Array.isArray(p.tracks)) throw new Error('tracks 必须是数组');
    const ids = new Set();
    for (const t of p.tracks) {
      if (!/^[a-z0-9-]+$/.test(t.id) || ids.has(t.id)) throw new Error('track id 必须唯一且只含小写字母数字及连字符');
      ids.add(t.id);
      for (const key of ['role_titles', 'skill_tags', 'search_queries']) {
        if (!Array.isArray(t[key]) || t[key].some(v => typeof v !== 'string' || !v.trim())) throw new Error(`track ${key} 必须是非空字符串组成的数组`);
      }
    }
    const factIds = new Set();
    for (const f of p.facts || []) {
      if (!f.id || factIds.has(f.id)) throw new Error('fact id 缺失或重复');
      factIds.add(f.id);
      if (['resume_supported','confirmed'].includes(f.status) && (!p.sources?.some(s => s.id === f.source_id) || !Number.isInteger(f.page) || f.page < 1 || !f.statement || !Array.isArray(f.tags))) throw new Error('事实必须有有效来源、页码、陈述与 tags');
    }
  }
  return p;
}
const countryAliases = { 'united states': 'US', usa: 'US', us: 'US', china: 'CN', cn: 'CN', 'united kingdom': 'GB', uk: 'GB', gb: 'GB', canada: 'CA', ca: 'CA', germany: 'DE', de: 'DE', australia: 'AU', au: 'AU' };
export function countryCode(value) { return countryAliases[String(value).toLowerCase()] || (/^[A-Z]{2}$/.test(value) ? value : null); }

// This first version extracts narrow, explicit signals only. It never infers full eligibility from absence of restrictions.
export function evaluate(job, profile) {
  const reasons = [];
  const add = (status, field, reason) => reasons.push({ status, field, reason });
  const country = profile.identity.residence_country;
  const text = `${job.location || ''} ${job.description}`;
  if (!country) add('unknown', 'residence', '尚未填写居住国家');
  if (profile.targets.remote_required) {
    if (/\b(hybrid|on[- ]site)\b/i.test(job.location || '') || job.remote === false) add('fail', 'remote', '岗位工作方式与纯远程要求冲突');
    else if (job.remote !== true) add('unknown', 'remote', '尚无明确远程工作证据');
  }
  const rawCountries = job.allowed_countries || [];
  const allowed = rawCountries.map(countryCode);
  if (rawCountries.length && country) {
    if (allowed.includes(country)) add('pass', 'residence', `结构化所在地字段包含 ${country}，仍需核对完整 JD`);
    else if (allowed.every(Boolean)) add('fail', 'residence', `所在地限制：${rawCountries.join(', ')}`);
    else add('unknown', 'residence', `存在尚未识别的地域限制：${rawCountries.join(', ')}`);
  } else if (country) add('unknown', 'residence', '没有可核验的允许国家清单，remote/worldwide 标签不自动放行');
  if (country && country !== 'US' && /\b(US[- ]only|USA[- ]only|United States only|must (?:be |reside |live )?(?:based |located )?in (?:the )?(?:US\b|United States)|US residents only)\b/i.test(text)) add('fail', 'residence', 'JD/地点中存在明确美国境内限制');
  if (/\b(EU[- ]only|EU residents only|European Union only)\b/i.test(text)) add('unknown', 'residence', '存在欧盟地域限制，需要核对具体国家和雇佣条件');
  if (profile.targets.excluded_companies?.some(c => c.toLowerCase() === job.company.toLowerCase())) add('fail', 'company', '公司在排除列表中');
  reasons.push(...conditionReasons(job, profile));
  // No broad NLP/authorization/timezone engine is shipped yet: fail closed instead of claiming qualification.
  add('unknown', 'authorization', '工作授权、时区和必要资格待人工核实（首版不自动判断）');
  const titles = profile.targets.role_titles;
  const titleMatches = titles.filter(t => job.title.toLowerCase().includes(t.toLowerCase()));
  const score = titles.length ? (titleMatches.length ? 100 : 0) : null;
  const status = reasons.some(r => r.status === 'fail') ? 'ineligible' : reasons.some(r => r.status === 'unknown') ? 'unknown' : 'eligible';
  return { status, reasons, title_score: score, scoring_note: '仅职位名称关键词命中率，不是完整技能匹配或录用概率' };
}
