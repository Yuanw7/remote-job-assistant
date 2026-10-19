import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createDashboard, listenDashboard } from './src/dashboard.js';
import { savePreferences } from './src/profile-settings.js';
import { openStore } from './src/store.js';
import { validateProfile } from './src/domain.js';
import { collectHimalayas, collectGreenhouse, importGreenhouse } from './src/sources.js';
import { selectTracks } from './src/matching.js';
import { createMaterials } from './src/materials.js';
import { buildQueue } from './src/queue.js';
import { saveReview } from './src/review.js';
import { createBrief } from './src/brief.js';
import { makeReport } from './src/report.js';

const help = `Remote 求职助手 · 简历画像与方向匹配\n
  npm run dashboard                  打开本地浏览器工作台
  npm run demo                       离线虚构演示
  node index.js init                  创建本地画像（不覆盖已有文件）
  node index.js tracks                查看画像中的求职方向和搜索词
  node index.js discover --track ID   按方向的多个关键词采集
  node index.js collect --query TEXT 搜索 Himalayas
  node index.js collect --board NAME 采集 Greenhouse 企业招聘板
  node index.js import --url URL      导入单个 Greenhouse 职位
  node index.js report --track ID     生成方向审核报告
  node index.js prepare --job ID --track ID  生成带来源的本地材料准备单

  node index.js materials --track ID [--job ID]  生成英文材料草稿
  node index.js queue --track ID --limit 5  生成优先审核队列和准备包
  node index.js review --job ID --track ID --decision shortlist --note '理由'
  审核决定：shortlist（优先） / hold（暂缓） / skip（不考虑）。

选项：--profile PATH 指定画像；--pages 1-5（默认 2）；--help。
省略 --track 时查看/搜索全部已配置方向。搜索只发送通用岗位关键词，不发送简历。
真实数据 data/jobs.sqlite；报告 artifacts/jobs[-方向].html；准备单 private/briefs/。`;
async function runCollection(store, task) {
  const last = store.lastSuccess(task.source);
  if (last && Date.now() - Date.parse(last) < task.hours * 3600000) {
    console.log(`使用缓存：${task.source}`); return;
  }
  try {
    const jobs = await task.fetch();
    let added = 0;
    for (const job of jobs) if (store.save(job)) added++;
    store.run(task.source, 'ok', jobs.length);
    console.log(`${task.source}：采集 ${jobs.length} 条，新增 ${added} 条。`);
  } catch (error) {
    const message = error.message + (error.cause?.code ? ` (${error.cause.code})` : '');
    store.run(task.source, 'failed', 0, message);
    console.error(`采集失败，保留已有数据：${task.source} · ${message}`);
    process.exitCode = 1;
  }
}
async function main() {
  const options = Object.fromEntries(['profile','query','board','url','track','job','decision','note','limit','translations','port'].map(key => [key, { type: 'string' }]));
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { ...options, pages: { type: 'string', default: '2' }, help: { type: 'boolean' } } });
  const command = positionals[0];
  if (values.help || !command) { console.log(help); return; }
  if (!['demo','init','collect','report','import','discover','tracks','prepare','queue','review','materials','serve'].includes(command)) throw new Error(`未知命令 ${command}，使用 --help`);
  if (command === 'init') {
    mkdirSync('private', { recursive: true });
    if (!existsSync('private/candidate.json')) copyFileSync('config/candidate.example.json', 'private/candidate.json');
    console.log('资料模板：private/candidate.json（保留已有资料）'); return;
  }
  const demo = command === 'demo';
  const profilePath = values.profile || (demo ? 'fixtures/candidate.json' : existsSync('private/candidate.json') ? 'private/candidate.json' : 'config/candidate.example.json');
  const profile = validateProfile(JSON.parse(readFileSync(profilePath, 'utf8')));
  const tracks = selectTracks(profile, values.track);
  if (command === 'tracks') {
    console.log(tracks.length ? tracks.map(t => `${t.id} · ${t.label}\n  ${t.search_queries.join(' / ')}`).join('\n') : '当前画像没有 tracks。'); return;
  }
  const pages = Number(values.pages);
  if (!Number.isInteger(pages) || pages < 1 || pages > 5) throw new Error('--pages 必须是 1–5');
  const store = openStore(demo ? 'data/demo.sqlite' : 'data/jobs.sqlite');
  if (command === 'serve') {
    const server = createDashboard({store,
      saveProfile: form => savePreferences(profilePath,form),
      loadProfile: () => validateProfile(JSON.parse(readFileSync(profilePath,'utf8'))),
      loadCatalog: () => {const path=values.translations||'private/translations.en.json';return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;}
    });
    try {console.log(`工作台已启动：${await listenDashboard(server,Number(values.port||4317))}（Ctrl+C 停止）`);}
    catch(error){store.close();throw error;}
    const stop=()=>{server.close(()=>{store.close();process.exit(0);});server.closeAllConnections();};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);return;
  }
  try {
    if (command === 'materials') {
      const catalog = JSON.parse(readFileSync(values.translations || 'private/translations.en.json', 'utf8'));
      const job = values.job ? store.jobs().find(j => j.id === values.job) : null;
      if (values.job && !job) throw new Error('找不到岗位 ID');
      if (!tracks.length) throw new Error('画像没有求职方向');
      for (const track of tracks) {
        const result = createMaterials(profile, track.id, catalog, job);
        console.log(`英文草稿 ${track.id} · ${result.manifest.entries.length} 条事实：${result.path}`);
      }
      return;
    }
    if (command === 'queue') {
      const catalogPath = values.translations || 'private/translations.en.json';
      if (values.translations && !existsSync(catalogPath)) throw new Error('指定的英文表述库不存在');
      const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath,'utf8')) : null;
      const result = buildQueue(store, profile, values.track, Number(values.limit || 5), 'private/queue', catalog);
      console.log(`准备队列 ${result.report.selected.length}/${result.report.total_candidates}：${result.path}`); return;
    }
    if (command === 'review') {
      const job = store.jobs().find(j => j.id === values.job);
      if (!job) throw new Error('请提供有效 --job');
      const id = saveReview(store, job, profile, values.track, values.decision, values.note);
      console.log(`已记录审核 #${id}，不改变资格或提交权限。`); return;
    }
    if (command === 'prepare') {
      if (!values.job) throw new Error('prepare 需要 --job，岗位 ID 可从报告中复制');
      const job = store.jobs().find(j => j.id === values.job);
      if (!job) throw new Error('找不到岗位 ID，请从本地报告复制完整 ID');
      const result = createBrief(job, profile, values.track);
      console.log(`本地草稿，${result.brief.selected_facts.length} 项简历事实：${result.path}`); return;
    }
    if (demo) {
      const jobs = JSON.parse(readFileSync('fixtures/jobs.json', 'utf8'));
      jobs.forEach(job => store.save(job)); store.run('demo', 'ok', jobs.length);
    }
    const tasks = [];
    const searchTask = query => ({ source: `himalayas:${query || 'feed'}:pages=${pages}`, hours: 24, fetch: () => collectHimalayas({ query, pages }) });
    if (command === 'discover') {
      if (!tracks.length) throw new Error('discover 需要包含 tracks 的画像');
      const queries = [...new Set(tracks.flatMap(t => t.search_queries))];
      if (queries.length > 12) throw new Error('每次最多 12 个查询，请缩小求职方向');
      tasks.push(...queries.map(searchTask));
    } else if (command === 'collect') {
      tasks.push(values.board ? { source: `greenhouse:${values.board}`, hours: 12, fetch: () => collectGreenhouse(values.board) } : searchTask(values.query));
    } else if (command === 'import') {
      if (!values.url) throw new Error('import 需要 --url');
      tasks.push({ source: `import:${values.url}`, hours: 12, fetch: async () => [await importGreenhouse(values.url)] });
    }
    for (const task of tasks) await runCollection(store, task);
    const output = demo ? 'artifacts/demo.html' : `artifacts/jobs${values.track ? `-${values.track}` : ''}.html`;
    const report = makeReport(store, profile, output, demo ? 'demo' : 'live', values.track);
    console.log(`岗位 ${report.jobs.length} · 方向优先复核 ${report.relevant} · 待核实 ${report.counts.unknown} · 排除 ${report.counts.ineligible}`);
    console.log(`报告：${resolve(output)}`);
  } finally { store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
