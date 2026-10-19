import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash,evaluate } from '../src/domain.js';
import { updatePreferences,savePreferences,settingsBody } from '../src/profile-settings.js';
const profile=()=>({candidate_id:'c',profile_version:2,identity:{residence_country:null},targets:{role_titles:[],remote_required:true},facts:[{id:'untouched'}],confirmed_at:null});
const form=p=>new URLSearchParams({profile_hash:hash(p),residence_country:'cn',timezone:'Asia/Shanghai',weekly_hours:'20',remote_required:'true',excluded_companies:'Example'});
test('保存条件保留事实与确认状态，筛选立即生效',()=>{
 const p=profile(),f=form(p);f.append('employment_types','internship');const next=updatePreferences(p,f);
 assert.equal(next.profile_version,3);assert.equal(next.identity.residence_country,'CN');assert.equal(next.targets.weekly_hours,20);
 assert.deepEqual(next.facts,p.facts);assert.equal(next.confirmed_at,null);assert.equal(p.identity.residence_country,null);
 assert.equal(evaluate({title:'AI',company:'Example',description:'',remote:true},next).status,'ineligible');
 assert.equal(evaluate({title:'AI',company:'Other',description:'',remote:true,allowed_countries:['US']},next).status,'ineligible');
});
test('未知字段保持 null，拒绝无效值与旧版本',()=>{
 const p=profile();const f=new URLSearchParams({profile_hash:hash(p),remote_required:'false'});const next=updatePreferences(p,f);
 assert.equal(next.identity.timezone,null);assert.equal(next.targets.weekly_hours,null);assert.equal(next.targets.employment_types,null);
 for(const [key,value] of [['timezone','Imaginary/City'],['weekly_hours','NaN'],['weekly_hours','81'],['residence_country','China'],['employment_types','invalid'],['remote_required','maybe']]){const bad=form(p);bad.set(key,value);assert.throws(()=>updatePreferences(p,bad));}
 assert.throws(()=>updatePreferences(next,form(p)),{status:409});
});
test('原子保存与原文备份，旧标签页和验证失败不能覆盖文件',()=>{
 const dir=mkdtempSync(join(tmpdir(),'preferences-'));const path=join(dir,'candidate.json');const p=profile();const original=JSON.stringify(p);
 try{writeFileSync(path,original);const next=savePreferences(path,form(p));
 assert.deepEqual(JSON.parse(readFileSync(path)),next);assert.equal(readFileSync(join(dir,'profile-history',hash(p)+'.json'),'utf8'),original);
 assert.throws(()=>savePreferences(path,form(p)),{status:409});
 const bad=form(next);bad.set('weekly_hours','-1');assert.throws(()=>savePreferences(path,bad));
 assert.deepEqual(JSON.parse(readFileSync(path)),next);assert.equal(readdirSync(dir).some(x=>x.endsWith('.tmp')),false);
 }finally{rmSync(dir,{recursive:true});}
});
test('设置页面转义私有字段',()=>{const p=profile();p.identity.residence_city='<script>';assert.ok(settingsBody(p,'token').includes('&lt;script&gt;'));});
