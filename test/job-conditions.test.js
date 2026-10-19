import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionReasons,jobConditions } from '../src/job-conditions.js';
import { jobVersion } from '../src/requirements.js';
import { evaluate,hash } from '../src/domain.js';
import { updatePreferences } from '../src/profile-settings.js';
const profile={identity:{},targets:{role_titles:[],remote_required:true,employment_types:['internship'],salary_floor:100,salary_currency:'USD',salary_period:'hourly'}};
const job={source:'himalayas',title:'AI',company:'Example',description:'',remote:true,raw:{employmentType:'Intern',minSalary:80,maxSalary:120,currency:'USD',salaryPeriod:'hourly'}};
const salary=j=>conditionReasons(j,profile).find(r=>r.field==='salary').status;
const change=raw=>({...job,raw:{...job.raw,...raw}});
test('薪资同币种同周期比较，区间重叠和边界保守处理',()=>{
 assert.equal(salary(job),'unknown');assert.equal(salary(change({maxSalary:99})),'fail');
 assert.equal(salary(change({minSalary:100})),'pass');assert.equal(salary(change({maxSalary:100})),'unknown');
 assert.equal(evaluate(change({minSalary:100}),profile).status,'unknown');
});
test('缺失、异常、跨币种或跨周期薪资不能自动排除',()=>{
 for(const raw of [{minSalary:null,maxSalary:null},{currency:'EUR'},{salaryPeriod:'annual'},{salaryPeriod:'bad'},{minSalary:200,maxSalary:50},{currency:null},{minSalary:'80',maxSalary:null}])assert.equal(salary(change(raw)),'unknown');
 assert.equal(salary({...job,source:'greenhouse'}),'unknown');
 assert.equal(jobConditions(change({salaryPeriod:null})).salary.period,'annual');
});
test('雇佣类型按源枚举匹配，无法识别则待核实',()=>{
 assert.equal(conditionReasons(job,profile)[0].status,'pass');
 assert.equal(conditionReasons(change({employmentType:'Full Time'}),profile)[0].status,'fail');
 for(const employmentType of ['Other','Full Time / Intern',null])assert.equal(conditionReasons(change({employmentType}),profile)[0].status,'unknown');
 assert.deepEqual(conditionReasons(job,{targets:{}}),[]);
});
test('薪资与雇佣类型变化使岗位版本失效，观察时间不影响',()=>{
 assert.notEqual(jobVersion(job),jobVersion(change({maxSalary:130})));
 assert.notEqual(jobVersion(job),jobVersion(change({employmentType:'Full Time'})));
 assert.equal(jobVersion(job),jobVersion({...job,last_seen:'tomorrow'}));
});
test('薪资设置必须成组填写，支持清空并保留其他资料',()=>{
 const f=new URLSearchParams({profile_hash:hash(profile),remote_required:'true',salary_floor:'0',salary_currency:'usd',salary_period:'hourly'});
 assert.equal(updatePreferences(profile,f).targets.salary_currency,'USD');
 for(const [k,v] of [['salary_floor',''],['salary_floor','-1'],['salary_floor','Infinity'],['salary_currency',''],['salary_period','year']]){const bad=new URLSearchParams(f);bad.set(k,v);assert.throws(()=>updatePreferences(profile,bad));}
 for(const key of ['salary_floor','salary_currency','salary_period'])f.set(key,'');
 assert.equal(updatePreferences(profile,f).targets.salary_floor,null);
});
