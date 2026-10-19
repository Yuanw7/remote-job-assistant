# 现有方案与数据源调研

调研日期：2026-10-16。以下 26 项按产品、可复用组件、岗位来源与平台约束分类。来源以厂商文档、官方仓库和原始 API 为主；搜索用于发现，结论链接到具体页面。

证据边界：完成网页/文档核查，未付费试用这些产品，未实测其投递成功率、面试提升率或账户安全性。厂商功能描述不等于独立验证。“建议”列是本项目判断。价格与功能会变，实施前重新核对；本报告不采信“永不封号”“保证面试”等营销承诺。

## 商业产品：8 项

| ID / 方案 | 官方资料中的能力 | 对本项目的启发与限制 |
| --- | --- | --- |
| R01 [Simplify Copilot](https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications) | 自动填写资料、复用问答、辅助简历/求职信、申请追踪；文档明确用户检查后自行提交 | 最好的辅助填表基线；不能当作无人值守海投服务。可先借用它验证人工耗时 |
| R02 [LoopCV](https://loopcv.freshdesk.com/support/solutions/articles/103000399849-knowledge-base) | 按 Loop 搜索匹配；邮件、表单和扩展支持三种申请路径；问题可能等待用户补充 | 借鉴持续队列、待回答状态和总开关；不同站点的自动化程度不一致 |
| R03 [AIApply](https://support.aiapply.co/en/articles/14216708-how-auto-apply-works) | 答案库、Auto/Hybrid 等模式、额度与申请数量设置 | 借鉴答案库和分级提交；官方页面列有 $49/月 100 次、$99/月 250 次，材料定制另列加购；仅作报价快照 |
| R04 [LazyApply](https://lazyapply.com/) | 宣传多平台自动申请、个性化填表和追踪 | 可作为商业对照；其“不会被封”说法不是可靠工程保证。采购前用实际目标国家和 ATS 验证 |
| R05 [Jobright](https://jobright.ai/) | 职位匹配、自动填表、岗位定制简历、内推连接建议 | 借鉴统一候选人画像；全球岗位与用户所在地的实际覆盖仍需试用核验 |
| R06 [Teal](https://www.tealhq.com/how-it-works) | 职位收藏、关键词、简历生成与申请追踪 | 适合作为管理和材料基线；本次来源不足以把它列为无人值守投递引擎 |
| R07 [Huntr](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension) | 扩展保存职位、自动填写资料，与 tracker 配合 | 借鉴浏览器采集到申请记录的衔接；复杂筛选题仍须验证 |
| R08 [Massive](https://usemassive.com/terms) | Auto Apply 使用问卷与候选人资料识别岗位、生成材料并提交 | 可对照全托管体验；不能从服务条款推断真实成功率或全球覆盖 |

商业方案的共同空白：这些公开资料不能证明“你所在地区 + 你的岗位 + 你的资历”上的可用岗位密度和面试转化。购买前应抽查 30–50 个推荐岗位，而不是以宣传申请量作选择依据。

## 可复用组件与开源路线：10 项

| ID / 方案 | 已核对内容 | 复用判断 |
| --- | --- | --- |
| R09 [JobSpy](https://github.com/speedyapply/JobSpy) | Python 多招聘站职位采集库，MIT；输出结构化职位并记录失败/限流 | 适合作为补充采集研究；不是投递器。平台允许性、数据完整性与稳定性要独立评估，MVP 不依赖登录站抓取 |
| R10 [AIHawk 原地址](https://github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk) | 本次打开跳转到 `feder-cr/invisible_dots`，已经不是旧教程对应的原样项目 | 不直接作为项目地基；历史教程必须重新查版本与目标仓库 |
| R11 [AIHawk 社区版本](https://github.com/pillow34/aihawk) | README 描述 AI 个性化自动申请和资料配置 | 可研究资料/问题配置结构；未安装运行，维护状态、依赖、许可和当前站点兼容性需逐项复核 |
| R12 [Browser Use](https://github.com/browser-use/browser-use) | 浏览器 Agent 库、本地运行和托管服务路径 | 适合复杂表单探索与兜底；不是求职领域系统，事实校验、去重和回执仍需自建 |
| R13 [Skyvern](https://github.com/Skyvern-AI/skyvern) | LLM/视觉驱动浏览器工作流，仓库标记 AGPL-3.0 | 借鉴复杂表单处理；部署较重，产品化前专门评估许可证义务，不作为首版默认依赖 |
| R14 [Playwright](https://playwright.dev/docs/intro) | 浏览器自动化、测试与调试基础 | 用于明确页面结构下的可回放适配器；本身没有求职匹配和材料生成能力 |
| R15 [Stagehand](https://docs.stagehand.dev/v4/first-steps/introduction) | 支持确定性页面控制与 AI act/extract/observe 混用 | 与现有 JS 项目方向匹配；可作为受限兜底候选，不能把模型动作当成功证据 |
| R16 [Reactive Resume](https://github.com/Reactive-Resume/Reactive-Resume) | MIT，自托管简历编辑、导入导出及 API/MCP 等功能 | 可复用材料编辑/导出；首版也可只做固定简历模板，避免过早引入整套服务 |
| R17 [n8n](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) | 可复用工作流编排项目；许可应以仓库当前文件为准 | 适合低代码验证采集和摘要；不能替代复杂 ATS 适配。不是默认按 MIT 对待的依赖，向客户提供服务前复核具体用途 |
| R18 [Browserbase](https://docs.browserbase.com/welcome/introduction) | 提供浏览器会话、自动化和运行基础设施 | 云端运行时再评估；个人本地试验阶段不需要先购买云浏览器 |

## 岗位来源与平台约束：8 项

| ID / 来源 | 接入事实与限制 | 优先级 |
| --- | --- | --- |
| R19 [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html) | GET 公开职位不需认证；提交 POST 需要 Basic Auth 企业 API key；以企业 board token 定位 | P0，采集 + 官方申请页；不要把公开读接口误当公共写接口 |
| R20 [Lever Postings API](https://github.com/lever/postings-api) | 按企业 site 列出职位；申请 POST 带 API key，有 429 与限流说明；文档推荐托管申请表单 | P0，采集 + hosted apply URL；不是全网职位搜索接口 |
| R21 [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api) | 按 job board name 返回职位、isRemote、地点、applyUrl、可选薪资；isListed 可控制是否公开展示 | P0，读取公开 listed 职位；不混用需要企业权限的 `jobPosting.list` |
| R22 [Himalayas API](https://himalayas.app/api) | 可按国家、时区等搜索；支持分页；地点限制可能缺失，数据按日刷新；要求来源署名/回链，限制向其他聚合站分发 | P0，适合 remote 筛选。使用服务端调用并缓存；产品化再确认展示用途 |
| R23 [Remotive API](https://github.com/remotive-com/remote-jobs-api) | 公共职位有 24 小时延迟；建议最多每日 4 次；须署名回链，并限制再分发和以职位换注册 | P1，低频补充；不能作为“第一时间发现”的主来源 |
| R24 [Remote OK API](https://remoteok.com/api) | JSON 第一项为更新时间/条款元数据，后续才是职位；须来源署名和回链 | P1，解析时跳过元数据；地点缺失不等于全球可投，薪资 0 不视为真实 0 薪资 |
| R25 [We Work Remotely RSS](https://weworkremotely.com/remote-job-rss-feed) | 官方公开全量和分职业 RSS | P1，适合增量发现；资格和是否仍招聘要回原职位核验 |
| R26 [LinkedIn 自动化限制](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions) | 官方帮助明确禁止抓取或自动化站内活动的第三方工具类别 | MVP 使用用户提供的线索跳转公司招聘页，不把 LinkedIn 自动化作为地基 |

## 对架构的结论

1. **来源层和提交层必须分开。** 聚合板负责发现，企业招聘页负责核实和申请。ATS 的企业 API 凭据不是普通求职者天然拥有的能力。[Greenhouse](https://docs.greenhouse.io/job-board.html)、[Lever](https://github.com/lever/postings-api)
2. **需要企业目录。** Greenhouse/Lever/Ashby 都按企业招聘板查询，不会凭一个 API 调用发现全球公司。先从职位聚合源、用户目标公司清单建立目录，再维护 ATS 类型和 board 标识。
3. **资格判断单独建模。** remote、国家、时区、工作授权和雇佣方式不是一个布尔字段。Himalayas 的结构化限制字段能提供线索，但缺失值不能被推断为允许。[Himalayas](https://himalayas.app/api)
4. **采用确定性处理 + 受限 AI 的组合。** 去重、状态转移、额度与资格规则用代码；JD 抽取、经历选择和未知表单解释用模型。最终字段值都必须回读验证。这是本项目设计判断，不是厂商性能结论。
5. **先证明质量，再扩数量。** 首轮比较同一画像下的候选岗位质量、每份申请耗时、材料错误和回执完整性；面试率需要更长观察期。

## 仍需实测的事项

- 用户目标方向在各来源每周有多少“可申请”的独立岗位。
- ATS 地域、动态问题、上传组件、登录与 CAPTCHA 的真实分布。
- 商业产品是否准确处理候选人的居住地、工作授权和合同偏好。
- 自建适配器维护成本与商用品节省时间之间的差额。
- 具体依赖版本、许可证文件与数据源条款在集成日是否变化。

不对论坛个案、厂商统计、GitHub 星数推导成功率。本次未进行招聘方联系、邮箱发送或实际投递。
