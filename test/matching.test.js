import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchJob, includesTerm } from '../src/matching.js';
import { validateProfile } from '../src/domain.js';
import { createBrief } from '../src/brief.js';
const profile = {
  profile_version: 2, identity: {}, targets: { role_titles: ['AI engineer'], remote_required: true },
  sources: [{ id: 'resume', pages: 2 }],
  facts: [{ id: 'f1', source_id: 'resume', page: 1, statement: 'Built a retrieval prototype.', tags: ['rag','python'], status: 'resume_supported' }],
  tracks: [
    { id: 'ai', label: 'AI', role_titles: ['AI engineer','LLM engineer'], search_queries: ['AI engineer'], skill_tags: ['rag','python','docker'], preferred_fact_ids: ['f1'] },
    { id: 'ops', label: 'Ops', role_titles: ['operations analyst'], search_queries: ['operations analyst'], skill_tags: ['excel'] }
  ]
};
const job = { id: 'test:1', title: 'AI Engineer', company: 'Example', description: 'RAG Python Docker', apply_url: 'https://example.com', allowed_countries: [], remote: true };

test('方向分数不会因为增加同义目标名称被稀释', () => {
  const result = matchJob(job, profile, 'ai').best;
  assert.equal(result.score, 87);
  assert.deepEqual(result.unsupported_mentions, ['docker']);
  assert.deepEqual(result.fact_ids, ['f1']);
});
test('职级提示独立于匹配，高级岗位不会排在优先组', () => {
  const result = matchJob({ ...job, title: 'Senior AI Engineer' }, profile).best;
  assert.equal(result.score, 49);
  assert.equal(result.cautions.length, 1);
});
test('单词边界避免 Go 匹配 Google，未知方向明确报错', () => {
  assert.equal(includesTerm('Google', 'go'), false);
  assert.equal(includesTerm('Go and Python', 'go'), true);
  assert.throws(() => matchJob(job, profile, 'missing'), /未知/);
});
test('来源缺失与重复方向禁止使用，未支持事实不参与匹配', () => {
  assert.throws(() => validateProfile({ ...profile, sources: [] }), /来源/);
  assert.throws(() => validateProfile({ ...profile, tracks: [profile.tracks[0],profile.tracks[0]] }), /唯一/);
  const result = matchJob(job, { ...profile, facts: [{ ...profile.facts[0], status: 'unverified' }] }, 'ai').best;
  assert.deepEqual(result.fact_ids, []);
});
test('材料准备单严格复制事实、绑定版本、保留未知，不产生新增经历', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-brief-'));
  try {
    const { brief, path } = createBrief(job, profile, 'ai', dir);
    assert.equal(brief.status, 'draft_not_for_submission');
    assert.deepEqual(brief.selected_facts, profile.facts);
    assert.equal(brief.assessment.status, 'unknown');
    assert.equal(brief.profile_hash.length, 64);
    assert.ok(readFileSync(path, 'utf8').includes('第 1 页'));
    const changed = createBrief({ ...job, description: 'Python only' }, profile, 'ai', dir).brief;
    assert.notEqual(changed.job_snapshot_hash, brief.job_snapshot_hash);
  } finally { rmSync(dir, { recursive: true }); }
});
