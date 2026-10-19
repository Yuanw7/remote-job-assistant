# 海外 Remote 求职助手

推荐方案 C 的画像与匹配原型：只读采集公开岗位，保存 SQLite、去重并生成本地 HTML/JSON 审核清单。需要 **Node.js 24+**，使用内置 SQLite/fetch/test，无第三方运行依赖，无须 `npm install`。

## 立即体验

```sh
npm run demo
```

打开 `artifacts/demo.html`。演示使用虚构岗位和虚构 CN 前端画像；不表示用户所在地或职业。演示数据库和真实采集数据库完全分开。

```sh
node index.js init
# 编辑 private/candidate.json，填真实资料，确认后设置 is_example: false
npm run collect -- --pages 2
npm run report
```

打开 `artifacts/jobs.html` 查看真实岗位。画像可以暂不填写；此时资格保持待核实。填写 `identity.residence_country`（如 CN）、`targets.role_titles` 和其他真实信息后，运行 `npm run report` 重新判断，不必重新联网。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 显示帮助 |
| `npm run demo` | 离线演示，输出 4 个虚构岗位 |
| `node index.js init` | 创建本地资料模板，不覆盖已有资料 |
| `npm run collect -- --query frontend --pages 2` | Himalayas 关键词查询，最多 5 页；关键词只是示例 |
| `npm run collect -- --board gitlab` | Greenhouse 指定企业招聘板；gitlab 是已验证的示例，非目标公司建议 |
| `node index.js import --url 'https://job-boards.greenhouse.io/企业/jobs/职位ID'` | 导入单个 Greenhouse 职位；用真实链接替换占位内容 |
| `npm run report -- --profile private/candidate.json` | 基于已有数据和指定画像重建报告 |
| `npm test` | 运行领域规则、去重、分页、失败和报告安全测试 |

公开采集需网络访问，不需要登录或 API key。遇到 DNS、超时、429 等失败会保留旧数据、记录失败并返回非零退出码；报告包含最近采集状态。同一查询成功后缓存 24 小时，Greenhouse 12 小时；本次运行不自动重试失败请求。

## 当前能力和限制

已实现：Himalayas/Greenhouse 只读适配器、Greenhouse URL 导入、SQLite 职位与快照、同 ATS posting 的跨源去重、基础国家限制/远程工作方式/公司排除规则、职位名称关键词命中率、本地审核清单。

**这是 M1 的原型，不是完整 M1 验收通过。** 工作授权、时区重叠、合同方式、必要资格、完整语义技能评分、近似去重、职位关闭核实、正式英文简历排版导出与申请表填写尚未实现。现已增加多方向的证据词匹配与材料准备单，见下方。完整资格检查尚不具备，所以没有岗位会自动被标记为资格通过。标题匹配分不代表录用概率，也不能覆盖硬性冲突。

首次在线验证采集的是来源样本，不是按你的真实职业筛选的岗位。没有上传简历、登录招聘站或执行申请；本版根本没有提交代码。

## 文件与数据

- `index.js`：CLI 入口。
- `src/domain.js`：规则、校验与身份归一。
- `src/sources.js`：只读接口适配与 URL 导入。
- `src/store.js`：SQLite 持久化与运行记录。
- `src/report.js`：本地 HTML/JSON 输出。
- `fixtures/`：明确标记的虚构样例；`test/`：自动测试。
- `private/`：真实画像；`data/`：数据库；`artifacts/`：报告，均不进入 Git。

`config/candidate.example.json` 用于画像初始化；policy 和 sources 配置仍是未来的设计契约，本版本不读取它们。当前来源选择与页数通过 CLI 指定。保留 JavaScript ESM 以便直接运行，TypeScript 迁移推迟到接口稳定后；数据库 schema version 为 2，新增审核表并保留原数据，后续修改需添加迁移。

本地报告包含岗位原文及来源回链，默认只供个人审核。不要将报告直接作为公开招聘聚合站发布。

## 设计文档

| 文件 | 内容 |
| --- | --- |
| [MISSION.md](MISSION.md) | 使命、成功指标与待确认假设 |
| [docs/RESEARCH.md](docs/RESEARCH.md) | 26 项方案及原始来源 |
| [docs/PLANS.md](docs/PLANS.md) | 四条实施路线与成本估算 |
| [SKILL_MAP.md](SKILL_MAP.md) | 能力契约与实现进度 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 完整目标架构，尚非当前实现清单 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 阶段验收与剩余任务 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 决策与开放问题 |

## 两份简历接入后的使用方式

已将用户提供的两份 PDF 核对为同名同联系方式的两个求职版本，暂按同一候选人共享事实库建模。个人信息只保存在忽略 Git 的 `private/` 中；尚未推断当前居住国家、授权或全职可工作时间。

```sh
node index.js tracks --profile private/profiles/resume-based.json
node index.js discover --pages 1 --profile private/profiles/resume-based.json
node index.js report --track ai-application --profile private/profiles/resume-based.json
node index.js report --track business-operations --profile private/profiles/resume-based.json
node index.js prepare --job '完整岗位ID' --track ai-application --profile private/profiles/resume-based.json
```

