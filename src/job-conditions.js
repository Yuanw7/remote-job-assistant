// Read explicit source fields, including snapshots collected before this feature.
const types={'Full Time':'full_time','Part Time':'part_time',Contractor:'contractor',Intern:'internship',Temporary:'temporary',Volunteer:'volunteer'};
export const employmentLabels={full_time:'全职',part_time:'兼职',contractor:'合同合作',internship:'实习',temporary:'临时',volunteer:'志愿者'};
export const salaryPeriods={hourly:'小时',weekly:'周',fortnightly:'两周',monthly:'月',annual:'年'};
export function jobConditions(job){
 const raw=job.source==='himalayas'?job.raw||{}:{};
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 return {employment_type:types[raw.employmentType]||null,employment_label:typeof raw.employmentType==='string'?raw.employmentType:null,
  salary:{min:number(raw.minSalary),max:number(raw.maxSalary),currency:typeof raw.currency==='string'?raw.currency.toUpperCase():null,period:raw.salaryPeriod==null?'annual':raw.salaryPeriod}};
}
export function conditionReasons(job,profile){
 const c=jobConditions(job),t=profile.targets,reasons=[];
 const add=(status,field,reason)=>reasons.push({status,field,reason});
 if(t.employment_types?.length){
  if(!c.employment_type)add('unknown','employment','岗位雇佣类型缺失或无法识别，需人工核实');
  else if(!t.employment_types.includes(c.employment_type))add('fail','employment',`雇佣类型不符合偏好：${employmentLabels[c.employment_type]}`);
  else add('pass','employment',`雇佣类型符合偏好：${employmentLabels[c.employment_type]}`);
 }
 if(t.salary_floor!=null){
  const s=c.salary;
  if(!Number.isFinite(t.salary_floor)||t.salary_floor<0||!t.salary_currency||!Object.hasOwn(salaryPeriods,t.salary_period))add('unknown','salary','薪资偏好不完整或无效，请更新求职条件');
  else if((s.min===null&&s.max===null)||!s.currency||!Object.hasOwn(salaryPeriods,s.period))add('unknown','salary','岗位薪资信息缺失或无效，需人工核实');
  else if(s.min!==null&&s.max!==null&&s.min>s.max)add('unknown','salary','岗位薪资区间异常，需人工核实');
  else if(s.currency!==t.salary_currency||s.period!==t.salary_period)add('unknown','salary','薪资币种或计薪周期不同，未自动换汇或折算');
  else if(s.max!==null&&s.max<t.salary_floor)add('fail','salary',`薪资上限 ${s.max} ${s.currency}/${salaryPeriods[s.period]} 低于底线 ${t.salary_floor}`);
  else if(s.min!==null&&s.min>=t.salary_floor)add('pass','salary','岗位公布的薪资下限达到底线，实际报价仍待确认');
  else add('unknown','salary','薪资区间可能达到底线，需确认实际报价');
 }
 return reasons;
}
export function conditionsSummary(job){
 const c=jobConditions(job),s=c.salary;
 const amount=s.min===null&&s.max===null?'未披露':`${s.min??'?'}–${s.max??'?'} ${s.currency||'币种待核实'}/${salaryPeriods[s.period]||'周期待核实'}`;
 return `雇佣类型：${employmentLabels[c.employment_type]||c.employment_label||'待核实'} · 薪资：${amount}`;
}
