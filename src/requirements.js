import { jobConditions } from './job-conditions.js';
import { hash, plain } from './domain.js';

// Only extract explicit phrases. Unrecognized requirements remain unknown.
export function jobVersion(job) {
  return hash({ conditions: jobConditions(job), title: job.title, description: job.description, location: job.location, countries: job.allowed_countries, timezone: job.timezone_restrictions, remote: job.remote, apply_url: job.apply_url, expiry: job.expiry_date });
}
export function extractRequirements(job) {
  const html = job.raw?.content || job.raw?.description || job.description || '';
  const segments = String(html).replace(/<\/(?:p|li|h[1-6]|div)>|<br\s*\/?>/gi, '\n').split(/\n+/).flatMap(line => plain(line).split(/(?<=[.!?;])\s+/)).filter(Boolean);
  const evidence = [];
  const add = (type, quote, extra = {}) => evidence.push({ type, quote, source_url: job.source_url || job.apply_url, ...extra });
  for (const sentence of segments) {
    const optional = /\b(preferred|nice[- ]to[- ]have|bonus|not required|not necessary|optional)\b/i.test(sentence);
    const years = sentence.match(/\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*\+?\s*years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|hands[- ]on\s+)?experience\b/i);
    if (years) add('experience', sentence, { minimum_years: Number(years[1]), requirement_level: optional ? 'preferred_or_negated' : 'needs_review' });
    if (/\b(sponsorship|work authori[sz]ation|authori[sz]ed to work|right to work)\b/i.test(sentence)) add('work_authorization', sentence);
    if (/\b(must (?:reside|be based|be located|live)|residents only|US[- ]only|EU[- ]only|eligible countries)\b/i.test(sentence)) add('location', sentence);
    if (/\b(time ?zone|overlap|working hours|business hours)\b/i.test(sentence)) add('working_hours', sentence);
    if (/\b(fluent|fluency|native|proficien(?:t|cy))\b.{0,45}\b(English|German|French|Spanish|Japanese)\b/i.test(sentence)) add('language', sentence);
  }
  if ((job.allowed_countries || []).length) add('structured_location', job.allowed_countries.join(', '));
  return { method: 'explicit_phrase_rules_v1', evidence, note: '仅摘取显式片段，不是完整 JD 解析；未出现不代表没有要求。年限不自动换算候选人实习/项目经历。' };
}
