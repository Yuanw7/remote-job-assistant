import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/store.js';
import { createDashboard,listenDashboard } from '../src/dashboard.js';
import { updatePreferences } from '../src/profile-settings.js';
import { hash } from '../src/domain.js';

async function setup(fn){
 const dir=mkdtempSync(join(tmpdir(),'dashboard-test-'));const store=openStore(join(dir,'test.sqlite'));
 const fact={id:'f',statement:'原型',tags:['python'],source_id:'s',page:1,status:'resume_supported'};
 let profile={candidate_id:'c',profile_version:1,identity:{},targets:{role_titles:['AI engineer'],remote_required:true},sources:[{id:'s'}],facts:[fact],tracks:[{id:'ai',label:'AI',role_titles:['AI engineer'],skill_tags:['python'],search_queries:['AI'],preferred_fact_ids:['f']}]};
 const catalog={candidate_id:'c',language:'en',entries:[{fact_id:'f',fact_hash:hash(fact),text:'Built a prototype.',section:'projects',status:'draft_translation'}]};
 store.save({source:'test',external_id:'1',title:'AI engineer <tag>',company:'Example',description:'Python',remote:true,allowed_countries:[],source_url:'https://example.com',apply_url:'https://example.com'});
 const server=createDashboard({store,loadProfile:()=>profile,saveProfile:form=>{profile=updatePreferences(profile,form);},loadCatalog:()=>catalog,outputDir:join(dir,'out')});
 try {const base=await listenDashboard(server,0);await fn({base,store,update:()=>{profile={...profile,profile_version:2};}});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true});}
}
async function form(base){const html=await (await fetch(base)).text();return new URLSearchParams([...html.matchAll(/type="hidden" name="([^"]+)" value="([^"]*)"/g)].slice(0,5).map(m=>[m[1],m[2].replace(/&amp;/g,'&')]));}
function post(base,path,data,origin=base){return fetch(base+path,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:data});}

test('工作台搜索、转义和审核持久化',()=>setup(async({base,store})=>{
 const response=await fetch(base);assert.equal(response.headers.get('referrer-policy'),'same-origin');const html=await response.text();assert.ok(html.includes('AI engineer &lt;tag&gt;'));assert.ok(html.includes('1 个岗位'));
 assert.ok((await (await fetch(base+'/?q=missing')).text()).includes('没有符合'));
 const data=await form(base);data.set('decision','hold');data.set('note','需确认时区');
 assert.equal((await post(base,'/review',data)).status,303);
 assert.equal(store.latestReview({candidate_id:'c',job_id:'test:1',track_id:'ai'}).note,'需确认时区');
 assert.ok((await (await fetch(base+'/?filter=hold')).text()).includes('需确认时区'));
}));
test('拒绝伪造来源、token、Host 与过期页面，且不写入审核',()=>setup(async({base,store,update})=>{
 const data=await form(base);data.set('decision','shortlist');data.set('note','测试');
 assert.equal((await post(base,'/review',data,'https://other.example')).status,403);
 const bad=new URLSearchParams(data);bad.set('csrf','invalid');assert.equal((await post(base,'/review',bad)).status,403);
 const badHostStatus=await new Promise((resolve,reject)=>{const req=request(base,{headers:{Host:'other.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 assert.equal(badHostStatus,403);
 update();assert.equal((await post(base,'/review',data)).status,409);
 assert.equal(store.latestReview({candidate_id:'c',job_id:'test:1',track_id:'ai'}),null);
}));
test('网页生成英文稿，材料只通过登记链接读取，不能读取私有目录',()=>setup(async({base})=>{
 const result=await post(base,'/generate',await form(base));assert.equal(result.status,200);
 const html=await result.text();const links=[...html.matchAll(/href="(\/artifact\/[a-f0-9]+)"/g)].map(m=>m[1]);assert.equal(links.length,2);
 const material=await fetch(base+links[1]);assert.equal(material.status,200);assert.ok((await material.text()).includes('Built a prototype.'));
 assert.equal((await fetch(base+'/private/candidate.json')).status,404);
 assert.equal((await fetch(base+'/artifact/nonexistent')).status,404);
}));

test('网页保存求职条件后重筛岗位，并使旧审核页面失效',()=>setup(async({base})=>{
 const oldReview=await form(base);oldReview.set('decision','hold');oldReview.set('note','测试');
 const html=await (await fetch(base+'/settings')).text();
 const data=new URLSearchParams([...html.matchAll(/type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 data.set('residence_country','CN');data.set('remote_required','true');data.set('excluded_companies','Example');
 assert.equal((await post(base,'/settings',data,'https://other.example')).status,403);
 assert.equal((await post(base,'/settings',data)).status,303);
 assert.ok((await (await fetch(base)).text()).includes('没有符合当前筛选'));
 assert.equal((await post(base,'/review',oldReview)).status,409);
 assert.equal((await post(base,'/settings',data)).status,409);
 assert.ok((await (await fetch(base+'/settings')).text()).includes('value="CN"'));
}));
