// Transparent lexical matching, not an ATS score or an estimate of hiring probability.
const vocabulary = {
  rag: ['rag', 'retrieval augmented generation', 'retrieval-augmented generation'],
  retrieval: ['retrieval', 'semantic search', 'vector search'],
  mcp: ['mcp', 'model context protocol'],
  'ai agent': ['ai agent', 'ai agents', 'agentic', 'llm agents'],
  evaluation: ['evaluation', 'evaluations', 'evals', 'model quality'],
  'prompt engineering': ['prompt engineering', 'prompt tuning', 'prompt optimization'],
  'data analysis': ['data analysis', 'data analytics', 'reporting', 'analytics'],
  'product management': ['product management', 'product requirements', 'product roadmap'],
  'user research': ['user research', 'customer research'],
  'competitive analysis': ['competitive analysis', 'competitor research'],
  'business operations': ['business operations', 'business ops'],
  'product operations': ['product operations', 'product ops'],
  chatbot: ['chatbot', 'chatbots', 'conversational ai'],
  ecommerce: ['ecommerce', 'e-commerce', 'e commerce'],
  automation: ['automation', 'workflow automation'],
  'financial analysis': ['financial analysis', 'valuation', 'financial modeling'],
  testing: ['testing', 'test automation'],
  'quality assurance': ['quality assurance', 'qa'],
  python: ['python'], typescript: ['typescript'], javascript: ['javascript'], go: ['golang', 'go'],
  'c#': ['c#'], fastapi: ['fastapi'], react: ['react', 'reactjs'], docker: ['docker'], sql: ['sql'], git: ['git'], excel: ['excel'], langchain: ['langchain']
};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function includesTerm(text, term) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}(?=$|[^a-z0-9])`, 'i').test(text);
}
export function selectTracks(profile, trackId) {
  const tracks = profile.tracks || [];
  if (trackId && !tracks.some(t => t.id === trackId)) throw new Error(`未知求职方向：${trackId}`);
  return trackId ? tracks.filter(t => t.id === trackId) : tracks;
}
export function matchTrack(job, profile, track) {
  const text = `${job.title}\n${job.description || ''}`;
  const roles = track.role_titles.filter(t => includesTerm(job.title, t));
  const facts = (profile.facts || []).filter(f => ['resume_supported', 'confirmed'].includes(f.status));
  const mentioned = track.skill_tags.filter(tag => (vocabulary[tag] || [tag]).some(alias => includesTerm(text, alias)));
  const matched = mentioned.map(tag => ({ tag, fact_ids: facts.filter(f => f.tags?.includes(tag)).map(f => f.id) })).filter(m => m.fact_ids.length);
  const gaps = mentioned.filter(tag => !matched.some(m => m.tag === tag));
  const skillScore = mentioned.length ? Math.round(40 * matched.length / mentioned.length) : 0;
  let score = (roles.length ? 60 : 0) + skillScore;
  const cautions = [];
  if (/\b(senior|sr\.?|staff|principal|director|head of|lead|vice president)\b/i.test(job.title)) {
    cautions.push('职位有高级职级标记；简历未证明对应多年全职资历，需要单独核对');
    score = Math.min(score, 49);
  }
  if (roles.length && !mentioned.length) {
    cautions.push('仅职位名称匹配，尚未找到该方向能力词证据');
    score = Math.min(score, 45);
  }
  const factIds = [...new Set(matched.flatMap(m => m.fact_ids))];
  return { track_id: track.id, track_label: track.label, score, role_matches: roles, matched_skills: matched, unsupported_mentions: gaps, fact_ids: factIds, cautions, level_caution: track.level_caution, explanation: `名称命中 ${roles.length ? '是' : '否'}；方向词 ${mentioned.length} 项，其中有简历依据 ${matched.length} 项。仅词项相关性，未核验全部 JD 要求。` };
}
export function matchJob(job, profile, trackId) {
  const tracks = selectTracks(profile, trackId).map(track => matchTrack(job, profile, track)).sort((a, b) => b.score - a.score);
  return { best: tracks[0] || null, tracks };
}
