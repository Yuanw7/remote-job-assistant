import { employmentLabels, salaryPeriods } from './job-conditions.js';
import { readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, validateProfile } from './domain.js';
import { escapeHtml as e } from './report.js';

const employment = employmentLabels;
const conflict = () => Object.assign(new Error('画像已更新，请刷新求职条件后再保存'),{status:409});
export function updatePreferences(profile, form) {
  if(form.get('profile_hash')!==hash(profile)) throw conflict();
  const value=name=>(form.get(name)||'').trim();
  const country=value('residence_country').toUpperCase()||null;
  if(country&&!/^[A-Z]{2}$/.test(country)) throw new Error('居住国家请填写两位代码，例如 CN、US');
  const city=value('residence_city')||null;
  if(city?.length>100)throw new Error('城市名称过长');
  const timezone=value('timezone')||null;
  if(timezone){try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw new Error('时区无效，请使用 Asia/Shanghai 等 IANA 时区名称');}}
  const hours=value('weekly_hours')?Number(value('weekly_hours')):null;
  if(hours!==null&&(!Number.isFinite(hours)||hours<1||hours>80))throw new Error('每周工时需在 1–80 之间，或留空');
  const types=[...new Set(form.getAll('employment_types'))];
  if(types.some(t=>!Object.hasOwn(employment,t)))throw new Error('无效雇佣类型');
  if(!['true','false'].includes(value('remote_required')))throw new Error('请选择远程要求');
  const excluded=[...new Set(value('excluded_companies').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  if(excluded.length>100||excluded.some(x=>x.length>200))throw new Error('排除公司最多 100 家，每家不超过 200 字');
  const salaryProvided=['salary_floor','salary_currency','salary_period'].some(k=>form.has(k));
  const salary={salary_floor:value('salary_floor')?Number(value('salary_floor')):null,salary_currency:value('salary_currency').toUpperCase()||null,salary_period:value('salary_period')||null};
  if(salaryProvided&&Object.values(salary).some(v=>v!==null)&&(!Number.isFinite(salary.salary_floor)||salary.salary_floor<0||!salary.salary_currency||!/^[A-Z]{3}$/.test(salary.salary_currency)||!Object.hasOwn(salaryPeriods,salary.salary_period)))throw new Error('薪资底线、三位币种代码和计薪周期需一起填写，或全部留空');
  const next=structuredClone(profile);
  if(salaryProvided)Object.assign(next.targets,salary);
  Object.assign(next.identity,{residence_country:country,residence_city:city,timezone});
  Object.assign(next.targets,{weekly_hours:hours,employment_types:types.length?types:null,remote_required:value('remote_required')==='true',excluded_companies:excluded});
  next.profile_version=(Number.isInteger(profile.profile_version)?profile.profile_version:0)+1;
  next.preferences_updated_at=new Date().toISOString();
  return validateProfile(next);
}
// Synchronous read/compare/write serializes saves within the local server. Old tabs cannot overwrite a newer version.
export function savePreferences(path, form) {
  const original=readFileSync(path,'utf8');
  const profile=JSON.parse(original);
  const next=updatePreferences(profile,form);
  if(profile.is_example)throw new Error('示例画像不可在网页修改，请先运行 node index.js init');
  const dir=dirname(path), history=join(dir,'profile-history');
  mkdirSync(history,{recursive:true,mode:0o700});
  const backup=join(history,`${hash(profile)}.json`);
  try{writeFileSync(backup,original,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  const temp=join(dir,`.profile-${randomUUID()}.tmp`);
  try{
    writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});
    if(readFileSync(path,'utf8')!==original)throw conflict();
    renameSync(temp,path);
  }finally{try{unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return next;
}
export function settingsBody(profile,csrf,saved=false) {
  const input=(name,label,value,attrs='')=>`<p><label>${label}<br><input name="${name}" value="${e(value??'')}" ${attrs}></label></p>`;
  return `<a href="/">返回岗位工作台</a><h1>求职条件</h1>${saved?'<p role="status">求职条件已保存，旧画像已备份。岗位筛选已更新，旧审核需重审。</p>':''}<p>未知条件可以留空。居住地、远程要求、雇佣类型、薪资底线和排除公司参与筛选；时区与工时目前仅记录。缺失条件保持待核实。</p><form method="post" action="/settings"><input type="hidden" name="csrf" value="${e(csrf)}"><input type="hidden" name="profile_hash" value="${hash(profile)}">${input('residence_country','实际居住国家（两位代码，如 CN / US）',profile.identity.residence_country,'maxlength="2"')}${input('residence_city','实际居住城市',profile.identity.residence_city,'maxlength="100"')}${input('timezone','当前时区（如 Asia/Shanghai）',profile.identity.timezone)}${input('weekly_hours','每周可投入工时（未知留空）',profile.targets.weekly_hours,'type="number" min="1" max="80" step="any"')}<p><label>远程要求 <select name="remote_required"><option value="true" ${profile.targets.remote_required?'selected':''}>仅远程</option><option value="false" ${!profile.targets.remote_required?'selected':''}>也考虑非远程</option></select></label></p><fieldset><legend>可接受的雇佣类型（不选表示未知）</legend>${Object.entries(employment).map(([v,l])=>`<label><input type="checkbox" name="employment_types" value="${v}" ${profile.targets.employment_types?.includes(v)?'checked':''}>${l}</label> `).join('')}</fieldset>${input('salary_floor','薪资底线（税前，未知留空）',profile.targets.salary_floor,'type="number" min="0" step="any"')}${input('salary_currency','薪资币种（三位代码，如 USD / CNY）',profile.targets.salary_currency,'maxlength="3"')}<p><label>计薪周期 <select name="salary_period"><option value="">未知</option>${Object.entries(salaryPeriods).map(([v,l])=>`<option value="${v}" ${profile.targets.salary_period===v?'selected':''}>每${l}</option>`).join('')}</select></label></p><p>薪资仅比较同币种、同周期。上限低于底线才排除；跨币种、跨周期、缺失薪资和区间重叠需核实。</p><p><label>排除公司（每行一家，按完整公司名称匹配）<br><textarea name="excluded_companies" rows="5" cols="45">${e((profile.targets.excluded_companies||[]).join('\n'))}</textarea></label></p><p>保存只更新以上条件，不会确认简历事实或工作授权。原始简历与事实来源保留。</p><button type="submit">保存求职条件</button></form>`;
}
