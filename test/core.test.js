import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, validateProfile } from '../src/domain.js';
import { openStore } from '../src/store.js';
import { collectHimalayas, getJson, normalizeGreenhouse, importGreenhouse } from '../src/sources.js';
import { makeReport } from '../src/report.js';
const profile = JSON.parse(readFileSync(new URL('../fixtures/candidate.json', import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL('../fixtures/jobs.json', import.meta.url)));

test('remote 与 Worldwide 不作为完整资格证明', () => {
  assert.equal(evaluate(fixture[0], profile).status, 'unknown');
  assert.equal(evaluate(fixture[2], profile).status, 'unknown');
});
test('已知地域与工作方式冲突被排除', () => {
  assert.equal(evaluate(fixture[1], profile).status, 'ineligible');
  assert.equal(evaluate(fixture[3], profile).status, 'ineligible');
});
test('JD 明确限制优先于聚合标签，未知国家代码不盲目排除', () => {
  assert.equal(evaluate({ ...fixture[2], description: 'US residents only' }, profile).status, 'ineligible');
  assert.equal(evaluate({ ...fixture[2], allowed_countries: ['APAC'] }, profile).status, 'unknown');
});
test('缺失画像保持未知且错误格式报错', () => {
  assert.equal(evaluate(fixture[0], { ...profile, identity: {} }).status, 'unknown');
  assert.throws(() => validateProfile({ ...profile, identity: { residence_country: 'China' } }), /ISO/);
});
test('跨来源同 ATS ID 去重且保留原始快照与来源，失败不清空', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-jobs-'));
  const store = openStore(join(dir, 'test.sqlite'));
  try {
    const ats = normalizeGreenhouse({ id: 123, title: 'Frontend', absolute_url: 'https://job-boards.greenhouse.io/example/jobs/123', content: 'original', location: { name: 'Remote' } }, 'example');
    assert.equal(store.save(ats), true);
    assert.equal(store.save({ ...ats, source: 'himalayas', external_id: 'aggregator-1', description: 'aggregate' }), false);
    assert.equal(store.jobs().length, 1);
    assert.equal(store.jobs()[0].sources.length, 2);
    assert.equal(store.jobs()[0].description, 'original');
    store.run('himalayas', 'failed', 0, 'HTTP 429');
    assert.equal(store.jobs().length, 1);
    assert.equal(store.runs()[0].status, 'failed');
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});
test('分页遵循 nextCursor 且响应格式变化可见', async () => {
  const seen = [];
  const fetcher = async url => {
    seen.push(String(url));
    return { ok: true, json: async () => ({ jobs: [{ guid: String(seen.length), title: 'Engineer', companyName: 'Example', applicationLink: 'https://example.com/apply' }], nextCursor: seen.length === 1 ? 'cursor-1' : null }) };
  };
  assert.equal((await collectHimalayas({ pages: 5, fetcher })).length, 2);
  assert.match(seen[1], /cursor=cursor-1/);
  await assert.rejects(collectHimalayas({ fetcher: async () => ({ ok: true, json: async () => ({}) }) }), /格式变化/);
});
test('429 记录 Retry-After 且不立即重试', async () => {
  let calls = 0;
  await assert.rejects(getJson('https://example.com', async () => { calls++; return { ok: false, status: 429, headers: new Headers({ 'retry-after': '60' }) }; }), /Retry-After=60/);
  assert.equal(calls, 1);
});
test('URL 导入限制为已支持的官方 ATS，拒绝任意地址', async () => {
  await assert.rejects(importGreenhouse('http://127.0.0.1/private'), /仅支持/);
});
test('报告将职位 HTML 转义，并包含真实失败记录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-report-'));
  const store = openStore(join(dir, 'test.sqlite'));
  try {
    store.save({ ...fixture[0], title: '<img src=x onerror=alert(1)>', description: '</p><script>alert(1)</script>' });
    store.run('source', 'failed', 0, '<error>');
    const result = makeReport(store, profile, join(dir, 'report.html'), 'demo');
    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    assert.equal(result.counts.unknown, 1);
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;error&gt;'));
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});
