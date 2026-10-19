import { conditionsSummary } from './job-conditions.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, hash, safeUrl } from './domain.js';
import { matchJob, selectTracks } from './matching.js';
import { currentReview, saveReview } from './review.js';
import { jobVersion, extractRequirements } from './requirements.js';
import { createBrief } from './brief.js';
import { createMaterials } from './materials.js';
import { settingsBody } from './profile-settings.js';
import { page, escapeHtml as e } from './report.js';

const reviewNames = {shortlist:'优先',hold:'暂缓',skip:'不考虑'};
const eligibilityNames = {eligible:'资格通过',unknown:'资格待核实',ineligible:'已排除'};
const hidden = (name,value) => `<input type="hidden" name="${e(name)}" value="${e(value)}">`;
const errorWith = (message,status=400) => Object.assign(new Error(message),{status});
async function readForm(req) {
  if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw errorWith('仅接受表单请求',415);
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>32768)throw errorWith('请求过大',413);chunks.push(chunk);}
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
export function createDashboard({store, loadProfile, saveProfile, loadCatalog=()=>null, outputDir='private/dashboard'}) {
  const csrf=randomBytes(24).toString('hex');
  const artifacts=new Map();
  const register=(path)=>{const key=randomBytes(16).toString('hex');artifacts.set(key,path);return `/artifact/${key}`;};
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(body);};
    try {
      const address=server.address();
      if(!address)throw errorWith('工作台正在停止，请稍后刷新',503);
      const expectedHost=`127.0.0.1:${address.port}`;
      const origin=`http://${expectedHost}`;
      if(req.headers.host!==expectedHost)throw errorWith('请使用本机 127.0.0.1 地址访问',403);
      if(req.headers['sec-fetch-site']==='cross-site')throw errorWith('拒绝跨站请求',403);
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&url.pathname.startsWith('/artifact/')){
        const path=artifacts.get(url.pathname.slice('/artifact/'.length));
        if(!path)throw errorWith('材料链接已过期或不存在，请重新生成',404);
        send(200,readFileSync(path,'utf8'));return;
      }
      if(req.method==='GET'&&url.pathname==='/health') {send(200,'ok');return;}
      const profile=loadProfile();
      if(req.method==='POST'){
        if(req.headers.origin!==origin)throw errorWith('请求来源不匹配',403);
        const form=await readForm(req);
        if(form.get('csrf')!==csrf)throw errorWith('页面已过期，请刷新后重试',403);
        if(url.pathname==='/settings'){
          if(!saveProfile)throw errorWith('当前工作台未配置画像保存',403);
          saveProfile(form);
          res.writeHead(303,{Location:'/settings?saved=1'});res.end();return;
        }
        const track=form.get('track');selectTracks(profile,track);
        if(!track)throw errorWith('缺少方向');
        const job=store.jobs().find(j=>j.id===form.get('job'));
        if(!job)throw errorWith('岗位不存在',404);
        if(form.get('profile_hash')!==hash(profile)||form.get('job_hash')!==jobVersion(job))throw errorWith('资料或岗位已更新，请刷新后重新审核',409);
        if(url.pathname==='/review'){
          saveReview(store,job,profile,track,form.get('decision'),form.get('note'));
          res.writeHead(303,{Location:`/?track=${encodeURIComponent(track)}&saved=1`});res.end();return;
        }
        if(url.pathname==='/generate'){
          const catalog=loadCatalog();
          const material=catalog ? createMaterials(profile,track,catalog,job,join(outputDir,'materials')) : null;
          const brief=createBrief(job,profile,track,join(outputDir,'briefs'));
          send(200,page('材料已生成',`<a href="/?track=${e(track)}">返回工作台</a><h1>材料草稿已生成</h1><p>${e(job.title)} · ${e(job.company)}</p><p>这些材料仍待审核，没有上传或提交。</p><p><a href="${register(brief.path)}">查看材料准备单</a></p>${material ? `<p><a href="${register(material.path)}">查看英文简历与求职信草稿</a></p>` : '<p>未配置英文表述库，仅生成准备单。</p>'}`));return;
        }
        throw errorWith('操作不存在',404);
      }
      if(req.method!=='GET'){res.setHeader('Allow','GET, POST');throw errorWith('不支持的请求方法',405);}
      if(url.pathname==='/settings'){send(200,page('求职条件',settingsBody(profile,csrf,url.searchParams.get('saved')==='1')));return;}
      if(url.pathname!=='/')throw errorWith('页面不存在',404);
      const tracks=selectTracks(profile);
      if(!tracks.length)throw errorWith('请先在本地画像中配置求职方向');
      const track=url.searchParams.get('track')||tracks[0].id;
      selectTracks(profile,track);
      const q=(url.searchParams.get('q')||'').trim().slice(0,200).toLowerCase();
      const filter=url.searchParams.get('filter')||'priority';
      if(!['priority','all','shortlist','hold','skip','unreviewed'].includes(filter))throw errorWith('无效筛选项');
      const rows=store.jobs().map(job=>({job,match:matchJob(job,profile,track).best,assessment:evaluate(job,profile),review:currentReview(store,job,profile,track)}));
      const filtered=rows.filter(r=>(!q||`${r.job.title} ${r.job.company}`.toLowerCase().includes(q))&&(filter==='all'||filter==='priority'?(filter==='all'||r.match.score>=60&&r.assessment.status!=='ineligible'):filter==='unreviewed'?(!r.review||r.review.stale):r.review?.decision===filter&&!r.review.stale));
      filtered.sort((a,b)=>b.match.score-a.match.score||a.job.id.localeCompare(b.job.id));
      const maxPage=Math.max(1,Math.ceil(filtered.length/10));
      const requested=Number(url.searchParams.get('page')||1);
      const current=Number.isInteger(requested)?Math.max(1,Math.min(maxPage,requested)):1;
      const visible=filtered.slice((current-1)*10,current*10);
      const link=n=>{const params=new URLSearchParams({track,q,filter,page:String(n)});return `/?${params}`;};
      const cards=visible.map(({job,match,assessment,review})=>{
        const fields=hidden('csrf',csrf)+hidden('track',track)+hidden('job',job.id)+hidden('profile_hash',hash(profile))+hidden('job_hash',jobVersion(job));
        const evidence=extractRequirements(job);
        return `<article><h2>${e(job.title)}</h2><p>${e(job.company)} · ${e(job.location||'地域未明确')} · 相关性 ${match.score}</p><p>${e(conditionsSummary(job))}</p><p class="tag ${assessment.status}">${eligibilityNames[assessment.status]}</p><p>审核：${review ? `${e(reviewNames[review.decision])}${review.stale?'（资料已变，需重审）':''}`:'未审核'}</p><p>${e(review?.note||'')}</p><ul>${assessment.reasons.filter(r=>r.status!=='pass').map(r=>`<li>${e(r.reason)}</li>`).join('')}${match.cautions.map(c=>`<li>${e(c)}</li>`).join('')}</ul><details><summary>JD 要求与匹配依据</summary><p>${e(match.explanation)}</p><p>${e(match.matched_skills.map(x=>x.tag).join(' / '))}</p><ul>${evidence.evidence.map(x=>`<li>${e(x.type)}：${e(x.quote)}</li>`).join('')}</ul><p>${e(job.description)}</p></details><form method="post" action="/review">${fields}<label>审核决定 <select name="decision"><option value="shortlist">优先</option><option value="hold">暂缓</option><option value="skip">不考虑</option></select></label><label>理由 <input name="note" required maxlength="4000" placeholder="记录你的判断依据"></label><button type="submit">保存审核</button></form><form method="post" action="/generate">${fields}<button type="submit">生成材料草稿</button> <a href="${e(safeUrl(job.apply_url)||'#')}" target="_blank" rel="noreferrer">查看原始岗位</a></form></article>`;
      }).join('');
      const body=`<h1>Remote 求职工作台</h1><p>筛选岗位 → 记录审核 → 准备材料 · <a href="/settings">编辑求职条件</a></p>${url.searchParams.get('saved')==='1'?'<p role="status">审核已保存。</p>':''}<div class="metrics">已收集 ${rows.length} 个岗位 · 当前筛选 ${filtered.length} 个 · 第 ${current}/${maxPage} 页</div><p><small>相关性只用于排序；优先不代表资格通过。填写本地审核不会向招聘网站发送资料。</small></p><form method="get"><label>方向 <select name="track">${tracks.map(t=>`<option value="${e(t.id)}" ${t.id===track?'selected':''}>${e(t.label)}</option>`).join('')}</select></label><label>状态 <select name="filter">${[['priority','方向相关'],['all','全部岗位'],['unreviewed','待审核'],['shortlist','优先'],['hold','暂缓'],['skip','不考虑']].map(([v,l])=>`<option value="${v}" ${v===filter?'selected':''}>${l}</option>`).join('')}</select></label><label>搜索 <input name="q" value="${e(q)}" placeholder="岗位或公司"></label><button type="submit">筛选</button></form><details><summary>待补充的求职条件</summary><ul>${(profile.pending_questions||[]).map(x=>`<li>${e(x)}</li>`).join('')}</ul><p><a href="/settings">编辑求职条件</a>；保存后更新筛选并使旧审核失效。</p></details>${cards||'<article><p>没有符合当前筛选的岗位。尝试其他关键词或“全部岗位”。</p></article>'}<p>${current>1?`<a href="${e(link(current-1))}">上一页</a>`:''} ${current<maxPage?`<a href="${e(link(current+1))}">下一页</a>`:''}</p>`;
      send(200,page('Remote 求职工作台',body));
    }catch(error){send(error.status||400,page('操作未完成',`<h1>操作未完成</h1><p>${e(error.message)}</p><a href="/">返回工作台</a>`));}
  });
  server.requestTimeout=15000;
  return server;
}
export async function listenDashboard(server, port=4317) {
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('port 必须为 0–65535');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  return `http://127.0.0.1:${server.address().port}`;
}
