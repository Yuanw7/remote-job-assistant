import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/store.js';
import { extractRequirements, jobVersion } from '../src/requirements.js';
import { saveReview, currentReview } from '../src/review.js';
import { buildQueue } from '../src/queue.js';
const profile = { candidate_id: 'test-candidate', is_example: false, identity: {}, targets: { role_titles: ['AI engineer'], remote_required: true }, profile_version: 1, sources: [{ id: 'r', pages: 1 }], facts: [{ id: 'f', statement: 'Built a prototype', source_id: 'r', page: 1, tags: ['python'], status: 'resume_supported' }], tracks: [{ id: 'ai', label: 'AI', role_titles: ['AI engineer'], search_queries: ['AI engineer'], skill_tags: ['python'] }] };
const job = { source: 'test', external_id: '1', title: 'AI engineer', description: 'Python development', company: 'Example', source_url: 'https://example.com/job', apply_url: 'https://example.com/job', remote: true, allowed_countries: [] };
function setup() { const dir=mkdtempSync(join(tmpdir(),'remote-workflow-')); const store=openStore(join(dir,'db.sqlite'));store.save(job);return {dir,store,job:store.jobs()[0],close(){store.close();rmSync(dir,{recursive:true});}}; }

test('HTML 列表分开提取要求，不把 preferred 年限当硬要求', () => {
  const r=extractRequirements({...job,raw:{content:'<ul><li>3+ years of experience required</li><li>5 years experience preferred</li><li>Must be authorized to work in the US.</li></ul>'}});
  assert.equal(r.evidence.filter(e=>e.type==='experience').length,2);
  assert.equal(r.evidence[0].minimum_years,3);
  assert.equal(r.evidence[1].requirement_level,'preferred_or_negated');
  assert.ok(r.evidence.some(e=>e.type==='work_authorization'));
});
test('审核绑定候选人、方向、画像及岗位版本，观察时间不触发失效', () => {
 const s=setup();try {
 saveReview(s.store,s.job,profile,'ai','shortlist','人工检查方向相关');
 assert.equal(currentReview(s.store,s.job,profile,'ai').stale,false);
 assert.equal(currentReview(s.store,{...s.job,last_seen:'later'},profile,'ai').stale,false);
 assert.equal(currentReview(s.store,{...s.job,allowed_countries:['US']},profile,'ai').stale,true);
 assert.equal(currentReview(s.store,s.job,{...profile,profile_version:2},'ai').stale,true);
 assert.equal(currentReview(s.store,s.job,{...profile,candidate_id:'another'},'ai'),null);
 }finally{s.close();}
});
test('skip/hold 排除当前队列，版本变更后重新进入复核', () => {
 const s=setup();try {
 saveReview(s.store,s.job,profile,'ai','skip','不符合偏好');
 assert.equal(buildQueue(s.store,profile,'ai',5,join(s.dir,'out')).report.selected.length,0);
 const changed={...profile,profile_version:2};
 const r=buildQueue(s.store,changed,'ai',5,join(s.dir,'out')).report;
 assert.equal(r.selected.length,1);assert.equal(r.selected[0].review.stale,true);
 saveReview(s.store,s.job,changed,'ai','hold','等待确认');
 assert.equal(buildQueue(s.store,changed,'ai',5,join(s.dir,'out')).report.selected.length,0);
 }finally{s.close();}
});
test('shortlist 不覆盖硬性排除，也不将 unknown 改为 eligible', () => {
 const s=setup();try {
 saveReview(s.store,s.job,profile,'ai','shortlist','值得核对');
 assert.equal(buildQueue(s.store,profile,'ai',5,join(s.dir,'out')).report.selected[0].eligibility,'unknown');
 const excluded={...profile,targets:{...profile.targets,excluded_companies:['Example']}};
 saveReview(s.store,s.job,excluded,'ai','shortlist','仍然想了解');
 assert.equal(buildQueue(s.store,excluded,'ai',5,join(s.dir,'out')).report.selected.length,0);
 }finally{s.close();}
});
test('审核参数限制和队列上限有效', () => {
 const s=setup();try {
 assert.throws(()=>saveReview(s.store,s.job,profile,'ai','apply','x'),/decision/);
 assert.throws(()=>saveReview(s.store,s.job,profile,'ai','skip',''),/理由/);
 assert.throws(()=>saveReview(s.store,s.job,profile,'other','skip','x'),/track/);
 assert.throws(()=>buildQueue(s.store,profile,'ai',100,join(s.dir,'out')),/limit/);
 }finally{s.close();}
});
test('岗位版本含资格字段，排除非语义观察时间', () => {
 assert.notEqual(jobVersion(job),jobVersion({...job,remote:false}));
 assert.equal(jobVersion(job),jobVersion({...job,last_seen:'later'}));
});