方向报告分别为 `artifacts/jobs-ai-application.html` 和 `artifacts/jobs-business-operations.html`。首次建立私有画像时仅在 `private/candidate.json` 不存在时设置为默认，没有覆盖既有画像。

新增模块：`src/matching.js` 实现透明方向匹配；`src/brief.js` 生成只引用已有事实的 HTML/JSON 准备单。准备单不是可直接提交的英文简历；新增英文内容草稿见下文。所有事实均有来源 ID/页码，来源有原文件 hash，材料绑定画像与岗位快照 hash。

详见 [多方向画像工作流](docs/PROFILE_WORKFLOW.md)。针对两份简历的详细计划位于本地 `private/resume-review/PLAN.md`，不纳入版本控制。当前是人工核对 PDF 后形成结构化画像，尚未实现通用 PDF 自动导入。

## 审核与申请准备队列

```sh
node index.js queue --track ai-application --limit 5
node index.js queue --track business-operations --limit 5
node index.js review --job '完整岗位ID' --track ai-application --decision hold --note '需要确认时区'
```

打开 `private/queue/ai-application.html` 或 `private/queue/business-operations.html`，每条岗位都有材料准备包。review 支持 shortlist/hold/skip，保留历史并绑定资料版本；队列不代表已获提交授权。实际记录需要你作出审核决定，程序不会冒充人工批准。

新增 `src/requirements.js` 提取 JD 显式要求片段，`src/review.js` 管理版本化审核，`src/queue.js` 生成批量准备清单。完整报告和准备包均展示提取证据。提取器只是保守规则，尚非完整语义要求解析。

## 英文材料内容草稿

```sh
node index.js materials
node index.js materials --track ai-application --job '完整岗位ID'
```

已增加 `src/materials.js`，通过私有的 `private/translations.en.json` 复用与原事实绑定的英文表述。生成两方向母版或按岗位选材的英文简历内容、模板式求职信草稿及中英对照。queue 也会附上对应英文草稿链接。

输出位于 `private/materials/`（母版/单岗位）或 `private/queue/materials/`（队列），包括 HTML、TXT、JSON。它们是待审内容，不是已批准投递的正式简历；没有 PDF/DOCX 导出和提交功能。英文表述库由本次人工编写，系统没有调用外部翻译或大模型服务。

## 本地浏览器工作台

```sh
npm run dashboard
# 自定义端口或画像：
node index.js serve --port 4317 --profile private/candidate.json
```

打开 `http://127.0.0.1:4317`。工作台支持方向切换、岗位/公司搜索、分页、相关岗位及审核状态筛选；可填写理由保存优先/暂缓/不考虑，或生成材料准备单和英文草稿。无需复制岗位 ID。已有 CLI 继续可用。

工作台只监听本机 127.0.0.1，按 Ctrl+C 停止。它读取已有 SQLite 职位，不在网页里采集新岗位或投递。启动后每次请求读取指定画像，因此修改画像后刷新即可；若提交旧页面的审核，版本校验会要求刷新。

网页生成材料位于 `private/dashboard/`。材料链接通过当前进程登记的随机 ID 提供，不开放 private 目录浏览；重启后旧链接失效，可重新生成，磁盘材料仍保留。未配置英文表述库时只生成准备单；库内容无效时明确报错。

新增 `src/dashboard.js`；HTTP 集成测试使用独立的临时虚构数据。完整 `npm test` 需要允许监听临时 localhost 端口，受限沙箱可能需额外运行权限。测试不会修改真实候选人的审核记录。

求职条件页面：`http://127.0.0.1:4317/settings`。可编辑实际居住国家/城市、时区、每周工时、雇佣类型、远程要求和排除公司。未知字段留空；国家使用两位代码。居住地、远程要求、排除公司以及已识别的雇佣类型参与自动筛选；时区/工时仅记录供人工核实。

保存会保留简历事实和事实确认状态，增加画像版本，在画像文件旁的 `profile-history/` 保存旧文件，并原子替换当前文件。旧页面提交返回冲突；历史审核自动显示需重审。英文表述仍绑定原事实，可重新生成新版本材料。示例画像不可通过网页修改，先 `node index.js init`。网页没有工作授权确认功能。


薪资设置支持底线、三位币种代码和计薪周期，三项须一起填写或全部留空。Himalayas 的薪资按原始 `salaryPeriod` 比较（参考 [官方字段文档](https://himalayas.app/api)，核对日期 2026-10-16）。仅在同币种、同周期且上限低于底线时排除；未知金额、异常区间、跨币种/周期、区间重叠均待核实，不自动换汇或推算工时。Greenhouse 暂不提取薪资和雇佣类型，保留待核实。

工作台岗位卡显示雇佣类型和薪资。规则直接读取已保存的 Himalayas 原始快照，旧数据无需迁移；薪资或雇佣类型变化会使已有审核失效。此次扩充岗位版本计算后，已有审核将需要一次重审。真实候选人的底线与偏好不会自动填入。
