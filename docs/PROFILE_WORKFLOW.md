# 简历画像与多方向求职

当前支持单个候选人的多个求职方向，共享一个带来源的事实库。个人简历、提取文本、画像和材料准备单放在 `private/`，不进入 Git。系统不自动合并不同候选人的履历。

## 命令

```sh
node index.js tracks
node index.js discover --track ai-application --pages 1
node index.js report --track ai-application
node index.js report --track business-operations
node index.js prepare --job '从报告复制完整岗位ID' --track ai-application
```

所有命令支持 `--profile PATH`。上面的方向 ID 来自当前本地画像，可用 `tracks` 核对。`discover` 仅发送 `search_queries` 中的岗位关键词；不发送简历、姓名、联系方式或事实库。

## 数据契约

- `sources[]`：`id/path/sha256/pages`，引用原始资料。
- `facts[]`：`id/source_id/page/statement/tags/status/confirmed_at`。
- `tracks[]`：`id/label/role_titles/search_queries/skill_tags/preferred_fact_ids/level_caution`。
- `pending_questions[]`：缺失的求职偏好或实际资格信息。

`resume_supported` 表示能在给定简历中找到依据，不表示已独立核验或刚经用户确认。`confirmed` 用于用户后续确认的事实；未支持事实不参与证据匹配。PDF 原件没有被改写，当前导入由本次人工抽取/页面核对完成，并非通用自动 PDF 解析功能。

## 相关性算法

标题符合任一方向角色得 60 分；已识别方向能力词中，有事实支撑的比例最多贡献 40 分。词表无命中时不加技能分；仅标题命中的结果上限 45。Senior/Staff/Principal/Director/Lead 等高级标记触发提醒，分数上限 49，不做绝对资格拒绝。

60 分及以上且未被硬规则排除的岗位列为“方向优先复核”。这个阈值是初始排序规则，需要用人工标签校准；没有通过线上效果验证。未识别的必需技能不在缺口列表里，所以“无简历依据方向词为空”并不代表满足全部要求。文本否定、上下文和年限尚未被语义理解。

方向报告仅使用指定方向评分；全方向报告选择最高分方向显示。资格与匹配完全分离：分数不能将 unknown 改成 eligible。

## 材料准备单

`prepare` 只选择该岗位匹配到的已有事实，按方向优先级排列，并展示来源页码、未确认项、画像 hash 和职位快照 hash。输出 HTML/JSON 位于 `private/briefs/`；它不是完成的简历或 cover letter，不产生外部发送。

## 尚未实现

完整 JD 要求抽取、语义匹配、实际资格确认、英文材料生成、PDF/DOCX 导出、浏览器填表和提交。实际项目状态以 README 与测试为准，架构文档仍描述目标状态。

## 审核队列与 JD 显式要求（已实现）

```sh
node index.js queue --track ai-application --limit 5
node index.js queue --track business-operations --limit 5
node index.js review --job '完整岗位ID' --track ai-application --decision shortlist --note '人工审核理由'
```

`queue` 会生成 `private/queue/方向.html`、同名 JSON 和链接的材料准备包。默认最多 5 个，可以用 `--limit 1–30` 调整。优先选择有效 shortlist，其后按方向相关性排序；未人工审核的高相关岗位也进入待审核队列，不会伪造审核决定。

审核决定为 `shortlist`（优先）、`hold`（暂缓）、`skip`（不考虑）。hold/skip 暂不进入准备队列；可以通过新的 review 命令更新决定，旧记录追加保留。审核按候选人、方向、画像 hash、岗位内容及资格字段 hash 绑定；版本变化后原决定标为 stale，需重新审核。shortlist 不覆盖明确不合格规则、不将 unknown 改成 eligible，也不授权上传或提交。

JD 提取只识别显式的年限、工作授权、地域、时间重叠和语言条件，保留句子与来源 URL。preferred/optional/not required 等片段不会被自动当成硬性年限要求。没有抽到要求不等于不存在要求；目前没有实现完整语义解析或候选人年限计算。

SQLite schema 升至 2，新增 reviews 表和索引，原岗位/快照/运行记录保留。队列输出覆盖同方向最新清单；材料准备包按内容版本命名。

## 英文材料草稿（已实现）

```sh
node index.js materials
node index.js materials --track ai-application
node index.js materials --track ai-application --job '完整岗位ID'
node index.js queue --track business-operations --limit 5
```

`materials` 默认读取 `private/translations.en.json`，可通过 `--translations PATH` 指定；沿用 `--profile PATH`。不指定岗位时，按方向的事实优先列表生成母版内容草稿；指定岗位时，只选匹配到的经历/项目，并保留教育与语言事实。若没有匹配的经历，不自动拼出空泛求职信。

每条译文包含 `fact_id/fact_hash/text/section/status/review_notes`。英文表述库是本次根据既有事实人工编写的草稿，不是通用机器翻译功能。模块只验证候选人、事实关联、事实 hash、结构、占位符与版本；无法证明译文在语义上没有夸大，仍须逐条审阅。

输出 HTML 审阅版、`.resume.txt`、可用时的 `.cover-letter.txt` 以及 JSON 映射。HTML 展示中英逐条对照和源页码。输出文件名绑定画像、译文库和岗位版本；原事实变化时旧译文会被阻止使用。所有输出始终为 `draft_not_for_submission`，没有自动批准入口。

当前未生成正式 PDF/DOCX、完整排版简历或最终英文简历；英文姓名、学位正式名称、公司/职称正式译名与求职条件仍待确认。TXT 保留显眼的草稿标记。没有把 unknown 资格转成可投状态，也没有上传材料。

存在英文表述库时，queue 会同时生成岗位英文草稿链接；若显式指定的库缺失、候选人不一致或事实版本不一致，会明确失败，而不是悄悄生成错误候选人的材料。

## 浏览器审核入口

运行 `npm run dashboard` 后访问 `http://127.0.0.1:4317`。保存审核和生成材料均为显式表单操作；当前页面的 profile/job hash 与最新资料不符时返回 409，要求刷新。审核依然只改变本地优先级，不授予外部提交权限。

搜索与筛选均由服务端处理，10 条/页，不需要浏览器脚本或外部 CDN。表单使用同源检查及防跨站 token；Host 仅接受实际监听端口上的 127.0.0.1。它是个人本地工具，不提供多用户登录或公网部署。
