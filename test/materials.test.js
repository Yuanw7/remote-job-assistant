import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../src/domain.js';
import { createMaterials, validateTranslations } from '../src/materials.js';
const fact = { id:'f', source_id:'r', page:1, statement:'开发检索原型', tags:['python'], status:'resume_supported' };
const education = { id:'ed', source_id:'r', page:1, statement:'硕士在读', tags:['education'], status:'resume_supported' };
const profile = { candidate_id:'sample', profile_version:1, identity:{full_name:'示例'}, targets:{role_titles:['AI engineer'],remote_required:true}, sources:[{id:'r',pages:1}], facts:[fact,education], tracks:[{id:'ai',label:'AI',role_titles:['AI engineer'],skill_tags:['python'],search_queries:['AI engineer'],preferred_fact_ids:['f']}] };
const catalog = {candidate_id:'sample',language:'en',entries:[{fact_id:'f',fact_hash:hash(fact),text:'Built a retrieval prototype.',section:'projects',status:'draft_translation'},{fact_id:'ed',fact_hash:hash(education),text:'Master’s degree in progress.',section:'education',status:'draft_translation'}]};
const job = {id:'j',title:'AI engineer',company:'Example',description:'Python',apply_url:'https://example.com',remote:true};
function temp(fn){const dir=mkdtempSync(join(tmpdir(),'remote-materials-'));try{fn(dir);}finally{rmSync(dir,{recursive:true});}}

test('英文母版保留在读状态与来源，不生成授权或经验年限',()=>temp(dir=>{
 const {manifest,path}=createMaterials(profile,'ai',catalog,null,dir);
 assert.equal(manifest.status,'draft_not_for_submission');
 assert.match(manifest.resume_text,/in progress/);
 assert.equal(manifest.cover_letter_text,null);
 assert.ok(manifest.blockers.some(x=>x.includes('Latin-script')));
 assert.ok(readFileSync(path,'utf8').includes('第 1 页'));
 assert.ok(!manifest.resume_text.includes('authorized'));
}));
test('岗位求职信使用已选事实并携带事实映射',()=>temp(dir=>{
 const {manifest}=createMaterials(profile,'ai',catalog,job,dir);
 assert.deepEqual(manifest.cover_letter_fact_ids,['f']);
 assert.ok(manifest.cover_letter_text.includes(catalog.entries[0].text));
 assert.equal(manifest.job_id,'j');
}));
test('无岗位事实匹配时不靠母版经历填充，也不生成空泛求职信',()=>temp(dir=>{
 const {manifest}=createMaterials(profile,'ai',catalog,{...job,description:'unrelated'},dir);
 assert.deepEqual(manifest.entries.map(x=>x.fact_id),['ed']);
 assert.equal(manifest.cover_letter_text,null);
}));
test('候选人不符、事实变化、伪批准、重复 ID 与占位符会阻止生成',()=>{
 assert.throws(()=>validateTranslations({...catalog,candidate_id:'other'},profile),/候选人/);
 assert.throws(()=>validateTranslations(catalog,{...profile,facts:[{...fact,statement:'changed'},education]}),/变化/);
 assert.throws(()=>validateTranslations({...catalog,entries:[{...catalog.entries[0],status:'approved'}]},profile),/批准/);
 assert.throws(()=>validateTranslations({...catalog,entries:[catalog.entries[0],catalog.entries[0]]},profile),/重复/);
 assert.throws(()=>validateTranslations({...catalog,entries:[{...catalog.entries[0],text:'TODO'}]},profile),/占位符/);
});
test('缺少译文明确报告，不静默发明翻译',()=>temp(dir=>{
 const {manifest}=createMaterials(profile,'ai',{...catalog,entries:[]},job,dir);
 assert.deepEqual(new Set(manifest.missing_translation_ids),new Set(['ed','f']));
 assert.equal(manifest.entries.length,0);
 assert.equal(manifest.cover_letter_text,null);
}));
test('英文表述和岗位更新生成不同版本，恶意 HTML 只作为文本',()=>temp(dir=>{
 const first=createMaterials(profile,'ai',catalog,job,dir);
 const changed={...catalog,entries:[{...catalog.entries[0],text:'<script>example</script>'},catalog.entries[1]]};
 const second=createMaterials(profile,'ai',changed,job,dir);
 assert.notEqual(first.path,second.path);
 assert.ok(!readFileSync(second.path,'utf8').includes('<script>example</script>'));
 const third=createMaterials(profile,'ai',catalog,{...job,description:'Python updated'},dir);
 assert.notEqual(first.path,third.path);
}));
