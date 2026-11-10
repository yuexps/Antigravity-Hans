(() => {
  if (typeof window === 'undefined') return;
  const fingerprint = window.__antigravityZhPatchRequestedFingerprint || 'app-2.29.0-20261110-r4';
  if (window.__antigravityZhPatchInstalled === true && window.__observedDocument === document && window.__antigravityZhPatchFingerprint === fingerprint) return;
  const updating = window.__antigravityZhPatchInstalled === true && window.__observedDocument === document;
  if (typeof window.__antigravityZhPatchCleanup === 'function') window.__antigravityZhPatchCleanup();
  window.__antigravityZhPatchInstalled = true;
  window.__observedDocument = document;
  window.__antigravityZhPatchFingerprint = fingerprint;
  let observer;
  let cancelled = false;
  let flushScheduler;
  let removeToggleUI = null;
  window.__antigravityZhPatchCleanup = () => {
    cancelled = true;
    observer?.disconnect();
    window.removeEventListener('DOMContentLoaded', run);
    flushScheduler?.cancel();
    removeToggleUI?.();
  };

  // ===== 中英切换：记录每个被改写节点的原文，切回英文时按原样还原 =====
  // WeakMap 挂在 window 上，词库热更新后新实例仍能还原旧实例翻译过的节点。
  const LANG_KEY = 'antigravityHansLang';
  const POS_KEY = 'antigravityHansTogglePos';
  const originals = window.__antigravityZhOriginals ||
    (window.__antigravityZhOriginals = { texts: new WeakMap(), attrs: new WeakMap() });
  let lang = 'zh';
  try { if (window.localStorage?.getItem(LANG_KEY) === 'en') lang = 'en'; } catch (_e) { /* data: 页面无 localStorage */ }
  let originalDocLang = null;

  // 自定义翻译名单（由启动器从 custom-translations.txt 注入）：[[原文, 译文], ...]
  // 整段文本与原文一致（忽略大小写和首尾空白）时优先使用；译文为空表示保留英文原文。
  const customTranslations = new Map();
  const customOutputs = new Set(); // 自定义译文本身不再被二次翻译（观察器会重处理写入的文本）
  for (const item of Array.isArray(window.__antigravityZhCustom) ? window.__antigravityZhCustom : []) {
    if (!Array.isArray(item)) continue;
    const key = String(item[0] ?? '').trim().toLowerCase();
    const target = String(item[1] ?? '').trim();
    if (!key) continue;
    customTranslations.set(key, target);
    if (target) customOutputs.add(target);
  }

  // 写入译文并记录原文。若节点当前值不是上次写入的译文，说明应用自己更新了文本，以当前值为新原文。
  function writeText(node, value) {
    const prev = node.nodeValue;
    const record = originals.texts.get(node);
    if (record && record.zh === prev) record.zh = value;
    else originals.texts.set(node, { orig: prev, zh: value });
    node.nodeValue = value;
  }

  function writeAttr(element, name, value) {
    const prev = element.getAttribute(name);
    let map = originals.attrs.get(element);
    if (!map) originals.attrs.set(element, (map = new Map()));
    const record = map.get(name);
    if (record && record.zh === prev) record.zh = value;
    else map.set(name, { orig: prev, zh: value });
    element.setAttribute(name, value);
  }

  function restoreOriginals() {
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = originals.texts.get(node);
      if (text) {
        // 仅还原仍是本脚本译文的节点；已被应用改写的内容保持不动
        if (node.nodeValue === text.zh) node.nodeValue = text.orig;
        originals.texts.delete(node);
      }
      const attrs = originals.attrs.get(node);
      if (attrs) {
        for (const [name, record] of attrs) {
          if (node.getAttribute(name) === record.zh) node.setAttribute(name, record.orig);
        }
        originals.attrs.delete(node);
      }
      node.__zh_patched = false;
    }
  }

  const phrases = new Map([
    ["Teamwork Graph CLI is Atlassian's agent-first interface to your entire work context: Jira issues, Confluence pages, Bitbucket PRs, along with your connected third-party data sources. Purpose-built for coding agents like Antigravity (terminal or desktop), and powered by Atlassian's context graph. Try: \"draft a Jira issue from this PR and link it to the epic.\" Run /twg-setup after install to connect Atlassian Teamwork Graph CLI to Antigravity.", "Teamwork Graph CLI 是 Atlassian 面向智能体的工作上下文接口，可访问 Jira 问题、Confluence 页面、Bitbucket 拉取请求和已连接的第三方数据源。它基于 Atlassian 上下文图谱，专为 Antigravity 等终端或桌面编程智能体构建。试着说：“根据此拉取请求起草 Jira 问题并将其关联到史诗任务。”安装后运行 /twg-setup，将 Atlassian Teamwork Graph CLI 连接到 Antigravity。"],
    ['Provides a comprehensive guide, quick reference, and sitemap for Google Antigravity (AGY), including the Antigravity CLI (agy), Antigravity 2.0, Antigravity IDE, Python SDK, slash commands, keybindings, and customizations (skills, rules, MCP, sidecars). Activate this skill when the user asks questions about how to use, configure, or customize Antigravity, AGY, the agy CLI, the Antigravity IDE, or Antigravity 2.0.', '提供 Google Antigravity (AGY) 的全面指南、快速参考与站点地图，包括 Antigravity CLI (agy)、Antigravity 2.0、Antigravity IDE、Python SDK、斜杠命令、快捷键及自定义项（技能、规则、MCP、Sidecar）。当用户询问如何使用、配置或自定义 Antigravity、AGY、agy CLI、Antigravity IDE 或 Antigravity 2.0 时激活此技能。'],
    ['Within each group, models share a weekly limit and a 5-hour limit. Quota is consumed proportionally to the cost of the tokens. Thus, limits will last longer with shorter tasks or using more cost-effective models. The 5-hour limit smooths out aggregate demand to fairly distribute global capacity across all users, while your weekly limit is tied directly to your individual tier.', '在每个分组中，模型共享每周限额和 5 小时限额。额度的消耗与 Token 的成本成比例。因此，使用较短的任务或更具性价比的模型可以让限额维持更久。5 小时限额平滑了总体需求，以便在所有用户之间公平地分配全局容量，而您的每周限额则直接与您的个人套餐等级挂钩。'],
    ['Allow the agent to automatically view and edit files outside the current workspace. Use with caution: this gives the agent access to additional potentially-relevant information, but also allows the agent to access credential files, secrets, and other files outside of the workspace that could be targeted in prompt injection attacks or other exploits by malicious actors.', '允许智能体自动查看和编辑当前工作区之外的文件。请谨慎使用：这会让智能体访问更多可能相关的信息，但也会允许其访问凭据文件、机密以及工作区外的其他文件，这些文件可能成为提示词注入攻击或其他恶意利用的目标。'],
    ['When enabled, Agent can use browser tools to open URLs, read web pages, and interact with browser content. This allows the Agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.', '启用后，智能体可以使用浏览器工具打开 URL、读取网页并与浏览器内容交互。这能让智能体获取重要知识和验证方式，但任何浏览器集成都可能增加遭受外部恶意利用的风险。'],
    ['Give each Best of N fork its own clone of your Git repository instead of a copy-on-write overlay. Each fork is then a real repository, so commits it makes are kept when you choose it as the winner. Forks take longer to create, and the wait grows with the size of your repository. See go/jetski-best-of-n.', '为每个 Best of N 分支提供独立的 Git 仓库克隆，而非写时复制叠加层。每个分支都是真实仓库，因此在您将其选为优胜方案后会保留其提交记录。创建分支耗时更长，且等待时间随仓库体积增加。'],
    ['Let the agent use browser tools to open URLs, read web pages, and interact with browser content. This gives the agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.', '允许智能体使用浏览器工具打开 URL、读取网页并与浏览器内容交互。这能让智能体获取重要知识和验证方式，但任何浏览器集成都可能增加遭受外部恶意利用的风险。'],
    ['When enabled, your UI will be slightly modified to ensure more consistent demos. This is only recommended for demo purposes. In most cases, you can run "Antigravity: Start Demo Mode" and "Antigravity: Stop Demo Mode" to control this switch and update your ~/.gemini/antigravity data directory.', '启用后，您的界面将稍作修改以确保演示的一致性。仅建议用于演示目的。在大多数情况下，您可以运行 “Antigravity: Start Demo Mode” 和 “Antigravity: Stop Demo Mode” 来控制此开关并更新您的 ~/.gemini/antigravity 数据目录。'],
    ["Google does not control the availability or functionality of third party developer tools. Your data from third party developer tools connected to your Antigravity instance may be shared with Google. Google will protect any such data in accordance with the Google Privacy Policy, found here:", "Google 无法控制第三方开发工具的可用性或功能。连接到您的 Antigravity 实例的第三方开发工具中的数据可能会与 Google 共享。Google 将按照以下 Google 隐私权政策保护此类数据："],
    ['The agent never asks for confirmation before executing terminal commands (except those in the Deny list). This provides the agent with the maximum ability to operate over long periods without intervention, but also has the highest risk of the agent executing an unsafe terminal command.', '智能体在执行终端命令前从不请求确认（拒绝列表中的命令除外）。这能让智能体在无需干预的情况下最大程度地长时间自主运行，但也具有执行不安全终端命令的最高风险。'],
    ['Agent auto-executes commands matched by an allow list entry. For Unix shells, an allow list entry matches a command if its space-separated tokens form a prefix of the command\'s tokens. For PowerShell, the entry tokens may match any contiguous subsequence of the command tokens.', '智能体将自动执行与允许列表条目匹配的命令。对于 Unix Shell，如果允许列表条目的空格分隔令牌是该命令令牌的前缀，则匹配。对于 PowerShell，条目令牌可匹配命令令牌的任意连续子序列。'],
    ['Give each Best of N fork a full clone of your workspace, including its local commit history. Choosing a winner then gives your workspace that fork\'s state, so the commits it made are kept. Forks take longer to create than the default CitC clone. See go/jetski-best-of-n.', '为每个 Best of N 分支提供包含本地提交历史的完整工作区克隆。选出优胜方案后，工作区将采用该分支的状态并保留其提交记录。创建耗时比默认 CitC 克隆更长。'],
    ['Slightly modify your UI to ensure more consistent demos. This is only recommended for demo purposes. In most cases, you can run "Antigravity: Start Demo Mode" and "Antigravity: Stop Demo Mode" to control this switch and update your ~/.gemini/antigravity data directory.', '微调界面以确保演示效果更加一致。仅建议用于演示目的。大多数情况下，您可以运行“Antigravity: Start Demo Mode”和“Antigravity: Stop Demo Mode”来控制此开关并更新 ~/.gemini/antigravity 数据目录。'],
    ['Comprehensive guide and reference for the Antigravity Customization System. Use to explain how customizations work, their loading priority, discovery mechanisms, and to guide the creation of skills, rules, plugins, hooks, and MCP servers.', 'Google Antigravity 自定义系统的全面指南与参考。用于解释自定义项的工作原理、加载优先级、发现机制，并指导技能、规则、插件、钩子及 MCP 服务器的创建。'],
    ["Give your AI agent 600,000+ real app screens, and the skills to use them. Includes the Mobbin MCP and a skill that redesigns your screen from patterns real apps ship, in your own design system, with the references behind every change.", "为人工智能智能体提供超过 60 万个真实应用界面及使用这些界面的技能。包含 Mobbin MCP 和一项技能，可根据真实应用采用的模式，使用您自己的设计系统重新设计界面，并提供每项更改的参考依据。"],
    ['Show a floating notification card when background conversations need your input. Answer questions, approve commands, and grant permissions without leaving your current conversation. Share feedback at go/inline-actions-feedback.', '当后台对话需要您输入时显示浮动通知卡片。无需离开当前对话即可回答问题、批准命令和授予权限。可在 go/inline-actions-feedback 分享反馈。'],
    ["Accept payments and grow your business. Stripe's official MCP server enables AI agents to manage customers, products, prices, payment links, invoices, subscriptions, and refunds, as well as search Stripe documentation.", "接受付款并拓展业务。Stripe 官方 MCP 服务器支持人工智能智能体管理客户、产品、价格、付款链接、发票、订阅和退款，并搜索 Stripe 文档。"],
    ['The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.', '下方明细显示规则、技能和 MCP 等自定义项的 Token 使用量。超出预算时，大型规则会降级为路径指针，大型自定义项会被自动排除。'],
    ['When toggled on, Antigravity IDE will use your AI credits to fulfill model requests once you\'re out of model quota. Antigravity IDE will always use your model quota first before using AI credits.', '开启后，当模型额度用完时，Antigravity IDE 将使用 AI 积分完成模型请求。Antigravity IDE 始终会先使用模型额度，再使用 AI 积分。'],
    ['Agent asks for permission before executing commands matched by a deny list entry. The deny list follows the same matching rules as the allow list and takes precedence over the allow list.', '在执行与拒绝列表条目匹配的命令前，智能体会先请求权限。拒绝列表遵循与允许列表相同的匹配规则，且优先级高于允许列表。'],
    ['When toggled on, Antigravity will use your AI credits to fulfill model requests once you\'re out of model quota. Antigravity will always use your model quota first before using AI credits.', '开启后，当模型额度用完时，Antigravity 将使用 AI 积分完成模型请求。Antigravity 始终会先使用模型额度，再使用 AI 积分。'],
    ['Try out early-stage features before they ship. These may be changed or removed at any time. These features are experimental, and we make no guarantees about performance or functionality.', '在正式发布前试用早期功能。这些功能可能随时更改或移除，属于实验性质，我们不对其性能或功能作任何保证。'],
    ['Enforce settings that prevent the agent from autonomously running targeted exploits and require human review for all agent actions. Visit antigravity.google/docs/strict-mode for details.', '强制启用安全设置，防止智能体自主运行针对性利用程序，并要求所有智能体操作均经过人工审核。'],
    ['View your available model quota and AI credits. Model quota refreshes periodically based on your plan. Enable AI Credit Overages to continue using models when your quota is exhausted.', '查看可用的模型额度和 AI 积分。模型额度会根据你的计划定期刷新。启用 AI 积分超额使用后，可在额度耗尽时继续使用模型。'],
    ["Agent skills for Neo4j graph database — write Cypher queries, design graph models, use drivers, run imports, build GraphRAG pipelines, run GDS algorithms, and manage Aura instances.", "用于 Neo4j 图数据库的智能体技能：编写 Cypher 查询、设计图模型、使用驱动、导入数据、构建 GraphRAG 流程、运行 GDS 算法和管理 Aura 实例。"],
    ["Databricks skills for the CLI, Apps, Lakebase, Model Serving, Lakeflow Jobs, Spark Declarative Pipelines, Declarative Automation Bundles (DABs), and classic-to-serverless migration.", "适用于 Databricks 命令行、应用、Lakebase、模型服务、Lakeflow 作业、Spark 声明式流水线、声明式自动化包以及从经典架构迁移到无服务器架构的技能。"],
    ['Terminal commands automatically proceed inside the sandbox. A command that needs to leave the sandbox proceeds only if an agent judges it reversible, and otherwise requests review.', '终端命令会在沙盒内自动继续执行。需要脱离沙盒的命令仅在智能体判断其可逆时才会继续执行，否则会请求审核。'],
    ['Adds an Autonomous Mode switch to the modes dropdown below the input box. Turns sent with it on run non-interactively: the agent does not ask questions or request new permissions.', '在输入框下方的模式下拉菜单中添加“自主模式”开关。开启后发送的轮次将以非交互方式运行：智能体不会提问或请求新权限。'],
    ['Use the IDE\'s shell integration to detect and report terminal command execution. When disabled, the agent uses its own shell. Restart the application for this to take effect.', '使用 IDE 的 Shell 集成来检测并报告终端命令执行情况。禁用时，智能体将使用自带 Shell。重启应用后生效。'],
    ["Build applications with the Gemini Interactions API and Live API, including text, image, video, and speech generation, managed agents, and real-time multimodal streaming.", "使用 Gemini Interactions API 和 Live API 构建应用，支持文本、图像、视频和语音生成、托管智能体及实时多模态流。"],
    ['The agent never asks for review. This maximizes the autonomy of the agent, but also has the highest risk of the agent operating over unsafe or injected artifact content.', '智能体从不请求审核。这会最大程度提高智能体的自主性，但也具有因不安全或被注入恶意内容的产物而执行操作的最高风险。'],
    ['The breakdown below shows token usage from customizations like skills, rules, and MCP. If the budget is exceeded, large customizations will be truncated automatically.', '下面的明细展示技能、规则和 MCP 等自定义内容的 Token 使用量。如果超出预算，较大的自定义内容会被自动截断。'],
    ['Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content.', '智能体从不请求审核。这会最大程度提高智能体的自主性，但也具有因不安全或被注入恶意内容的产物而执行操作的最高风险。'],
    ["Connect Antigravity to your Notion workspace with the Notion MCP server, plus skills for research, documentation, meeting prep, specs, trackers, and project updates.", "通过 Notion MCP 服务器将 Antigravity 连接到 Notion 工作区，并使用研究、文档、会议准备、规格说明、跟踪和项目更新技能。"],
    ['Allow Tab to view and edit the files in .gitignore. Use with caution if your .gitignore lists files containing credentials, secrets, or other sensitive information.', '允许 Tab 键查看和编辑 .gitignore 中的文件。如果您的 .gitignore 列出了包含凭据、机密或其他敏感信息的文件，请谨慎使用。'],
    ['Orchestrates Android development tasks including project creation, deployment, SDK management, and environment diagnostics using the `android` command-line tool.', '使用 android 命令行工具协调 Android 开发任务，包括项目创建、部署、SDK 管理和环境诊断。'],
    ['Configure the browser subagent. It requires Google Chrome to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.', '配置浏览器子智能体。它需要安装 Google Chrome。你可以在对话输入框中输入 /browser 来调用浏览器子智能体。'],
    ["Connect Antigravity to Dropbox to search, inspect, summarize, share, collect uploads, organize folders, and clean up files with confirmation for write actions.", "将 Antigravity 连接到 Dropbox，以搜索、查看、总结和共享文件，收集上传内容并整理文件夹；写入操作需要确认。"],
    ["Deploy, configure, monitor, and troubleshoot apps, databases, and infrastructure on Railway from Antigravity with Railway's agent skill and hosted MCP server.", "通过 Railway 智能体技能和托管 MCP 服务器，在 Antigravity 中部署、配置、监控和排查 Railway 上的应用、数据库及基础设施。"],
    ['Free users and Google AI Plus users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.', '免费用户和 Google AI Plus 用户可获得 Antigravity 的最低基础额度。升级到 Google AI Pro 或更高版本可获得更高的速率限制。'],
    ['A permanent Chief of Staff conversation in the sidebar that manages your other conversations: delegate tasks, check status, and read results from one place.', '在侧边栏保留一个统筹助手对话，集中管理其他对话：分派任务、检查状态并查看结果。'],
    ["Investigate production issues with real Dynatrace data: problems and root causes, logs, metrics, traces, and vulnerabilities, via skills and the MCP server.", "通过技能和 MCP 服务器，使用真实 Dynatrace 数据调查生产问题，包括问题及根因、日志、指标、链路追踪和漏洞。"],
    ["Add Auth0 authentication to any app: login, MFA, SSO, Organizations, RBAC, custom domains, and branding. Debug auth errors and migrate from other providers.", "为应用添加 Auth0 身份验证，包括登录、多因素认证、单点登录、组织、基于角色的访问控制、自定义域名和品牌设置；排查身份验证错误并从其他提供商迁移。"],
    ["Build, publish, and manage WordPress.com and Jetpack-connected sites. Draft posts, edit blocks, check traffic stats, moderate comments, and manage plugins.", "构建、发布和管理 WordPress.com 及连接 Jetpack 的网站，起草文章、编辑区块、查看流量统计、审核评论并管理插件。"],
    ["Build and deploy on Netlify: functions, edge functions, blobs, database, identity, forms, image CDN, caching, and AI Gateway, plus the Netlify MCP server.", "在 Netlify 上构建和部署，使用函数、边缘函数、对象存储、数据库、身份、表单、图像 CDN、缓存、AI 网关及 Netlify MCP 服务器。"],
    ['Please describe the issue in detail. The more actionable your feedback, the quicker our team can address your request. Some helpful information includes:', '请详细描述问题。您的反馈越具体，我们的团队就能越快处理您的请求。一些有用的信息包括：'],
    ['When enabled, the agent will be able to access its knowledge base to inform its responses and automatically generate knowledge items in the background.', '启用后，智能体将能够访问其知识库以辅助生成回复，并在后台自动生成知识项。'],
    ["Use the official CrowdStrike-hosted MCP server to work across Falcon: detections, cases, threat intel, SIEM, hosts, vulnerabilities, cloud, and more.", "使用 CrowdStrike 官方托管的 MCP 服务器处理 Falcon 中的检测、案件、威胁情报、安全信息与事件管理、主机、漏洞和云资源等。"],
    ["SEO workflows on live Semrush data: keyword research, site audits, backlinks, competitor, traffic and market analytics, PPC, and AI brand visibility.", "基于实时 Semrush 数据执行搜索引擎优化工作流，包括关键词研究、网站审计、反向链接、竞争对手、流量和市场分析、按点击付费广告及人工智能品牌可见度。"],
    ["Search Intercom conversations, contacts, and companies, spot support trends, and install the Intercom Messenger with secure identity verification.", "搜索 Intercom 对话、联系人和公司，发现支持趋势，并安装具有安全身份验证的 Intercom Messenger。"],
    ['Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.', '当有新版本可用时，自动提示您重启应用。禁用后，您可以从应用菜单中手动检查更新。'],
    ["Up-to-date documentation lookup. Pull version-specific documentation and code examples directly from source repositories into your LLM context.", "查询最新文档，将指定版本的文档和代码示例直接从源代码仓库引入大语言模型上下文。"],
    ["Plan and track work in monday.com from Antigravity: create, update and assign items, write docs, and build forms that turn requests into items.", "在 Antigravity 中规划和跟踪 monday.com 工作：创建、更新及分配事项，编写文档，并创建将请求转为事项的表单。"],
    ["Specifies the agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.", '指定智能体请求审核产物时的行为。产物是智能体创建的文档，用于提供更丰富的对话体验。'],
    ["Build and deploy Base44 full-stack apps: CLI project management, JavaScript/TypeScript SDK development, and production troubleshooting skills.", "构建和部署 Base44 全栈应用，包括命令行项目管理、JavaScript/TypeScript SDK 开发和生产环境排查技能。"],
    ['Note: A change to this setting will only apply to new messages sent to the agent. In-progress responses will use the previous setting value.', '注意：对此设置的更改仅适用于发送给智能体的新消息。正在进行的回复仍使用之前的设置值。'],
    ["Give your agent a real browser: navigate, click, type, screenshot, and extract data from any site, locally or on Browserbase cloud browsers.", "为智能体提供真实浏览器，在本地或 Browserbase 云浏览器中导航、点击、输入、截图并提取网站数据。"],
    ['Changes the base URL for marketplace search results. You must restart Antigravity IDE to use the new marketplace after changing this value.', '更改插件市场搜索结果的基准 URL。更改此值后，您必须重启 Antigravity IDE 才能使用新的插件市场。'],
    ["Build and deploy web apps and AI agents on Vercel with skills for Next.js, AI SDK, and cloud services, plus the official Vercel MCP server.", "使用 Next.js、AI SDK 和云服务技能以及官方 Vercel MCP 服务器，在 Vercel 上构建和部署网页应用与人工智能智能体。"],
    ['Specifies Agent\'s behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.', '指定智能体在请求审核产物时的行为。产物是智能体创建的文档，用于提供更丰富的对话体验。'],
    ["The product development system for teams and agents. Manage issues, projects, and documents across your Linear workspace from Antigravity.", "面向团队和智能体的产品开发系统。在 Antigravity 中管理 Linear 工作区的问题、项目和文档。"],
    ['Note: A change to this setting will only apply to new messages sent to Agent. In-progress responses will use the previous setting value.', '注意：对此设置的更改将仅适用于发送给智能体的新消息。正在进行的回复将使用之前的设置值。'],
    ["Search and read your Wispr Flow meeting notes, transcripts, scratchpad notes, and calendar events. Read-only access to your own account.", "搜索和阅读 Wispr Flow 会议笔记、转录、草稿笔记和日历活动；仅对您自己的账户提供只读访问。"],
    ["Connect your agent to invideo's AI-native video editor. It trims, grades and mixes on a real timeline while you watch every change land.", "将智能体连接到 invideo 的人工智能视频编辑器，在真实时间线上剪辑、调色和混音，并实时查看每项更改。"],
    ['Changes the base URL for marketplace search results. You must restart Antigravity to use the new marketplace after changing this value.', '更改插件市场搜索结果的基准 URL。更改此值后，您必须重启 Antigravity 才能使用新的插件市场。'],
    ["Build Wix apps and headless sites, and manage Wix stores, bookings, CMS and more, with Wix CLI skills and the official Wix MCP server.", "使用 Wix CLI 技能和官方 Wix MCP 服务器构建 Wix 应用与无头网站，管理商店、预约和内容管理系统等。"],
    ["Create and send proposals, quotes, and contracts for e-signature. Track signing progress and identify documents that need follow-up.", "创建并发送提案、报价和合同以供电子签署，跟踪签署进度并找出需要跟进的文档。"],
    ['Changes the base URL on each extension page. You must restart Antigravity IDE to use the new marketplace after changing this value.', '更改每个插件页面的基准 URL。更改此值后，您必须重启 Antigravity IDE 才能使用新的插件市场。'],
    ["Manage your Bigin CRM from Antigravity: review pipelines, find contacts and deals, log calls, plan follow-ups, and email customers.", "在 Antigravity 中管理 Bigin 客户关系系统：查看销售流程，查找联系人和交易，记录通话，安排跟进并给客户发送邮件。"],
    ['Changes the base URL on each extension page. You must restart Antigravity to use the new marketplace after changing this value.', '更改每个插件页面的基准 URL。更改此值后，您必须重启 Antigravity 才能使用新的插件市场。'],
    ['Enable fine-grained GitHub permissions and define the org, repository, and resource-level access the agent is allowed to use.', '启用细粒度 GitHub 权限，并定义允许智能体使用的组织、仓库和资源级访问权限。'],
    ['When enabled, Agent is given awareness of lint errors created by its edits and may fix them without explicit user prompting.', '启用后，智能体将感知到其编辑所导致的 Lint 错误，并可在不明确提示用户的情况下进行修复。'],
    ["What should the agent do on each run? For example: summarize new bugs assigned to me and anything that changed overnight.", "智能体每次运行时应该做什么？例如：汇总分配给我的新错误和昨晚发生的变更。"],
    ["Turn Figma designs into production code, map components with Code Connect, and create or edit Figma files in Antigravity.", "将 Figma 设计转换为生产代码，使用 Code Connect 映射组件，并在 Antigravity 中创建或编辑 Figma 文件。"],
    ['Choose a predefined security preset for the agent. This controls terminal auto-execution policy, and file access policy.', '为智能体选择预设安全策略。它会控制终端自动执行策略和文件访问策略。'],
    ['No models are available for your current project or account. Please check your project settings and IAM permissions.', '当前项目或账户没有可用的模型。请检查您的项目设置和 IAM 权限。'],
    ['Custom path for the browser user profile directory. Leave empty for default (~/.gemini/antigravity-browser-profile).', '浏览器用户资料目录的自定义路径。留空则使用默认路径（~/.gemini/antigravity-browser-profile）。'],
    ['You currently don\'t have any MCP Servers installed. Add an MCP server above or add a custom one via the MCP Config.', '您当前还没有安装任何 MCP 服务器。请在上方添加 MCP 服务器，或通过 MCP 配置文件添加自定义服务器。'],
    ['Recommended: 64,000\u2013256,000 tokens. Actual compaction threshold may differ since max output tokens are subtracted.', '建议范围：64,000\u2013256,000 个 Token。由于会减去最大输出 Token 数，实际压缩阈值可能有所不同。'],
    ["Connect to your managed Looker MCP server to explore data, run saved Looks, build dashboards, and validate LookML.", "连接到托管的 Looker MCP 服务器，以探索数据、运行已保存的 Look、构建仪表盘并验证 LookML。"],
    ['The app will be accessible from the menu bar and will keep running in the background when all windows are closed.', '应用可从菜单栏访问，并会在所有窗口关闭后继续在后台运行。'],
    ['A nickname for identifying this application in the companion website. Changing this will restart the connection.', '用于在配套网站中标识此应用的昵称。更改此项将重新建立连接。'],
    ['When enabled, \'Explain and Fix\' actions will continue in the current conversation instead of starting a new one.', '启用后，“解释并修复”操作将在当前对话中继续，而不是开始新对话。'],
    ['Reliable automation, in-depth debugging, and performance analysis in Chrome using Chrome DevTools and Puppeteer', '使用 Chrome DevTools 和 Puppeteer 在 Chrome 中进行可靠的自动化、深度调试和性能分析'],
    ['We recommend attaching logs. Attaching logs will help the Antigravity team act on and prioritize your feedback.', '我们建议附上日志。附上日志将有助于 Antigravity 团队处理并优先解决您的反馈。'],
    ['When enabled, the Changes Overview toolbar will automatically expand when Agent finishes generating a response.', '启用后，Changes Overview 工具栏将在智能体完成回复生成时自动展开。'],
    ["Prototype, build & run modern apps that users love with Firebase's backend, AI, and operational infrastructure.", "借助 Firebase 的后端、人工智能和运维基础设施，设计、构建和运行现代应用。"],
    ['Terminal command automatically proceeds if the command runs inside the sandbox. Otherwise, it requests review.', '如果终端命令在沙盒内运行，则会自动继续执行；否则会请求审核。'],
    ['A shell setup script run before every command the agent executes in this project. Overrides the global script.', '智能体在此项目中执行每条命令前运行的 Shell 初始化脚本，会覆盖全局脚本。'],
    ['Projects serve as your workspace where your agents work. Each project has its own file scope and permissions. ', '项目是智能体工作的工作区。每个项目都有自己的文件范围和权限。'],
    ['Autonomous mode active: the agent works independently and does not ask questions or request new permissions.', '自主模式已开启：智能体将独立工作，不会提问或请求新权限。'],
    ['The agent always asks for confirmation before executing terminal commands (except those in the Allow list).', '智能体在执行终端命令前始终请求确认（允许列表中的命令除外）。'],
    ['Give the agent awareness of lint errors created by its edits so it can fix them without explicit prompting.', '让智能体感知编辑引入的 Lint 错误，以便无需额外提示即可修复。'],
    ['Agents run in a secure sandbox that restricts access to external resources outside of your trusted folders.', '智能体会在安全沙盒中运行，限制其访问受信任文件夹之外的外部资源。'],
    ['Prototype, build & run modern apps users love with Firebase\'s backend, AI, and operational infrastructure.', '利用 Firebase 的后端、AI 和运营基础设施，原型设计、构建和运行深受用户喜爱的现代应用。'],
    ['Terminal commands always require review and the agent cannot access files outside of its given workspaces.', '终端命令始终需要审核，且智能体无法访问其给定工作区之外的文件。'],
    ['Select the workspace type that will be used for new conversations started with the New Workspace option.', '选择通过“新建工作区”选项开始新对话时使用的工作区类型。'],
    ['AI Credits are used when you\'ve exceeded your model quota. Keep track of your current AI Credits in the', '当模型额度用尽时将使用 AI 积分。您可以在以下位置查看当前 AI 积分：'],
    ['The agent works with autonomy-enhancing features and does not ask questions or request new permissions.', '智能体使用自主增强功能运行，不会提问或请求新权限。'],
    ['Developer-only tools. These settings are stored locally in this browser and do not affect other users.', '仅限开发者工具。这些设置保存在当前浏览器本地，不会影响其他用户。'],
    ['to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.', '安装 Google Chrome。您可以在对话输入框中输入 /browser 来调用浏览器子智能体。'],
    ['VCS used when creating a new workspace, including workspaces generated based off your initial prompt.', '创建新工作区（包括根据初始提示词生成的工作区）时使用的 VCS。'],
    ['When enabled, Agent will use IDE\'s shell integration to detect and report terminal command execution.', '启用后，智能体将使用 IDE 的 Shell 集成来检测并报告终端命令的执行。'],
    ['When enabled, Agent will show browser notifications when user action is needed or execution finishes.', '启用后，当需要用户操作或执行完成时，智能体将显示浏览器通知。'],
    ['When toggled on, Antigravity IDE collects usage data to help Google enhance performance and features.', '开启后，Antigravity IDE 将收集使用数据，以帮助 Google 提升性能和功能。'],
    ['Run the app against a Linux environment. Connecting relaunches the app into the selected WSL distro.', '在 Linux 环境中运行应用。连接后会将应用重启到所选的 WSL 发行版。'],
    ['Keep the app accessible from the menu bar and running in the background when all windows are closed.', '在所有窗口关闭后，保持应用可从菜单栏访问并在后台继续运行。'],
    ['Continue your work from another device with Remote Control. Scan the QR code or open the link below.', '通过远程控制在其他设备上继续工作。请扫描二维码或打开下方链接。'],
    ['Modify scoped permissions, folders, and agent settings like Sandbox and Terminal Command Execution.', '修改作用域权限、文件夹，以及沙盒和终端命令执行等智能体设置。'],
    ['Requires manual review for all terminal commands and file accesses outside of the working folders.', '对于所有工作文件夹之外的终端命令和文件访问，都需要手动审核。'],
    ['When toggled on, Antigravity collects usage data to help Google enhance performance and features.', '开启后，Antigravity 会收集使用数据，帮助 Google 改进性能和功能。'],
    ['This conversation grew too large, so the history before this point may be missing or incomplete.', '此对话内容过长，因此该节点之前的历史记录可能缺失或不完整。'],
    ['Automatically expand the Changes Overview toolbar when the agent finishes generating a response.', '智能体完成回复生成时，自动展开更改概览工具栏。'],
    ['Select one of the three options. Agent settings and permissions can be further customized below.', '选择以下三个选项之一。智能体设置和权限可在下方进一步自定义。'],
    ["Payments, CRM, accounting, data, identity, customer support, marketing, and workflow automation.", "支付、客户关系管理、会计、数据、身份、客户支持、营销和工作流自动化。"],
    ['This conversation is also open in another app. Sending messages from both may cause conflicts.', '此对话同时在另一个应用中打开。从两端发送消息可能会导致冲突。'],
    ['These allowed domain rules are set by your organization\'s administrator and cannot be removed.', '这些允许的域名规则由您所在组织的管理员设置，无法移除。'],
    ["Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here.", "按计划运行提示词，例如每天早晨汇总昨天的更改。运行记录会显示在这里。"],
    ['Opens in the in-app preview pane. Some sites don\'t support iframe embedding and may not load.', '在应用内预览窗格中打开。部分网站不支持内嵌框架，可能无法加载。'],
    ['Continue "Explain and Fix" actions in the current conversation instead of starting a new one.', '在当前对话中继续执行“解释并修复”操作，而不是开启新对话。'],
    ['All terminal commands require review. The agent can read or write to any file in the machine.', '所有终端命令均需要审核。智能体可以读取或写入电脑上的任何文件。'],
    ['Confirm the command is safe to run outside of the sandbox with full network and disk access.', '确认该命令可在沙盒外安全运行，并拥有完整网络和磁盘访问权限。'],
    ['Workflows are saved prompts that Agent can follow. To trigger a workflow, type "/" in Agent.', '工作流是智能体可以遵循的已保存提示词。要触发工作流，请在智能体中输入“/”。'],
    ["Build on Google's developer platforms, including Android, Chrome, Gemini, and Google Cloud.", "基于 Google 开发平台构建应用，包括 Android、Chrome、Gemini 和 Google Cloud。"],
    ['Port number for Chrome DevTools Protocol remote debugging. Leave empty for default (9222).', 'Chrome DevTools Protocol 远程调试端口号。留空则使用默认值（9222）。'],
    ['Try out early-stage features before they ship. These may change or be removed at any time.', '在正式发布前试用早期功能。这些功能可能随时更改或移除。'],
    ['When enabled, the agent will be able to access past conversations to inform its responses.', '启用后，智能体将能够访问历史对话以辅助其生成回复。'],
    ['Controls whether the agent can run custom JavaScript to automate complex browser actions.', '控制智能体是否可以运行自定义 JavaScript 来自动化复杂浏览器操作。'],
    ['A label for this computer when you connect from another device. Changing it reconnects.', '从其他设备连接时用于标识此电脑的名称。更改后将重新连接。'],
    ['When enabled, the agent will include default customizations, including default skills.', '启用后，智能体将包含默认自定义项（包括默认技能）。'],
    ['Choose whether to be notified when the agent needs your attention or completes a task.', '选择是否在智能体需要您关注或完成任务时收到通知。'],
    ['When enabled, Antigravity will play a sound when Agent finishes generating a response.', '启用后，Antigravity 会在智能体完成回复生成时播放提示音。'],
    ["Create, edit, review, resize, and brand-check Canva designs with the Canva MCP server.", "使用 Canva MCP 服务器创建、编辑、审阅和调整 Canva 设计，并检查品牌一致性。"],
    ['The agent asks for permission before executing commands matched by a deny list entry.', '智能体在执行匹配拒绝列表条目的命令前，会先请求权限。'],
    ['The browser subagent can be invoked by typing /browser in the conversation input box.', '你可以在对话输入框中输入 /browser 来调用浏览器子智能体。'],
    ['Receive product updates, tips, and promotions from Google Antigravity IDE via email.', '通过电子邮件接收来自 Google Antigravity IDE 的产品更新、技巧和促销活动。'],
    ['Allow Gemini to notify you when the agent needs your attention or completes a task.', '允许 Gemini 在智能体需要您关注或完成任务时向您发送通知。'],
    ['Predict the location of your next edit and navigates you there with a tab keypress.', '预测您下一次编辑的位置，并在按下 Tab 键时导航至该处。'],
    ['Predict the location of your next edit and navigate you there with a tab keypress.', '预测您下一次编辑的位置，并在按下 Tab 键时导航至该处。'],
    ['To modify notification settings, open your operating system\'s system preferences.', '要修改通知设置，请打开操作系统的系统设置。'],
    ["Connect to Google Workspace, including Docs, Sheets, Slides, Drive, and Calendar.", "连接 Google Workspace，包括文档、表格、演示文稿、云端硬盘和日历。"],
    ['Are you sure you want to delete this conversation? This action cannot be undone.', '确定要删除此对话吗？此操作无法撤销。'],
    ['Receive product updates, tips, and promotions from Google Antigravity via email.', '通过电子邮件接收 Google Antigravity 的产品更新、技巧和促销信息。'],
    ['Configures how the agent tries to access files outside of its working folders.', '配置智能体如何访问工作文件夹之外的文件。'],
    ['You can upgrade to a Google AI Ultra plan to receive the highest rate limits.', '你可以升级到 Google AI Ultra 套餐以获得最高速率限制。'],
    ['Allow reading workflow runs (list, view, watch) across the whole repository.', '允许读取整个仓库的工作流运行记录（列表、查看、监听）。'],
    ['Show browser notifications when your action is needed or execution finishes.', '需要你操作或执行结束时，显示浏览器通知。'],
    ['This conversation is not on disk. Delete it to remove it from your sidebar.', '此对话不在磁盘上。将其删除即可从侧边栏移除。'],
    ['Show system notifications when your action is needed or the agent finishes.', '当需要您操作或智能体完成时显示系统通知。'],
    ['Check pending conversations in the last 3 days that require action from me.', '检查最近 3 天内需要我处理的待办对话。'],
    ['Use Add MCP to browse the store, or add a custom server via the MCP config.', '使用“添加 MCP”浏览商店，或通过 MCP 配置文件添加自定义服务器。'],
    ["Clear visited URLs and autocomplete suggestions from the built-in browser.", "清除内置浏览器中访问过的网址和自动补全建议。"],
    ['Setup may take over 5 minutes. Please keep this screen open during setup.', '配置可能需要 5 分钟以上，请在此过程中保持此界面打开。'],
    ['Google3 chats will be regrouped into their workspaces in the sidebar. See', 'Google3 聊天将在侧边栏中重新按其工作区分组。请参阅'],
    ["Plan work, track issues, sign documents, and manage your notes and files.", "规划工作、跟踪问题、签署文档并管理笔记和文件。"],
    ["AI-powered code review and review-comment autofix, powered by CodeRabbit.", "由 CodeRabbit 提供支持的人工智能代码审查和审查意见自动修复。"],
    ['Toggle if a confirmation is shown when using the "Reload Window" button.', '使用“重新加载窗口”按钮时是否显示确认提示。'],
    ['Configure workspace-specific permissions, resources, and customizations.', '配置工作区专属的权限、资源和自定义项。'],
    ['Controls whether terminal commands require your approval before running.', '控制终端命令运行前是否需要你的批准。'],
    ['Model must be available on the Gemini API and use the gemini-api scheme.', '模型必须可在 Gemini API 中使用，并使用 gemini-api 模式。'],
    ['options. Agent settings and permissions can be further customized below.', '项之一。智能体设置和权限可在下方进一步自定义。'],
    ['You can upgrade to a Google AI Ultra plan to receive higher rate limits.', '您可以升级到 Google AI Ultra 套餐以获得更高的速率限制。'],
    ['Path to the Chrome/Chromium executable. Leave empty for auto-detection.', 'Chrome/Chromium 可执行文件路径。留空则自动检测。'],
    ['VCS used when generating a new workspace based off your initial prompt.', '根据您的初始提示词生成新工作区时使用的 VCS。'],
    ['When enabled, sandboxed commands are allowed to make network requests.', '启用后，允许沙盒中的命令发起网络请求。'],
    ['Inherits from global settings. Local permissions have higher priority.', '继承全局设置。本地权限优先级更高。'],
    ['Jetski Chat configuration is not available in the current environment.', '当前环境中无法使用 Jetski Chat 配置。'],
    ['Open in current window, Continue conversation in the current workspace', '在当前窗口打开，并在当前工作区继续对话'],
    ['Sync newly created JJ worktrees to head when starting a conversation.', '开始对话时将新建的 JJ 工作树同步到最新提交。'],
    ['Agent settings and permissions for conversations outside of projects.', '为项目外对话配置智能体设置和权限。'],
    ['Configure a chat bot so you can use Jetski directly from Google Chat.', '配置聊天机器人，以便直接从 Google Chat 使用 Jetski。'],
    ['Google3 chats will be regrouped into their workspaces in the sidebar.', 'Google3 聊天将在侧边栏中重新按其工作区分组。'],
    ['Keep your coding agent up to date with the latest web best practices.', '让您的编码智能体始终与最新的 Web 最佳实践保持同步。'],
    ['The conversation could not be loaded because its data was not found.', '无法加载该对话，因为未找到其数据。'],
    ['Configure agent execution, queued message delivery, and permissions.', '配置智能体执行、排队消息发送以及权限。'],
    ["APIs, services, and tools to build, test, secure, and run your apps.", "用于构建、测试、保护和运行应用的 API、服务与工具。"],
    ['An error occurred while submitting your feedback. Please try again.', '提交反馈时出错，请重试。'],
    ['Save rule to always allow a one-time administrator (UAC) elevation?', '保存规则以始终允许一次性管理员 (UAC) 提权？'],
    ['Save rule to always allow running this command outside the sandbox?', '保存规则以始终允许在沙盒外运行此命令？'],
    ['Allows the agent to access files outside of your current workspace.', '允许智能体访问当前工作区之外的文件。'],
    ['External tools the agent can invoke via the Model Context Protocol.', '智能体可通过模型上下文协议 (MCP) 调用的外部工具。'],
    ["Configure what the agent can do in local and remote conversations.", "配置智能体在本地和远程对话中可以执行的操作。"],
    ['To modify editor settings, open Settings within the editor window.', '要修改编辑器设置，请在编辑器窗口中打开设置。'],
    ['Scan the code to open this device in Remote Control, or copy link.', '扫描二维码以在远程控制中打开此设备，或复制链接。'],
    ['A shell setup script run before every command the agent executes.', '智能体执行每条命令前运行的 Shell 初始化脚本。'],
    ['Commands the agent can run outside the sandbox in this workspace.', '智能体在此工作区中可在沙盒外运行的命令。'],
    ['Show "Edit" and "Chat" buttons when selecting text in the editor.', '在编辑器中选择文本时显示“编辑”和“聊天”按钮。'],
    ["Folder where files downloaded in the built-in browser are saved.", "内置浏览器下载文件的保存文件夹。"],
    ['The conversation was compacted to fit within the context window.', '对话已压缩以适应上下文窗口。'],
    ['Ask a quick question without interrupting the main conversation.', '在不打断主对话的情况下快速提问。'],
    ['Replace the default browser right-click menu with quick actions.', '将默认浏览器右键菜单替换为快捷操作菜单。'],
    ['The agent auto-executes commands matched by an allow list entry.', '智能体会自动执行匹配允许列表条目的命令。'],
    ['Let the agent access past conversations to inform its responses.', '允许智能体参考历史对话来生成回复。'],
    ['Open files in the background if the agent creates or edits them', '智能体创建或编辑文件时，在后台打开这些文件'],
    ['Add an MCP server above or add a custom one via the MCP Config.', '在上方添加 MCP 服务器，或通过 MCP 配置添加自定义服务器。'],
    ['Agent settings and permissions can be further customized below.', '智能体设置和权限可在下方进一步自定义。'],
    ['Agents have full access to your machine and external resources.', '智能体可完整访问你的电脑和外部资源。'],
    ['Allow/deny agent write access to specific files or directories.', '允许或拒绝智能体写入指定文件或目录。'],
    ['Configure allowed and denied URLs for browser action execution.', '配置允许和拒绝浏览器执行操作的 URL。'],
    ['Configure tab completion, suggestions, and navigation behavior.', '配置 Tab 补全、建议和导航行为。'],
    ['Highlight newly inserted text after accepting a Tab completion.', '在接受 Tab 补全后高亮显示新插入的文本。'],
    ['Manage settings specific to Google CitC workspaces development.', '管理特定于 Google CitC 工作区开发的设置。'],
    ['Play a sound when your action is needed or the agent finishes.', '当需要您操作或智能体完成时播放提示音。'],
    ['Allow/deny agent read access to specific files or directories.', '允许或拒绝智能体读取指定文件或目录。'],
    ['Inherits your Global Permissions when working in this project.', '在此项目中工作时继承您的全局权限。'],
    ['Also includes Global Permissions when working in this project.', '在此项目中工作时还包括“全局权限”。'],
    ['Customize Agent to get a better, more personalized experience.', '自定义智能体，获得更好、更个性化的体验。'],
    ['Allow opening pull requests and grant access to specific PRs.', '允许创建拉取请求并授予对特定 PR 的访问权限。'],
    ['Credential expires in less than 1 week. Click to refresh TDAT', '凭据将在 1 周内过期。点击刷新 TDAT'],
    ['Browse and enable plugins from the Build With Google catalog.', '从 Build With Google 目录中浏览并启用插件。'],
    ['Configure allowed and denied paths for file reads and writes.', '配置允许和拒绝读写的文件路径。'],
    ['External tools the agent can call via Model Context Protocol.', '智能体可通过 Model Context Protocol 调用的外部工具。'],
    ['The agent will wait for you to install the browser extension.', '智能体会等待你安装浏览器扩展。'],
    ['This migration may mess up your settings, chats, and sidebar.', '此迁移可能会影响您的设置、聊天记录和侧边栏。'],
    ['This setting cannot be changed while strict mode is enabled.', '启用严格模式时无法更改此设置。'],
    ['Credential valid (> 1 week remaining). Click to refresh TDAT', '凭据有效（剩余超过 1 周）。点击刷新 TDAT'],
    ['Disables all safety barriers for maximal iteration velocity.', '禁用所有安全屏障，以获得最大的迭代速度。'],
    ['Prevent the computer from sleeping while the app is running.', '应用运行时防止电脑进入睡眠。'],
    ['Play a sound when the agent finishes generating a response.', '智能体完成回复生成时播放提示音。'],
    ['Allow/deny agent browser actuation access to specific URLs.', '允许或拒绝智能体对指定 URL 执行浏览器操作。'],
    ['Configure the agent\'s visual theme and display preferences.', '配置智能体的视觉主题与显示偏好。'],
    ['Manage how Best of N sets up the workspace its arms run in.', '管理 Best of N 如何配置其各分支运行所在的工作区。'],
    ['Open files in the background if Agent creates or edits them', '当智能体创建或编辑文件时，在后台打开这些文件'],
    ['Allow creating issues and grant access to specific issues.', '允许创建议题并授予对特定议题的访问权限。'],
    ['Terminal commands the agent can execute in this workspace.', '智能体在此工作区中可执行的终端命令。'],
    ['Restricts agent tools to a secure, isolated local sandbox.', '将智能体工具限制在安全隔离的本地沙盒中。'],
    ['Remote Control isn\'t active on this instance. Enable it in', '当前实例未启用远程控制。请在以下位置启用：'],
    ["Using the Google Antigravity Python SDK to build AI agents", "使用 Google Antigravity Python SDK 构建人工智能智能体"],
    ['Thank you! Your feedback has been submitted successfully.', '感谢您的反馈！您的反馈已成功提交。'],
    ['Allow/deny agent read access to specific URLs or domains.', '允许或拒绝智能体读取指定 URL 或域名。'],
    ['Configure global allowed and denied resource permissions.', '配置全局允许和拒绝的资源权限。'],
    ['Type / and select plan to have the agent generate a plan.', '输入 / 并选择 plan 让智能体生成计划。'],
    ["Configure link opening and built-in browser preferences.", "配置链接打开方式和内置浏览器偏好设置。"],
    ['Manage project folders, agent settings, and permissions.', '管理项目文件夹、智能体设置和权限。'],
    ['Select a model using the model selector in the input box', '使用输入框中的模型选择器选择模型'],
    ['Save rule to always allow executing actions on this URL?', '保存规则以始终允许在此 URL 上执行操作？'],
    ['Configure allowed and denied URLs for browser actuation.', '配置允许和拒绝浏览器执行操作的 URL。'],
    ['Core tools and knowledge required to develop for Android', '开发 Android 应用所需的核心工具与知识'],
    ['Type / and select plan to have the agent generate a plan', '输入 / 并选择 plan 让智能体生成计划'],
    ['Scan the code to open this device in Remote Control, or ', '扫描二维码以在远程控制中打开此设备，或 '],
    ['This subagent was killed and can no longer be messaged.', '此子智能体已终止，无法再向其发送消息。'],
    ['This project overrides your global permission settings.', '此项目覆盖了您的全局权限设置。'],
    ['Include default customizations, such as default skills.', '包含默认自定义项，例如默认技能。'],
    ['Allow/deny agent command execution outside the sandbox.', '允许或拒绝智能体在沙盒外执行命令。'],
    ['Manage your plan, credentials, and general preferences.', '管理你的套餐、凭据和通用偏好设置。'],
    ['Scan the code to open this device in Remote Control, or', '扫描二维码以在远程控制中打开此设备，或'],
    ["Access and clone GitHub repositories in remote projects", "在远程项目中访问和克隆 GitHub 仓库"],
    ['Allow full browser script execution without prompting.', '允许完整的浏览器脚本执行而无需提示。'],
    ['Configure the maximum width of the conversation panel.', '配置对话面板的最大宽度。'],
    ['for more information (this migration is experimental).', '了解更多信息（此迁移为实验性功能）。'],
    ['Sidebar after conversations are regrouped by workspace', '按工作区分组后的对话侧边栏'],
    ['URLs the agent can perform actions on via the browser.', '智能体可以通过浏览器执行操作的 URL。'],
    ['AI may make mistakes. Double-check all generated code.', 'AI 可能会出错，请仔细核对生成的代码。'],
    ["Choose how much detail is shown during a conversation.", "选择对话过程中显示的详细程度。"],
    ['This option is disabled while strict mode is enabled.', '启用严格模式时此选项已禁用。'],
    ['Choose between the Default and Project 4K experience.', '在默认体验与 Project 4K 体验之间选择。'],
    ['Manage your conversations from the companion website.', '从配套网站管理您的对话。'],
    ['Configure default behaviors, skills, and MCP servers.', '配置默认行为、技能和 MCP 服务器。'],
    ['Modify permissions for file, terminal, and MCP tools.', '修改文件、终端和 MCP 工具的权限。'],
    ["Deploy and host your apps, sites, and their backends.", "部署和托管应用、网站及其后端。"],
    ["Curated collection of agent skills for science tasks.", "精选的科学任务智能体技能集。"],
    ['View archived in the sidebar (Display options menu).', '可在侧边栏（显示选项菜单）中查看已归档内容。'],
    ['The full developer experience with code and tooling.', '包含代码与开发工具的完整开发者体验。'],
    ['Research, writing, and everyday tasks, without code.', '适用于研究、写作与日常任务（不含代码工具）。'],
    ['Save rule to always allow write access to this path?', '保存规则以始终允许写入此路径？'],
    ['Configure external tools via Model Context Protocol.', '配置通过 Model Context Protocol 使用的外部工具。'],
    ['Keyboard shortcuts for quick navigation and control.', '用于快速导航和控制的键盘快捷键。'],
    ['Configure hooks that run on agent lifecycle events.', '配置在智能体生命周期事件上运行的钩子。'],
    ['Save rule to always allow read access to this path?', '保存规则以始终允许读取此路径？'],
    ['Requesting a one-time administrator (UAC) elevation', '正在请求一次性管理员 (UAC) 提权'],
    ['Modify permissions for 文件, terminal, and MCP tools.', '修改文件、终端和 MCP 工具的权限。'],
    ['Whether the agent asks you to review its documents.', '智能体是否请求您审核其生成的文档。'],
    ['You currently don\'t have any MCP Servers installed.', '您当前还没有安装任何 MCP 服务器。'],
    ['Prompt for approval before running browser scripts.', '运行浏览器脚本前请求批准。'],
    ['Quickly add and update imports with a tab keypress.', '按下 Tab 键快速添加和更新导入。'],
    ['Search for MCP servers to add to your configuration', '搜索要添加到配置中的 MCP 服务器'],
    ['Using the Antigravity Python SDK to build AI agents', '使用 Antigravity Python SDK 构建 AI 智能体'],
    ['Exploring files, running commands, editing artifact', '正在探索文件、运行命令、编辑产物'],
    ['URLs the agent can read or open in this workspace.', '智能体在此工作区中可读取或打开的 URL。'],
    ['Configure the default width of markdown artifacts.', '配置 Markdown 产物的默认宽度。'],
    ['Save rule to always allow access to this resource?', '保存规则以始终允许访问此资源？'],
    ['? This will remove it from your MCP configuration.', '？这将把它从您的 MCP 配置中移除。'],
    ['Allow sandboxed commands to make network requests.', '允许沙盒中的命令发起网络请求。'],
    ['Configure editor-specific behaviors and shortcuts.', '配置编辑器特有的行为和快捷键。'],
    ['Paths the agent can modify inside this workspace.', '智能体在此工作区中可修改的路径。'],
    ['Timed out waiting for the update to be installed.', '等待安装更新超时。'],
    ['Display and preserve intermediate thinking steps.', '显示并保留中间思考步骤。'],
    ['New standalone conversation, outside of projects.', '新建独立对话，不属于任何项目。'],
    ["Choose where links open by default when clicked.", "选择点击链接时默认使用的浏览器。"],
    ['There may be agents or background tasks running.', '可能仍有智能体或后台任务正在运行。'],
    ['URLs the agent can actuate on in this workspace.', '智能体在此工作区中可执行操作的 URL。'],
    ['Files modified by the agent in this conversation', '智能体在此对话中修改的文件'],
    ['Run terminal commands with sandbox restrictions.', '在沙盒限制下运行终端命令。'],
    ['Display and preserve intermediate thinking steps', '显示并保留中间思考步骤'],
    ['Import feature is not available in this context.', '当前上下文中无法使用导入功能。'],
    ['Require review for all browser script execution.', '所有浏览器脚本执行都需要审核。'],
    ['URLs the agent can actuate on using the browser.', '智能体可通过浏览器执行操作的 URL。'],
    ["Uses your local files and tools. Schedules only.", "使用本地文件和工具，仅支持定时运行。"],
    ['Paths the agent can read inside this workspace.', '智能体在此工作区中可读取的路径。'],
    ['Absolute path to the Chrome/Chromium executable', 'Chrome 可执行文件的绝对路径'],
    ['Project 4K interface without developer tooling.', '不含开发者工具的 Project 4K 界面。'],
    ['Save rule to always allow running this command?', '保存规则以始终允许运行此命令？'],
    ['Allow a one-time administrator (UAC) elevation?', '允许一次性管理员 (UAC) 提权？'],
    ['Allow running this command outside the sandbox?', '允许在沙盒外运行此命令？'],
    ['Are you sure you want to delete this hook card?', '确定要删除此钩子卡片吗？'],
    ['Commands the agent can run outside the sandbox.', '智能体可在沙盒外运行的命令。'],
    ['Configure allowed commands outside the sandbox.', '配置允许在沙盒外运行的命令。'],
    ['Curated collection of agent skills for science.', '为科学领域精心挑选的智能体技能集合。'],
    ['Select light, dark, or inherit system settings.', '选择浅色、深色或继承系统设置。'],
    ['URLs the agent can read or open in the browser.', '智能体可以在浏览器中读取或打开的 URL。'],
    ["Controls permissions for remote conversations.", "控制远程对话的权限。"],
    ['Check availability, schedule events, and RSVP.', '查看空闲时间、安排活动并回复活动邀请。'],
    ['Save rule to always allow using this MCP tool?', '保存规则以始终允许使用此 MCP 工具？'],
    ['Configure allowed and denied URLs for reading.', '配置允许和拒绝读取的 URL。'],
    ['Continue conversation in the current workspace', '在当前工作区继续对话'],
    ['Automations do not inherit Global Permissions.', '自动化任务不继承全局权限。'],
    ['Any error messages seen when trying to log in', '尝试登录时看到的任何错误信息'],
    ['This setting is managed by your organization.', '此设置由您所在的组织管理。'],
    ['This option is disabled by your organization.', '此选项已被您所在的组织禁用。'],
    ['to ask for content changes for legal reasons.', '申请出于法律原因的内容变更。'],
    ['Choose the experience that fits how you work.', '选择适合您工作方式的体验模式。'],
    ['Are you sure you want to delete the workspace', '确定要删除工作区'],
    ['Are you sure you want to delete this handler?', '确定要删除此处理程序吗？'],
    ['? This removes it from your config directory.', '？这会将它从您的配置目录中移除。'],
    ['Agent needs permission to execute JavaScript', '智能体需要权限才能执行 JavaScript'],
    ['Conversation copied as Markdown to clipboard', '对话已作为 Markdown 复制到剪贴板'],
    ['Please list the steps to reproduce the issue', '请列出复现此问题的步骤'],
    ['Quickly add and update imports with Tab key.', '按下 Tab 键快速添加和更新导入。'],
    ['Search conversations (by name or Cascade ID)', '搜索对话（按名称或 Cascade ID）'],
    ['Save rule to always allow reading this URL?', '保存规则以始终允许读取此 URL？'],
    ['Manage fine-grained permissions for GitHub.', '管理 GitHub 的细粒度权限。'],
    ['No active terminals. Click + to create one.', '暂无活动终端。点击 + 创建一个。'],
    ['% of the customization budget is available.', '% 的自定义预算可用。'],
    ['broadcast Go Live, Click to run live server', '广播 Go Live，点击运行实时服务器'],
    ['Configure the browser subagent. It requires', '配置浏览器子智能体。它需要'],
    ['Configure when follow-up messages are sent.', '配置何时发送后续消息。'],
    ['No customizations found for this workspace.', '此工作区没有找到自定义内容。'],
    ['to back up your data and run the migration.', '备份数据并运行迁移。'],
    ['Work with local agents from another device.', '从其他设备连接并使用本地智能体。'],
    ["Input device for voice mode and dictation.", "语音模式和语音输入使用的设备。"],
    ['Search, upload, download, and share files.', '搜索、上传、下载和共享文件。'],
    ['Antigravity would like to use the browser.', 'Antigravity 想要使用浏览器。'],
    ['Confirmation required to execute this step', '执行此步骤需要确认'],
    ['Folder no longer exists or is unavailable.', '文件夹不再存在或不可用。'],
    ['Show suggestions when typing in the editor', '在编辑器中输入时显示建议'],
    ['Credential expired. Click to refresh TDAT', '凭据已过期。点击刷新 TDAT'],
    ['Allow Tab to access .gitignore exclusions', 'Tab 键访问 .gitignore 排除文件'],
    ['Ask anything, @ to mention, / for actions', '想问什么都可以，@ 引用，/ 执行动作'],
    ['Interrupt the agent and send immediately.', '打断智能体并立即发送。'],
    ['Organization Allowed Domains (Read-Only)', '组织允许的域名（只读）'],
    ['Controls the actions the agent can take.', '控制智能体可以执行的操作。'],
    ['Configure AI models and view your quota.', '配置 AI 模型并查看额度。'],
    ['Terminal commands the agent can execute.', '智能体可执行的终端命令。'],
    ["Explore other marketplace customizations", "探索市场中的其他自定义项"],
    ['Cancel questionnaire and stop the agent', '取消问卷并停止智能体'],
    ['Security agent decides if commands run.', '由安全智能体决定是否运行命令。'],
    ['Block all browser JavaScript execution.', '阻止所有浏览器 JavaScript 执行。'],
    ['Explain and Fix in Current Conversation', '在当前对话中解释并修复'],
    ['GCP Project ID for enterprise features.', '适用于企业级功能的 GCP 项目 ID。'],
    ['Local permissions have higher priority.', '本地权限优先级更高。'],
    ['Manually customize individual settings.', '手动自定义各项设置。'],
    ['Rules help guide the behavior of Agent.', '规则用于指导智能体的行为。'],
    ['Organization MCP Allowlist (Read-Only)', '组织 MCP 允许列表（只读）'],
    ['Run all commands without restrictions.', '无限制运行所有命令。'],
    ['Allow/deny specific terminal commands.', '允许或拒绝指定终端命令。'],
    ['Google Drive integration not available', 'Google 云端硬盘集成不可用'],
    ['No (tell the agent what to do instead)', '否（告诉智能体改做什么）'],
    ['Read, edit, and export presentations.', '阅读、编辑和导出演示文稿。'],
    ['Read, write, and format spreadsheets.', '读取、写入电子表格并设置格式。'],
    ['Automatically decide if commands run.', '自动判断是否运行命令。'],
    ['Open the agent panel on window reload', '窗口重新加载时打开智能体面板'],
    ['Include Jetski Default Customizations', '包含 Jetski 默认自定义项'],
    ['Manage your notification preferences.', '管理您的通知偏好设置。'],
    ['Outside of folders file access policy', '文件夹外访问策略'],
    ['Select where to open the conversation', '选择在哪里打开对话'],
    ['Allow executing actions on this URL?', '允许在此 URL 上执行操作？'],
    ['AI Credits Used to Generate Response', '已使用 AI 积分生成回复'],
    ['Scan the code to open this device in', '扫描二维码以在远程控制中打开此设备'],
    ['Configure allowed terminal commands.', '配置允许的终端命令。'],
    ['Manage your model quota and credits.', '管理您的模型额度与积分。'],
    ['Are you sure you want to delete the', '确定要删除'],
    ['Downloading the Antigravity binary…', '正在下载 Antigravity 程序…'],
    ['(tell the agent what to do instead)', '（告诉智能体改做什么）'],
    ['Browser Javascript Execution Policy', '浏览器 JavaScript 执行策略'],
    ['Browser JavaScript Execution Policy', '浏览器 JavaScript 执行策略'],
    ['By using this app, you agree to its', '使用本应用即表示你同意其'],
    ['Describe the bug you encountered...', '描述您遇到的错误...'],
    ['Enter command (e.g., git, blaze)...', '输入命令（例如 git、blaze）...'],
    ['Loading workspace customizations...', '正在加载工作区自定义项...'],
    ['Queue until after the current turn.', '排队直到当前轮次结束后发送。'],
    ['Set how fast Tab suggestions appear', '设置 Tab 建议的显示速度'],
    ['to have the agent generate a plan.', '让智能体生成计划。'],
    ['all commands without restrictions.', '无限制运行所有命令。'],
    ['Build with Antigravity IDE Plugins', '使用 Antigravity IDE 插件构建'],
    ['Search for files in the project...', '在项目中搜索文件...'],
    ["Design, creative, and media tools.", "设计、创意和媒体工具。"],
    ['The agent always asks for review.', '智能体始终请求审核。'],
    ['Use full VCS clones for Best of N', '为 Best of N 使用完整 VCS 克隆'],
    ['Use full Git clones for Best of N', '为 Best of N 使用完整 Git 克隆'],
    ['Click to learn more about sources', '点击了解更多关于来源的信息'],
    ['Configure GitHub access policies.', '配置 GitHub 访问策略。'],
    ['Why did you choose this response?', '您为什么选择此回复？'],
    ['Failed to Generate Commit Message', '生成提交说明失败'],
    ['to have the agent generate a plan', '让智能体生成计划'],
    ['扫描二维码以在此设备上打开 Remote Control, or ', '扫描二维码以在远程控制中打开此设备，或 '],
    ['all commands without restrictions', '无限制运行所有命令'],
    ['Initializing virtual environments', '正在初始化虚拟环境'],
    ['Open Agent panel on window reload', '窗口重新加载时打开智能体面板'],
    ["Productivity & Project Management", "效率与项目管理"],
    ["How loud Antigravity's voice is.", "调整 Antigravity 语音的音量。"],
    ['Connecting to language server...', '正在连接语言服务...'],
    ['Allow write access to this path?', '允许写入此路径？'],
    ['This command ran in the sandbox.', '此命令已在沙盒中运行。'],
    ['Toggle Between Light/Dark Themes', '切换浅色或深色主题'],
    ['Mark This Conversation as Unread', '将此对话标为未读'],
    ['扫描二维码以在此设备上打开 Remote Control, or', '扫描二维码以在远程控制中打开此设备，或'],
    ['扫描二维码以此设备上打开 Remote Control, or ', '扫描二维码以在远程控制中打开此设备，或 '],
    ['Every command requires approval.', '每条命令都需要审核。'],
    ['Ask before sensitive operations.', '执行敏感操作前先询问。'],
    ['Manage Antigravity app settings.', '管理 Antigravity 应用设置。'],
    ['Select one of the three options.', '选择以下三个选项之一。'],
    ['Set the speed of tab suggestions', '设置 Tab 建议的显示速度'],
    ['User cancelled agent execution.', '用户已取消智能体执行。'],
    ['Open search in external browser', '在外部浏览器中打开搜索'],
    ['Allow read access to this path?', '允许读取此路径？'],
    ['Set the volume of agent sounds.', '设置智能体提示音的音量。'],
    ['Folder has more than 1000 files', '文件夹包含超过 1000 个文件'],
    ['Are you sure you want to delete', '确定要删除'],
    ['? This action cannot be undone.', '？此操作无法撤销。'],
    ['Split Conversation Horizontally', '水平拆分对话'],
    ['扫描二维码以此设备上打开 Remote Control, or', '扫描二维码以在远程控制中打开此设备，或'],
    ['Agent Non-Workspace File Access', '智能体非工作区文件访问'],
    ['Enter file or directory path...', '输入文件或目录路径...'],
    ['Search by name or Cascade ID...', '按名称或 Cascade ID 搜索...'],
    ['Terminal Command Auto Execution', '终端命令自动执行'],
    ['Welcome to the new Antigravity!', '欢迎使用新版 Antigravity！'],
    ['Toggle Maximize Auxiliary Pane', '切换最大化辅助窗格'],
    ['Allow access to this resource?', '允许访问此资源？'],
    ['The full developer experience.', '完整的开发者体验。'],
    ['Are you sure you want to quit?', '确定要退出吗？'],
    ['Mark This Conversation as Read', '将此对话标为已读'],
    ['Enable Notifications for Agent', '启用智能体通知'],
    ['Attach a screenshot (optional)', '附上截图（可选）'],
    ['Attach Antigravity server logs', '附上 Antigravity 服务端日志'],
    ['Attach Antigravity Server Logs', '附上 Antigravity 服务端日志'],
    ['Enable notifications for Agent', '为智能体启用通知'],
    ['Getting started with a Project', '开始使用项目'],
    ['Refresh quota and credits data', '刷新额度和积分数据'],
    ['Terminal & Tooling Permissions', '终端与工具权限'],
    ["The voice used in Voice mode.", "语音模式使用的声音。"],
    ['See more in Build with Google', '查看“使用 Google 构建”中的更多内容'],
    ['Browser Actuation Permissions', '浏览器操作权限'],
    ['Requires manual confirmation.', '需要手动确认。'],
    ['Failed to rename conversation', '重命名对话失败'],
    ['Failed to delete conversation', '删除对话失败'],
    ['e.g. "My Custom Gemini Model"', '例如“我的自定义 Gemini 模型”'],
    ['Agent always asks for review.', '智能体始终请求审核。'],
    ['Split Conversation Vertically', '垂直拆分对话'],
    ['Agent terminated due to error', '智能体因错误而终止'],
    ['Enable Sandbox Mode (Preview)', '启用沙盒模式（预览）'],
    ['New Conversation in Workspace', '在工作区中新建对话'],
    ['Undo changes up to this point', '撤销到此处的更改'],
    ['Loading available plugins...', '正在加载可用插件...'],
    ['Share Conversation (Preview)', '分享对话（预览）'],
    ['Failed to start conversation', '启动对话失败'],
    ['Baseline model quota reached', '已达基础模型额度上限'],
    ['Better instruction following', '指令遵循更准确'],
    ['The other model hallucinated', '另一个模型出现了幻觉'],
    ['Sidebar grouped by workspace', '侧边栏已按工作区分组'],
    ['This page is going away soon', '此页面即将停用'],
    ['View archived in the sidebar', '在侧边栏查看已归档内容'],
    ['Restart Main Language Server', '重启主语言服务'],
    ['Select Previous Conversation', '选择上一个对话'],
    ['Previous match (Shift+Enter)', '上一个匹配项 (Shift+Enter)'],
    ['Allow List Terminal Commands', '终端命令允许列表'],
    ['Auto-Expand Changes Overview', '自动展开更改概览'],
    ['Download the Antigravity IDE', '下载 Antigravity IDE'],
    ['Enter tool name or server...', '输入工具名称或服务器...'],
    ['Manage application settings.', '管理应用设置。'],
    ['Select Model to Send Message', '选择用于发送消息的模型'],
    ['Steps to reproduce the issue', '重现此问题的步骤'],
    ['Read, draft, and edit docs.', '阅读、起草和编辑文档。'],
    ['Gemini 4 Argon Weekly Limit', 'Gemini 4 Argon 周额度'],
    ['Windows Subsystem for Linux', '适用于 Linux 的 Windows 子系统'],
    ['Automatic Check for Updates', '自动检查更新'],
    ['Terms of Service & Data Use', '服务条款与数据使用'],
    ['Failed to stop conversation', '停止对话失败'],
    ['Failed to fork conversation', '创建分支对话失败'],
    ['Max Tokens Until Compaction', '触发压缩的最大 Token 数'],
    ['Clearer writing & artifacts', '表述与产物更清晰'],
    ['Skills Configuration Error:', '技能配置错误：'],
    ['Toggle Environment Selector', '切换环境选择器'],
    ['Allow running this command?', '允许运行此命令？'],
    ['Confirm Browser Interaction', '确认浏览器交互'],
    ['Deny List Terminal Commands', '终端命令拒绝列表'],
    ['Enter avatar URL (optional)', '输入头像 URL（可选）'],
    ['Explore the new Antigravity', '探索新版 Antigravity'],
    ['Generate CitC Workspace VCS', '生成 CitC 工作区 VCS'],
    ['New Conversation in Project', '在项目中新建对话'],
    ['Paths the agent can modify.', '智能体可修改的路径。'],
    ["Show Remote Control QR code", "显示远程控制二维码"],
    ['Allow using this MCP tool?', '允许使用此 MCP 工具？'],
    ['No automations configured.', '尚未配置任何自动化。'],
    ['Open with External Browser', '使用外部浏览器打开'],
    ['Sidebar grouped by project', '侧边栏已按项目分组'],
    ['Administrator access (UAC)', '管理员权限 (UAC)'],
    ['Don\'t show this for 2 days', '2 天内不再显示'],
    ['No conversations available', '暂无可用对话'],
    ['Copy Conversation Markdown', '复制对话的 Markdown 内容'],
    ['Agent Auto-Fix Lint Errors', '智能体自动修复 Lint 错误'],
    ['Click to copy full command', '点击复制完整命令'],
    ['Copy conversation markdown', '复制对话 Markdown'],
    ['Copy full URL to clipboard', '复制完整 URL 到剪贴板'],
    ['Search MCP servers by name', '按名称搜索 MCP 服务器'],
    ["Cloud Hosting & Deployment", "云托管与部署"],
    ['Antigravity Starter Quota', 'Antigravity 起始配额'],
    ['Skills and Rules Settings', '技能与规则设置'],
    ['MCP Authentication Error:', 'MCP 身份验证错误：'],
    ['Sync JJ Worktrees to Head', '将 JJ 工作树同步到最新提交'],
    ['Other (write your answer)', '其他（输入您的回答）'],
    ['Something else (optional)', '其他原因（可选）'],
    ['Search conversations with', '点击左上角的'],
    ['Archive This Conversation', '归档此对话'],
    ['Archive this conversation', '归档此对话'],
    ['Browser User Profile Path', '浏览器用户资料路径'],
    ['Build With Google Plugins', '使用 Google 插件构建'],
    ['Built with Google Plugins', '使用 Google 插件构建'],
    ['Enable AI Credit Overages', '启用 AI 积分超额使用'],
    ['Enter bot name (optional)', '输入机器人名称（可选）'],
    ['Five Hour Limit Remaining', '剩余 5 小时限额'],
    ['Open Conversation History', '打开对话历史'],
    ['Paths the agent can read.', '智能体可读取的路径。'],
    ['Project validation failed', '项目验证失败'],
    ['Project-Specific Settings', '项目专属设置'],
    ['Select Python Interpreter', '选择 Python 解释器'],
    ['Toggle Agent (Ctrl+Alt+B)', '切换智能体 (Ctrl+Alt+B)'],
    ['Search Recent Workspaces', '搜索最近的工作区'],
    ['Updated sidebar grouping', '已更新侧边栏分组方式'],
    ['Default Cog Branch / Ref', '默认 Cog 分支 / 引用'],
    ['Notification Preferences', '通知偏好设置'],
    ['Open in external browser', '在外部浏览器中打开'],
    ['Open in Built-in Browser', '在内置浏览器中打开'],
    ['Discard unstaged changes', '放弃未暂存的更改'],
    ['Conversation unavailable', '对话不可用'],
    ['Search customizations...', '搜索自定义项...'],
    ['Select Next Conversation', '选择下一个对话'],
    ['Rename This Conversation', '重命名此对话'],
    ['Include unstaged changes', '包含未暂存的更改'],
    ['MCP Configuration Error:', 'MCP 配置错误：'],
    ['Complete Onboarding Step', '完成引导步骤'],
    ['Any relevant information', '任何相关信息'],
    ['Commands Outside Sandbox', '沙盒外命令'],
    ['Current sidebar grouping', '当前侧边栏分组方式'],
    ['Editor-Specific Settings', '编辑器专属设置'],
    ['Enable Shell Integration', '启用 Shell 集成'],
    ['Import AI Studio Project', '导入 AI Studio 项目'],
    ['Launching the browser...', '正在启动浏览器...'],
    ['No MCP servers installed', '未安装 MCP 服务器'],
    ['Open Conversation Picker', '打开对话选择器'],
    ['Project name. E.g. Tasks', '项目名称，例如 Tasks'],
    ['Workspace Command Access', '工作区命令访问'],
    ['Your Plan: Google AI Pro', '你的套餐：Google AI Pro'],
    ["Design, Creative & Media", "设计、创意与媒体"],
    ["Powered by Gemini Live.", "由 Gemini Live 提供支持。"],
    ['Allow reading this URL?', '允许读取此 URL？'],
    ['Markdown Artifact Width', 'Markdown 产物宽度'],
    ['Insufficient AI Credits', 'AI 积分不足'],
    ['Agent execution failed.', '智能体执行失败。'],
    ['Plugin Operation Error:', '插件操作错误：'],
    ['Toggle Project Selector', '切换项目选择器'],
    ['Customize Global Skills', '自定义全局技能'],
    ['Enable Terminal Sandbox', '启用终端沙盒'],
    ['Unpin This Conversation', '取消固定此对话'],
    ['Copy error to clipboard', '将错误复制到剪贴板'],
    ['Enable Demo Mode (Beta)', '启用演示模式（测试版）'],
    ['Advanced Command Access', '高级命令访问'],
    ['Automatic update checks', '自动检查更新'],
    ['Back to Scheduled Tasks', '返回定时任务'],
    ['Browser Actuation Rules', '浏览器操作规则'],
    ['Deny setting up browser', '拒绝设置浏览器'],
    ['Edit Conversation Title', '编辑对话标题'],
    ['Enable Sounds for Agent', '启用智能体提示音'],
    ['Marketplace Gallery URL', '插件市场列表 URL'],
    ['Open Keyboard Shortcuts', '打开键盘快捷键'],
    ['Open System Preferences', '打开系统设置'],
    ['Open Workspace Selector', '打开工作区选择器'],
    ['Queued Message Delivery', '排队消息发送'],
    ['Search conversations...', '搜索对话...'],
    ['Standalone Conversation', '独立对话'],
    ["Previous Side Panel Tab", "上一个侧边栏标签页"],
    ["Announcements and tips", "公告和提示"],
    ['Better solution & code', '方案与代码质量更好'],
    ['More thorough research', '调研更全面深入'],
    ['Default Cog Repository', '默认 Cog 仓库'],
    ['No conversations found', '未找到对话'],
    ['Cancel Sending Message', '取消发送消息'],
    ['Pick at most 2 reasons', '最多选择 2 个原因'],
    ['Default Customizations', '默认自定义项'],
    ['Open in Remote Control', '在远程控制中打开'],
    ['Artifact Review Policy', '产物审核策略'],
    ['Auto-Open Edited Files', '自动打开已编辑文件'],
    ['Background Task Output', '后台任务输出'],
    ['Copy the trajectory ID', '复制轨迹 ID'],
    ['Edit permission target', '编辑权限目标'],
    ['Highlight After Accept', '接受后高亮'],
    ['Loading MCP servers...', '正在加载 MCP 服务器...'],
    ['Loading token usage...', '正在加载 Token 用量...'],
    ['Marketplace Search URL', '插件市场列表 URL'],
    ['Model Context Protocol', '模型上下文协议 (MCP)'],
    ['My Custom Gemini Model', '我的自定义 Gemini 模型'],
    ['No more older messages', '没有更早的消息了'],
    ['Open Browser (Preview)', '打开浏览器 (预览)'],
    ['Opening URL in Browser', '正在浏览器中打开 URL'],
    ['quota and credits data', '额度和积分数据'],
    ['Search across files...', '跨文件搜索...'],
    ['Show Selection Actions', '显示选择操作'],
    ['Toggle Developer Tools', '切换开发者工具'],
    ['Toggle Voice Recording', '切换语音录制'],
    ['Weekly Limit Remaining', '剩余周额度'],
    ['Antigravity - Settings', 'Antigravity - 设置'],
    ["Move Conversation Down", "下移对话"],
    ['Default Workspace VCS', '默认工作区 VCS'],
    ['More feedback options', '更多反馈选项'],
    ['Conversation Archived', '对话已归档'],
    ['Copy Config File Path', '复制配置文件路径'],
    ['Search automations...', '搜索自动化...'],
    ['At Mention Code Block', '@ 引用代码块'],
    ['At mention code block', '@ 引用代码块'],
    ['Toggle Overview Panel', '切换概览面板'],
    ['Sandbox Allow Network', '允许沙盒访问网络'],
    ['Pin This Conversation', '固定此对话'],
    ['Terminal: Add to Chat', '终端：添加到对话'],
    ['Previous Aux Pane Tab', '上一个辅助窗格标签页'],
    ['Confirm Window Reload', '确认重新加载窗口'],
    ['File path breadcrumbs', '文件路径导航面包屑'],
    ['Pin this conversation', '固定此对话'],
    ['Actuation Permissions', '操作权限'],
    ['Allow in Conversation', '在本次对话中允许'],
    ['Auto-Execution Policy', '自动执行策略'],
    ['Claude and GPT models', 'Claude 和 GPT 模型'],
    ['Claude and GPT Models', 'Claude 和 GPT 模型'],
    ['Enable Remote Control', '启用远程控制'],
    ['Experimental features', '实验性功能'],
    ['Experimental Features', '实验性功能'],
    ['Installed MCP Servers', '已安装的 MCP 服务器'],
    ['Model quota exhausted', '模型额度已耗尽'],
    ['Notification Settings', '通知设置'],
    ['Open project settings', '打开项目设置'],
    ['Opened URL in Browser', '已在浏览器中打开 URL'],
    ['Regroup Google3 Chats', '重新对 Google3 聊天分组'],
    ['Start Voice Recording', '开始语音录制'],
    ['Suggestions in Editor', '编辑器内联建议'],
    ['Toggle Auxiliary Pane', '切换辅助面板'],
    ['Toggle Model Selector', '切换模型选择器'],
    ['Workspace File Access', '工作区文件访问'],
    ['Workspace Web Access', '工作区网页访问'],
    ['Cancel questionnaire', '取消问卷'],
    ['Open in Preview Pane', '在预览窗格中打开'],
    ['Open Editor Settings', '打开编辑器设置'],
    ['Customizations views', '自定义视图'],
    ['Other Customizations', '其他自定义项'],
    ['Error Loading Models', '加载模型出错'],
    ['Untracked (Unstaged)', '未跟踪（未暂存）'],
    ['No updates available', '当前已是最新版本'],
    ['Workspace + Worktree', '工作区与工作树'],
    ['Command Setup Script', '命令初始化脚本'],
    ['Enable Notifications', '启用通知'],
    ['Copy Conversation ID', '复制对话 ID'],
    ['Find in Conversation', '在对话中查找'],
    ['Search Conversations', '搜索对话'],
    ['Download Diagnostics', '下载诊断信息'],
    ['Comment on Selection', '评论选中内容'],
    ['Equalize Split Panes', '均分拆分窗格'],
    ['Collapse All Folders', '折叠所有文件夹'],
    ['Create Cloud Project', '创建云端项目'],
    ['Enter device name...', '输入设备名称…'],
    ['Search workspaces...', '搜索工作区…'],
    ['Custom Context Menus', '自定义上下文菜单'],
    ['Remote Control Issue', '远程控制问题'],
    ['Archive conversation', '归档对话'],
    ['[Dev] GCP Project ID', '[开发] GCP 项目 ID'],
    ['Advanced File Access', '高级文件访问'],
    ['Agent Auto-Fix Lints', '智能体自动修复 Lint 错误'],
    ['Archive Conversation', '归档对话'],
    ['Conversation History', '对话历史'],
    ['Enable Browser Tools', '启用浏览器工具'],
    ['Enter URL pattern...', '输入 URL 匹配模式...'],
    ['Go Explorer: Refresh', 'Go 资源管理器: 刷新'],
    ['Marketplace Item URL', '插件市场单项 URL'],
    ['Network Access Rules', '网络访问规则'],
    ['No conversations yet', '暂无对话'],
    ['Open Agent on Reload', '重新加载时打开智能体'],
    ['Open Command Palette', '打开命令面板'],
    ['Pinned Conversations', '已固定对话'],
    ['Restore Conversation', '恢复对话'],
    ['Search all convos...', '搜索全部对话...'],
    ['Stop Voice Recording', '停止语音录制'],
    ['Tab Gitignore Access', 'Tab 键访问 .gitignore 排除文件'],
    ['Yes, allow this time', '是，仅允许本次'],
    ['Dismiss notification', '关闭通知'],
    ["Move Conversation Up", "上移对话"],
    ['Open in Preview Tab', '在预览标签页中打开'],
    ['No Models Available', '暂无可用模型'],
    ['Permission Settings', '权限设置'],
    ['Use Global Settings', '使用全局设置'],
    ['No background tasks', '无后台任务'],
    ['No active terminals', '无活动终端'],
    ['Revert file changes', '还原文件更改'],
    ['Custom Agent Error:', '自定义智能体错误：'],
    ['Rename Conversation', '重命名对话'],
    ['Open in Code Search', '在代码搜索中打开'],
    ['Load older messages', '加载更早的消息'],
    ['Advanced Web Access', '高级网页访问'],
    ['Agent security mode', '智能体安全模式'],
    ['Conversation picker', '对话选择器'],
    ['Delete Conversation', '删除对话'],
    ['Follow the guide at', '请按照以下指南'],
    ['Loading Antigravity', '正在加载 Antigravity'],
    ['Model quota reached', '模型额度已达上限'],
    ['Modern Web Guidance', '现代 Web 开发指南'],
    ['Network Permissions', '网络权限'],
    ['Open Project Picker', '打开项目选择器'],
    ['Open System Browser', '在系统浏览器中打开'],
    ['Other Conversations', '其他对话'],
    ['Parent Conversation', '父对话'],
    ['Pinned Conversation', '已固定对话'],
    ["Remote Control link", "远程控制链接"],
    ["Search shortcuts...", "搜索快捷键..."],
    ["Next Side Panel Tab", "下一个侧边栏标签页"],
    ["Plugins in Featured", "精选插件"],
    ["Select Environment", "选择环境"],
    ['Permission Details', '权限详情'],
    ['Workspace Creation', '工作区创建'],
    ['GitHub Permissions', 'GitHub 权限'],
    ['MCP Restart Error:', 'MCP 重启错误：'],
    ['Create with Prompt', '通过提示词创建'],
    ['No answer provided', '未提供回答'],
    ['Insert in Terminal', '插入到终端'],
    ['Insert in terminal', '插入到终端'],
    ['Stop All Subagents', '停止全部子智能体'],
    ['Project + Worktree', '项目与工作树'],
    ['Toggle File Viewer', '切换文件查看器'],
    ['Close Terminal Tab', '关闭终端标签页'],
    ['Go Forward in Pane', '在窗格中前进'],
    ['Expand All Folders', '展开所有文件夹'],
    ['Next match (Enter)', '下一个匹配项 (Enter)'],
    ['Clear search (Esc)', '清除搜索 (Esc)'],
    ['Group By Workspace', '按工作区分组'],
    ['MCP Install Error:', 'MCP 安装错误：'],
    ['Agent Host Address', '智能体主机地址'],
    ['Getting scripts...', '正在获取脚本…'],
    ['Add Scheduled Task', '添加定时任务'],
    ['Alphabetical (A-Z)', '按字母顺序 (A-Z)'],
    ['Analyzing Task Log', '正在分析任务日志'],
    ['Any error messages', '任何错误信息'],
    ['Autocomplete Speed', '补全速度'],
    ['Best of N Settings', 'Best of N 设置'],
    ['Chrome Binary Path', 'Chrome 可执行文件路径'],
    ['Conversation Width', '对话宽度'],
    ['Copy trajectory ID', '复制轨迹 ID'],
    ['Create New Project', '创建新项目'],
    ['Creating a Project', '正在创建项目'],
    ['Delete Permanently', '永久删除'],
    ['Keyboard shortcuts', '键盘快捷键'],
    ['Keyboard Shortcuts', '键盘快捷键'],
    ['New Scheduled Task', '新建定时任务'],
    ['Outside of Project', '项目外'],
    ['Previous Worktrees', '以前的工作树'],
    ['Proceed in Sandbox', '在沙盒中继续'],
    ['Search projects...', '搜索项目...'],
    ['Sort Conversations', '排序对话'],
    ['Steps to Reproduce', '重现步骤'],
    ['Unpin Conversation', '取消固定对话'],
    ['Verbose agent chat', '详细智能体聊天'],
    ['Verbose Agent Chat', '详细智能体聊天'],
    ['Workspace Settings', '工作区设置'],
    ['Global Permissions', '全局权限'],
    ['Global permissions', '全局权限'],
    ['global permissions', '全局权限'],
    ['Undo to this point', '撤销到此处'],
    ['Add inline comment', '添加行内批注'],
    ['Plan Review Policy', '计划审核策略'],
    ['Agent Conversation', '智能体对话'],
    ["Conversation Steps", "对话步骤"],
    ["Mute Voice Speaker", "将语音扬声器静音"],
    ["Marketplace notice", "插件市场说明"],
    ["Download Location", "下载位置"],
    ['Local Permissions', '本地权限'],
    ['Selection Actions', '选择操作'],
    ['Proceed with Plan', '按计划继续'],
    ['Previous question', '上一题'],
    ['Open in Side Pane', '在侧边窗格中打开'],
    ['Delete MCP Server', '删除 MCP 服务器'],
    ['Remove From Split', '从拆分视图中移除'],
    ['Remove from Split', '从拆分视图中移除'],
    ['Fork Conversation', '创建分支对话'],
    ['Next Aux Pane Tab', '下一个辅助窗格标签页'],
    ['Remove from Group', '从分组中移除'],
    ['Move to New Group', '移至新分组'],
    ['Continue Response', '继续回复'],
    ['Open Commit Graph', '打开提交历史图'],
    ['Add to Chat/Quote', '添加到聊天/引用'],
    ['Advanced Settings', '高级设置'],
    ['Analyzed Task Log', '已分析任务日志'],
    ['Archive / Restore', '归档 / 恢复'],
    ['Automatic updates', '自动检查更新'],
    ['Automatic Updates', '自动检查更新'],
    ['Build With Google', '使用 Google 构建'],
    ['Check for Updates', '检查更新'],
    ['Copy Project Name', '复制项目名称'],
    ['Copy sign-in link', '复制登录链接'],
    ['Copy to clipboard', '复制到剪贴板'],
    ['Edit Custom Model', '编辑自定义模型'],
    ['Expected behavior', '预期行为'],
    ['File Access Rules', '文件访问规则'],
    ['No agents running', '没有正在运行的代理'],
    ['No Model Selected', '未选择模型'],
    ['No projects found', '未找到项目'],
    ['Open Conversation', '打开对话'],
    ['Previous Pane Tab', '上一个面板标签页'],
    ['Record voice memo', '录制语音备忘'],
    ['Select one of the', '选择以下'],
    ['Setup Jetski Chat', '配置 Jetski 聊天'],
    ['Sort Conversation', '排序对话'],
    ['Terminal Commands', '终端命令'],
    ['Global Permission', '全局权限'],
    ['Permission Preset', '权限预设'],
    ['Permission preset', '权限预设'],
    ["Reopen Closed Tab", "重新打开已关闭的标签页"],
    ["Built-in Browser", "内置浏览器"],
    ["External Browser", "外部浏览器"],
    ["Browsing History", "浏览历史记录"],
    ["Browser Subagent", "浏览器子智能体"],
    ["Start Voice mode", "启动语音模式"],
    ['Vetted (Preview)', '安全审核（预览）'],
    ['Toggle file diff', '切换文件差异视图'],
    ['Group By Project', '按项目分组'],
    ['Replace With New', '替换为新对话'],
    ['Installed Skills', '已安装技能'],
    ['Sign-in required', '需要登录'],
    ['Open File Search', '打开文件搜索'],
    ['in the top left.', '可搜索对话。'],
    ['Mark All as Read', '全部标为已读'],
    ['New Terminal Tab', '新建终端标签页'],
    ['Update Available', '有可用更新'],
    ['Commit succeeded', '提交成功'],
    ['Failed to Commit', '提交失败'],
    ['to be installed.', '已安装。'],
    ['Pin conversation', '固定对话'],
    ['Add Custom Model', '添加自定义模型'],
    ['Auth and Billing', '身份验证与账单'],
    ['Background Tasks', '后台任务'],
    ['Best of N Models', 'Best of N 模型'],
    ['Browser CDP Port', '浏览器 CDP 端口'],
    ['Cancel All Tasks', '取消全部任务'],
    ['Create a Project', '创建项目'],
    ['Enable Demo Mode', '启用演示模式'],
    ['Enable Telemetry', '启用遥测'],
    ['File Permissions', '文件权限'],
    ['General Feedback', '一般反馈'],
    ['Keep In Menu Bar', '保留在菜单栏'],
    ['Marketing Emails', '营销邮件'],
    ['New conversation', '新建对话'],
    ['New Conversation', '新建对话'],
    ['No conversations', '暂无对话'],
    ['Open Preferences', '打开偏好设置'],
    ['Pin Conversation', '固定对话'],
    ['Project Detected', '检测到项目'],
    ['Project Settings', '项目设置'],
    ['Provide Feedback', '提供反馈'],
    ['Send Immediately', '立即发送'],
    ['Terms of Service', '服务条款'],
    ['Scroll to Bottom', '滚动到底部'],
    ['Scroll to bottom', '滚动到底部'],
    ['Tool Permissions', '工具权限'],
    ['Tool permissions', '工具权限'],
    ["Search shortcuts", "搜索快捷键"],
    ['Allowed Domains', '允许的域名'],
    ['GitHub Policies', 'GitHub 策略'],
    ['Project options', '项目选项'],
    ['Thought Process', '思考过程'],
    ['Faster response', '响应速度更快'],
    ['No file changes', '无文件更改'],
    ['Add MCP Servers', '添加 MCP 服务器'],
    ['Search Projects', '搜索项目'],
    ['Delete Terminal', '删除终端'],
    ['Quote Selection', '引用选中内容'],
    ['Go Back in Pane', '在窗格中后退'],
    ['Autonomous Mode', '自主模式'],
    ['Archive project', '归档项目'],
    ['Amend succeeded', '修改提交成功'],
    ['Failed to Amend', '修改提交失败'],
    ['and select plan', '并选择 plan'],
    [', or copy link.', '，或复制链接。'],
    ['to be installed', '已安装'],
    ['1 agent running', '1 个代理正在运行'],
    ['Actual behavior', '实际行为'],
    ['Actuation Rules', '操作规则'],
    ['Background Task', '后台任务'],
    ['Code with Agent', '与智能体协作编码'],
    ['Command Palette', '命令面板'],
    ['Copy debug info', '复制调试信息'],
    ['Display Options', '显示选项'],
    ['Editor Settings', '编辑器设置'],
    ['Feature Request', '功能请求'],
    ['Five Hour Limit', '5 小时限额'],
    ['For help, visit', '如需帮助，请访问'],
    ['global settings', '全局设置'],
    ['Import success:', '导入成功：'],
    ['Layout Controls', '布局控制'],
    ['Message history', '消息历史'],
    ['Missing Folders', '缺失文件夹'],
    ['Open MCP Config', '打开 MCP 配置'],
    ['Package Outline', '包大纲'],
    ['Project Folders', '项目文件夹'],
    ['Project General', '项目常规'],
    ['Queued Messages', '排队消息'],
    ['Scheduled Tasks', '定时任务'],
    ['Search files...', '搜索文件...'],
    ['Search tasks...', '搜索任务...'],
    ['Security Preset', '安全预设'],
    ['Toggle Terminal', '切换终端'],
    ['Fold code block', '折叠代码块'],
    ['Tool Permission', '工具权限'],
    ['Project deleted', '项目已删除'],
    ["Developer Tools", "开发工具"],
    ["System default", "系统默认"],
    ["Local Checkout", "本地检出"],
    ['Add MCP Server', '添加 MCP 服务器'],
    ['Skills & Rules', '技能与规则'],
    ['Delete Handler', '删除处理程序'],
    ['Setup required', '需要配置'],
    ['Added (Staged)', '已添加（已暂存）'],
    ['Unstage change', '取消暂存更改'],
    ['Merge Conflict', '合并冲突'],
    ['Refresh skills', '刷新技能'],
    ['Add automation', '添加自动化'],
    ['Inherit Global', '继承全局设置'],
    ['Delete comment', '删除评论'],
    ['Auto (Preview)', '自动（预览）'],
    ['Split Terminal', '拆分终端'],
    ['Staged Changes', '已暂存的更改'],
    ['Branch Changes', '分支更改'],
    ['Modified Files', '已修改的文件'],
    ['Chief of Staff', '统筹助手'],
    ['Open Launchpad', '打开启动台'],
    ['Input required', '需要输入'],
    ['Push succeeded', '推送成功'],
    ['Failed to Push', '推送失败'],
    ['Reset zoom (0)', '重置缩放 (0)'],
    [', or copy link', '，或复制链接'],
    ['Agent Behavior', '智能体行为'],
    ['Agent response', '智能体回复'],
    ['Always Proceed', '始终继续'],
    ['Auto Execution', '自动执行'],
    ['Copy File Name', '复制文件名'],
    ['Copy File Path', '复制文件路径'],
    ['Create Project', '创建项目'],
    ['Customizations', '自定义'],
    ['Delete Project', '删除项目'],
    ['Go to Projects', '前往项目'],
    ['Import failed:', '导入失败：'],
    ['Inline Actions', '内联操作'],
    ['Mark as Unread', '标记为未读'],
    ['Missing Folder', '缺失文件夹'],
    ['Models & Usage', '模型与用量'],
    ['No MCP Servers', '没有 MCP 服务器'],
    ['Not in Project', '未在项目中'],
    ['Open window...', '打开窗口...'],
    ['Open Workspace', '打开工作区'],
    ['Opened browser', '已打开浏览器'],
    ['Proceeded with', '已执行'],
    ['Project picker', '项目选择器'],
    ['Remote Control', '远程控制'],
    ['Request Review', '请求审核'],
    ['Require Review', '需要审核'],
    ['Review Changes', '审核更改'],
    ['Stop execution', '停止执行'],
    ['inline comment', '行内批注'],
    ['Select Project', '选择项目'],
    ['Toggle Sidebar', '切换侧边栏'],
    ['Typeahead menu', '自动补全菜单'],
    ['View Changelog', '查看更新日志'],
    ["Mute Voice Mic", "将语音麦克风静音"],
    ["This Computer", "此电脑"],
    ["Open Links In", "打开链接的方式"],
    ['Table options', '表格选项'],
    ['Agent options', '智能体选项'],
    ['Next question', '下一题'],
    ['Page contents', '页面内容'],
    ['Manage Skills', '管理技能'],
    ['Move to Group', '移至分组'],
    ['Open Terminal', '打开终端'],
    ['Give Feedback', '提供反馈'],
    ['Delete plugin', '删除插件'],
    ['Stop Subagent', '停止子智能体'],
    ['Archived Only', '仅显示已归档'],
    ['Files Changed', '已更改的文件'],
    ['Custom Agents', '自定义智能体'],
    ['Context Menus', '上下文菜单'],
    ['UI Extensions', '界面扩展'],
    ['Select branch', '选择分支'],
    ['Invalid Media', '无效的媒体文件'],
    ['File explorer', '文件浏览器'],
    ['Inline Widget', '内联组件'],
    ['Maximize Pane', '最大化窗格'],
    ['Agent Decides', '由智能体决定'],
    ['Allow options', '允许选项'],
    ['Chat Settings', '聊天设置'],
    ['CitC Settings', 'CitC 设置'],
    ['Conversations', '对话'],
    ['Default Light', '默认浅色'],
    ['Feedback Type', '反馈类型'],
    ['Gemini Models', 'Gemini 模型'],
    ['Good response', '好评'],
    ['Inherits from', '继承自'],
    ['Message input', '消息输入框'],
    ['Model Credits', '模型积分'],
    ['New Workspace', '新建工作区'],
    ['Next Pane Tab', '下一个面板标签页'],
    ['Notifications', '通知'],
    ['Open in Cider', '在 Cider 中打开'],
    ['Open Settings', '打开设置'],
    ['Prevent Sleep', '防止睡眠'],
    ['Project Agent', '项目智能体'],
    ['Reload Window', '重新加载窗口'],
    ['Review Policy', '审核策略'],
    ['Send Feedback', '发送反馈'],
    ['Tab to Import', '按下 Tab 导入'],
    ['Toggle Editor', '切换编辑器'],
    ['Back to Agent', '返回智能体'],
    ['Customization', '自定义项'],
    ["Every weekday", "每个工作日"],
    ["Voice volume", "语音音量"],
    ['Show details', '显示详情'],
    ['Chime volume', '提示音音量'],
    ['Open Preview', '打开预览'],
    ['Multi-select', '多选'],
    ['Stage change', '暂存更改'],
    ['Confirm Undo', '确认撤销'],
    ['Undo To Here', '撤销到此处'],
    ['Delete Skill', '删除技能'],
    ['Rename Group', '重命名分组'],
    ['Recent Files', '最近文件'],
    ['Edit comment', '编辑评论'],
    ['No subagents', '无子智能体'],
    ['Custom Order', '自定义顺序'],
    ['Manage Hooks', '管理钩子'],
    ['Zoom out (-)', '缩小 (-)'],
    ['or copy link', '或复制链接'],
    ['Overview tab', '概览标签页'],
    ['Terminal tab', '终端标签页'],
    ['Always Allow', '始终允许'],
    ['App Settings', '应用设置'],
    ['Bad response', '差评'],
    ['Browser Task', '浏览器任务'],
    ['Close Folder', '关闭文件夹'],
    ['Confirm Quit', '确认退出'],
    ['Conversation', '对话'],
    ['Copy Command', '复制命令'],
    ['Copy Content', '复制内容'],
    ['Default Dark', '默认深色'],
    ['Disable Task', '禁用任务'],
    ['Execute URLs', '执行 URL'],
    ['Find in Pane', '在面板中查找'],
    ['Full machine', '整机访问'],
    ['Last Updated', '最近更新'],
    ['Mark as Read', '标记为已读'],
    ['More actions', '更多操作'],
    ['New Worktree', '新建工作树'],
    ['Record Audio', '录制音频'],
    ['Restart Task', '重启任务'],
    ['Select Model', '选择模型'],
    ['Send message', '发送消息'],
    ['Toggle Agent', '切换智能体'],
    ['User message', '用户消息'],
    ['Weekly Limit', '周额度'],
    ['More options', '更多选项'],
    ['AI Shortcuts', 'AI 快捷方式'],
    ["Instructions", "指令"],
    ["More Plugins", "更多插件"],
    ['Danger Zone', '危险操作'],
    ['Setting up…', '正在配置…'],
    ['Thinking...', '思考中...'],
    ['Unavailable', '不可用'],
    ['Delete Hook', '删除钩子'],
    ['Add Handler', '添加处理程序'],
    ['Cancel step', '取消此步骤'],
    ['Only Unread', '仅显示未读'],
    ['Last 7 days', '最近 7 天'],
    ['Decorations', '标记'],
    ['Agent Edits', '智能体编辑'],
    ['Strict Mode', '严格模式'],
    ['Code Search', '代码搜索'],
    ['Add to Chat', '添加到对话'],
    ['MCP Servers', 'MCP 服务器'],
    ['Accept Step', '接受此步骤'],
    ['Reject Step', '拒绝此步骤'],
    ['File Picker', '文件选择器'],
    ['Split Right', '向右拆分'],
    ['In Progress', '进行中'],
    ['Custom View', '自定义视图'],
    ['Zoom in (+)', '放大 (+)'],
    ['File Viewer', '文件查看器'],
    ['breadcrumbs', '路径导航'],
    ['Add context', '添加上下文'],
    ['Application', '应用'],
    ['Cancel Task', '取消任务'],
    ['Copy prompt', '复制提示词'],
    ['Delete Task', '删除任务'],
    ['Description', '描述'],
    ['Enable Task', '启用任务'],
    ['File Access', '文件访问'],
    ['File Writes', '文件写入'],
    ['Focus Input', '聚焦输入框'],
    ['Full access', '完全访问'],
    ['Get Started', '开始使用'],
    ['Jetski Chat', 'Jetski 聊天'],
    ['Last Prompt', '上次提示词'],
    ['Light Theme', '浅色主题'],
    ['Marketplace', '插件市场'],
    ['Model Quota', '模型额度'],
    ['New Project', '新建项目'],
    ['No Subtitle', '无副标题'],
    ['Open Folder', '打开文件夹'],
    ['or join the', '或加入'],
    ['Permissions', '权限'],
    ['Quick Start', '快速开始'],
    ['Recommended', '推荐'],
    ['Suggestions', '建议'],
    ['Tab to Jump', '按下 Tab 跳转'],
    ['Token Usage', 'Token 使用量'],
    ['Write Files', '写入文件'],
    ['Automations', '自动化'],
    ['Environment', '环境'],
    ['Device Name', '设备名称'],
    ['App version', '应用版本'],
    ['Modified in', '已在'],
    ["Voice mode", "语音模式"],
    ["Microphone", "麦克风"],
    ['Loading...', '正在加载...'],
    ['Yes, allow', '是，允许'],
    ['UI Actions', '界面操作'],
    ['Compacting', '正在压缩上下文'],
    ['Models Tab', '模型标签页'],
    ['+ Add Hook', '+ 添加钩子'],
    ['Setting up', '正在配置'],
    ['View Usage', '查看用量'],
    ['View plans', '查看套餐'],
    ['Legal Help', '法律帮助'],
    ['Select All', '全选'],
    ['New Window', '新建窗口'],
    ['Split Down', '向下拆分'],
    ['Copy value', '复制值'],
    ['Copy Image', '复制图片'],
    ['and select', '并选择'],
    ['Review tab', '审核标签页'],
    ['Permission', '权限'],
    ['Add Folder', '添加文件夹'],
    ['Allow once', '允许一次'],
    ['Always Ask', '始终询问'],
    ['Appearance', '外观'],
    ['Automation', '自动化'],
    ['Avatar URL', '头像 URL'],
    ['Background', '背景色'],
    ['Bug Report', '错误报告'],
    ['chat space', '聊天群组'],
    ['Dark Theme', '深色主题'],
    ['Date Added', '添加日期'],
    ['Deprecated', '已弃用'],
    ['Edit Model', '编辑模型'],
    ['File Reads', '文件读取'],
    ['Foreground', '前景色'],
    ['Go Forward', '前进'],
    ['Learn more', '了解更多'],
    ['Navigation', '导航'],
    ['No Project', '无项目'],
    ['Quick Open', '快速打开'],
    ['Read Files', '读取文件'],
    ['Reset Zoom', '重置缩放'],
    ['Tab Import', '按下 Tab 导入'],
    ['Turbo mode', '极速模式'],
    ['View Debug', '查看调试信息'],
    ['Working...', '正在工作...'],
    ['Workspaces', '工作区'],
    ['Your Plan:', '您的套餐：'],
    ["Every hour", "每小时"],
    ["Every week", "每周"],
    ['View Diff', '查看差异'],
    ['Installed', '已安装'],
    ['Completed', '已完成'],
    ['Try Again', '重试'],
    ['Configure', '配置'],
    ['Subagents', '子智能体'],
    ['Terminals', '终端'],
    ['View Logs', '查看日志'],
    ['Full Logs', '完整日志'],
    ['Scheduled', '定时任务'],
    ['Close Tab', '关闭标签页'],
    ['New Group', '新建分组'],
    ['See Plans', '查看套餐'],
    ['Actuation', '操作'],
    ['Add Model', '添加模型'],
    ['Automatic', '自动'],
    ['Copy path', '复制路径'],
    ['Customize', '自定义'],
    ['Developer', '开发者'],
    ['Execution', '执行'],
    ['Knowledge', '知识库'],
    ['Launchpad', '启动台'],
    ['MCP Tools', 'MCP 工具'],
    ['Read URLs', '读取 URL'],
    ['regrouped', '重新分组'],
    ['Remaining', '剩余'],
    ['Sandboxed', '沙盒化'],
    ['Searching', '正在搜索'],
    ['Selection', '选择'],
    ['Shortcuts', '快捷键'],
    ['Subtitles', '副标题'],
    ['Tab Speed', 'Tab 补全速度'],
    ['Workspace', '工作区'],
    ['Artifacts', '产物列表'],
    ['copy link', '复制链接'],
    ['Workflows', '工作流'],
    ["How often", "重复频率"],
    ["Every day", "每天"],
    ['Nickname', '昵称'],
    ['Contrast', '对比度'],
    ['Thinking', '思考中'],
    ['Continue', '继续'],
    ['Modified', '已修改'],
    ['Built In', '内置'],
    ['Starting', '正在启动'],
    ['Previous', '上一步'],
    ['Validate', '验证'],
    ['Overview', '概览'],
    ['Commands', '命令'],
    ['Comments', '评论'],
    ['See more', '查看更多'],
    ['tokens (', 'Token ('],
    ['Open IDE', '打开 IDE'],
    ['[MODIFY]', '[修改]'],
    ['Advanced', '高级'],
    ['Archived', '已归档'],
    ['Bot Name', '机器人名称'],
    ['Disabled', '已禁用'],
    ['Download', '下载'],
    ['Explored', '已探索'],
    ['Feedback', '反馈'],
    ['Group By', '分组方式'],
    ['Maximize', '最大化'],
    ['Mentions', '提及'],
    ['Minimize', '最小化'],
    ['Open App', '打开应用'],
    ['Open URL', '打开 URL'],
    ['Planning', '规划'],
    ['Projects', '项目'],
    ['Searched', '已搜索'],
    ['searches', '搜索'],
    ['See less', '收起'],
    ['Settings', '设置'],
    ['Show all', '显示全部'],
    ['Sign Out', '退出登录'],
    ['Terminal', '终端'],
    ['Worktree', '工作树'],
    ['Zoom Out', '缩小'],
    ["Untitled", "未命名"],
    ["Featured", "精选"],
    ["Business", "商务"],
    ["Change…", "更改…"],
    ["Not set", "未设置"],
    ['Updater', '更新程序'],
    ['Skipped', '已跳过'],
    ['Sources', '来源'],
    ['Renamed', '已重命名'],
    ['Discard', '放弃'],
    ['Restore', '恢复'],
    ['Running', '运行中'],
    ['Stopped', '已停止'],
    ['Pending', '等待中'],
    ['Blocked', '已阻止'],
    ['Confirm', '确认'],
    ['Decline', '拒绝'],
    ['Connect', '连接'],
    ['Preview', '预览'],
    ['Loading', '正在加载'],
    ['Install', '安装'],
    ['Sort By', '排序方式'],
    ['Display', '显示'],
    ['New Tab', '新建标签页'],
    ['Account', '账户'],
    ['Actions', '操作'],
    ['Add MCP', '添加 MCP'],
    ['Browser', '浏览器'],
    ['Context', '上下文'],
    ['Default', '默认'],
    ['Deleted', '已删除'],
    ['Dismiss', '忽略'],
    ['Enabled', '已启用'],
    ['Folders', '文件夹'],
    ['General', '常规'],
    ['Go Back', '后退'],
    ['History', '历史'],
    ['Plugin:', '插件：'],
    ['Plugins', '插件'],
    ['Proceed', '继续'],
    ['Profile', '配置文件'],
    ['Project', '项目'],
    ['Refresh', '刷新'],
    ['Release', '松开'],
    ['Science', '科学'],
    ['Sidebar', '侧边栏'],
    ['Upgrade', '升级'],
    ['Working', '正在工作'],
    ['Zoom In', '放大'],
    ['Archive', '归档'],
    ['Version', '版本'],
    ["Verbose", "详细"],
    ["Trigger", "触发条件"],
    ["Remote", "远程"],
    ['Copied', '已复制'],
    ['Commit', '提交'],
    ['Source', '来源'],
    ['Accept', '接受'],
    ['Reject', '拒绝'],
    ['Remove', '移除'],
    ['Manage', '管理'],
    ['Reload', '重新加载'],
    ['Agents', '智能体'],
    ['Output', '输出'],
    ['Errors', '错误'],
    ['Notice', '提示'],
    ['Volume', '音量'],
    ['Strong', '严格'],
    ['Accent', '强调色'],
    ['Cancel', '取消'],
    ['Custom', '自定义'],
    ['Delete', '删除'],
    ['Edited', '已编辑'],
    ['Editor', '编辑器'],
    ['Export', '导出'],
    ['Filter', '筛选'],
    ['Folder', '文件夹'],
    ['Global', '全局'],
    ['Inline', '内联'],
    ['Log in', '登录'],
    ['Medium', '中'],
    ['Models', '模型'],
    ['Narrow', '窄'],
    ['Picker', '选择器'],
    ['Pinned', '已固定'],
    ['Viewer', '查看器'],
    ['Preset', '预设'],
    ['Recent', '最近使用'],
    ['Rename', '重命名'],
    ['Review', '审核'],
    ['Search', '搜索'],
    ['Skills', '技能'],
    ['Snooze', '稍后提醒'],
    ['Status', '状态'],
    ['Strict', '严格'],
    ['Submit', '提交'],
    ['System', '系统'],
    ['Value:', '当前值：'],
    ['Window', '窗口'],
    ["Change", "更改"],
    ["Create", "创建"],
    ["Prompt", "提示词"],
    ["Voice", "语音"],
    ['Turbo', '极速'],
    ['Quota', '额度'],
    ['Sound', '声音'],
    ['Amend', '修改提交'],
    ['Ready', '就绪'],
    ['Retry', '重试'],
    ['Apply', '应用'],
    ['Clear', '清除'],
    ['Reset', '重置'],
    ['Hooks', '钩子'],
    ['Error', '错误'],
    ['Visit', '访问'],
    ['Allow', '允许'],
    ['Block', '阻止'],
    ['menu)', '菜单)'],
    ['After', '分组后'],
    ['Close', '关闭'],
    ['Email', '邮箱'],
    ['files', '文件'],
    ['Light', '浅色'],
    ['Local', '本地'],
    ['Media', '媒体'],
    ['Model', '模型'],
    ['Queue', '排队'],
    ['Quote', '引用'],
    ['Rules', '规则'],
    ['Setup', '配置'],
    ['Theme', '主题'],
    ['Usage', '用量'],
    ['Go to', '转到'],
    ['Agent', '智能体'],
    ['Start', '开始'],
    ['Auto', '自动'],
    ['Deny', '拒绝'],
    ['Slow', '慢'],
    ['Fill', '铺满'],
    ['Push', '推送'],
    ['Undo', '撤销'],
    ['Idle', '空闲'],
    ['Done', '完成'],
    ['Back', '返回'],
    ['Next', '下一步'],
    ['Stop', '停止'],
    ['Logs', '日志'],
    [', or', '，或'],
    ['Copy', '复制'],
    ['Dark', '深色'],
    ['Edit', '编辑'],
    ['Fast', '快'],
    ['File', '文件'],
    ['Help', '帮助'],
    ['High', '高'],
    ['Hold', '按住'],
    ['Labs', '实验室'],
    ['None', '无'],
    ['Open', '打开'],
    ['Plan', '套餐计划'],
    ['Tool', '工具'],
    ['Type', '输入'],
    ['Quit', '退出'],
    ['Read', '读取'],
    ['Skip', '跳过'],
    ['Pane', '窗格'],
    ['More', '更多'],
    ['View', '视图'],
    ['Wide', '宽'],
    ["Chat", "对话"],
    ["Font", "字体"],
    ["Name", "名称"],
    ["Time", "时间"],
    ['New', '新建'],
    ['Add', '添加'],
    ['App', '应用'],
    ['Low', '低'],
    ['Pin', '固定'],
    ['now', '刚刚'],
    ['Now', '当前'],
    ['Off', '关闭'],
    ['Ran', '已运行'],
    ['Run', '运行'],
    ['Use', '使用'],
    ['No', '否'],
    ['On', '开启'],
    ["at", "于"],
  ]);

  // 根据长度倒序排序
  const sortedPhrases = Array.from(phrases.entries()).sort((a, b) => b[0].length - a[0].length);

  // 小写词汇索引，便于精准匹配大小写差异
  const lowerPhrases = new Map();
  for (const [k, v] of phrases.entries()) {
    lowerPhrases.set(k.toLowerCase(), v);
  }

  // 词条正则缓存
  const regexCache = new Map();
  function getPhraseRegex(source) {
    let cached = regexCache.get(source);
    if (!cached) {
      const escaped = source.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
      const startsWord = /^[A-Za-z0-9]/.test(source);
      const endsWord = /[A-Za-z0-9]$/.test(source);
      cached = new RegExp((startsWord ? '(?<![A-Za-z0-9])' : '') + escaped + (endsWord ? '(?![A-Za-z0-9])' : ''), 'g');
      regexCache.set(source, cached);
    }
    return cached;
  }

  // 精准独立词汇匹配（支持快捷键与末尾标点），防止短词在长句中误伤
  function matchExactPhrase(trimmed) {
    if (phrases.has(trimmed)) return phrases.get(trimmed);
    const low = trimmed.toLowerCase();
    if (lowerPhrases.has(low)) return lowerPhrases.get(low);

    // 快捷键: 如 Save (Ctrl+S) 或 Save (⌘S)
    const scMatch = trimmed.match(/^(.+?)\s*\((Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+?([^)]*)\)$/i);
    if (scMatch) {
      const prefix = scMatch[1].trim();
      if (phrases.has(prefix)) return phrases.get(prefix) + ` (${scMatch[2]}${scMatch[3] ? '+' + scMatch[3] : ''})`;
      if (lowerPhrases.has(prefix.toLowerCase())) return lowerPhrases.get(prefix.toLowerCase()) + ` (${scMatch[2]}${scMatch[3] ? '+' + scMatch[3] : ''})`;
    }
    // 常见标点：冒号、省略号、问号、感叹号
    const puncMatch = trimmed.match(/^(.+?)([:：\?？!！…]+|\.{3,})$/);
    if (puncMatch) {
      const prefix = puncMatch[1].trim();
      if (phrases.has(prefix)) return phrases.get(prefix) + puncMatch[2];
      if (lowerPhrases.has(prefix.toLowerCase())) return lowerPhrases.get(prefix.toLowerCase()) + puncMatch[2];
    }
    return null;
  }

  const progressVerbs = {
    exploring: '正在探索', explored: '已探索',
    editing: '正在编辑', edited: '已编辑',
    running: '正在运行', ran: '已运行',
    searching: '正在搜索', searched: '已搜索',
    reading: '正在读取', read: '已读取'
  };
  const progressNouns = new Map([
    ['file', ['文件', '个']], ['files', ['文件', '个']],
    ['folder', ['文件夹', '个']], ['folders', ['文件夹', '个']],
    ['command', ['命令', '个']], ['commands', ['命令', '个']],
    ['artifact', ['产物', '个']], ['artifacts', ['产物', '个']],
    ['search', ['搜索', '次']], ['searches', ['搜索', '次']],
    ['task', ['任务', '个']], ['tasks', ['任务', '个']],
    ['page', ['网页', '个']], ['pages', ['网页', '个']],
    ['image', ['图片', '张']], ['images', ['图片', '张']],
    ['action', ['操作', '项']], ['actions', ['操作', '项']],
  ]);
  const progressPartRegex = /^(exploring|explored|editing|edited|running|ran|searching|searched|reading|read)(?:\s*(?:(\d+)\s+)?(files?|folders?|commands?|artifacts?|searches?|tasks?|pages?|images?|actions?))?$/i;

  // 智能体任务动态状态栏（例如：Exploring files, running commands ⌵）
  function translateAgentProgress(str) {
    if (!str) return null;
    const clean = str.trim().replace(/\s*[⌵▼▾ˇ⌄\u2304\u25be\u25bc\u25bd]\s*$/, '').trim();

    const parts = clean.split(/\s*,\s*/);
    if (parts.length === 0) return null;

    const translatedParts = [];
    for (const part of parts) {
      const m = part.trim().match(progressPartRegex);
      if (!m) return null;
      const verbKey = m[1].toLowerCase();
      const v = progressVerbs[verbKey] || m[1];
      const count = m[2];
      const nounRaw = m[3];
      if (!nounRaw) {
        if (!/^(exploring|explored|editing|edited)$/.test(verbKey)) return null;
        translatedParts.push(v);
        continue;
      }
      const nounKey = nounRaw.toLowerCase();
      const nounEntry = progressNouns.get(nounKey);
      const n = nounEntry ? nounEntry[0] : nounRaw;
      const unit = nounEntry ? nounEntry[1] : '个';
      if (count !== undefined) {
        translatedParts.push(`${v} ${count} ${unit}${n}`);
      } else {
        translatedParts.push(`${v}${n}`);
      }
    }

    const trailingSuffix = str.endsWith(clean) ? '' : str.slice(str.indexOf(clean) + clean.length);
    return translatedParts.join('，') + trailingSuffix;
  }

  function formatRelativeTime(str) {
    if (!str) return str;
    return str
      .replace(/(\d+)\s*years?\b/gi, (_m, n) => n + ' 年')
      .replace(/(\d+)\s*months?\b/gi, (_m, n) => n + ' 个月')
      .replace(/(\d+)\s*weeks?\b/gi, (_m, n) => n + ' 周')
      .replace(/(\d+)\s*days?\b/gi, (_m, n) => n + ' 天')
      .replace(/(\d+)\s*hours?\b/gi, (_m, n) => n + ' 小时')
      .replace(/(\d+)\s*minutes?\b/gi, (_m, n) => n + ' 分钟')
      .replace(/(\d+)\s*seconds?\b/gi, (_m, n) => n + ' 秒')
      .replace(/,\s*/g, ' ')
      .trim();
  }

  // 英文日期统一转为中文格式：November 18, 2026 → 2026 年 11 月 18 日；Nov 18 → 11 月 18 日。
  // 日期数值原样保留，只改写书写格式；仅作用于已含中文的译文（见 translate 第 6 步），
  // 纯英文文本（未翻译内容、用户数据）不受影响。
  const englishMonths = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const englishDateRegex = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?/g;
  function localizeEnglishDates(str) {
    return str.replace(englishDateRegex, (match, month, day, year) => {
      const m = englishMonths[month.slice(0, month.toLowerCase() === 'sept' ? 4 : 3).toLowerCase()];
      const d = Number(day);
      if (!m || d < 1 || d > 31) return match;
      return year ? `${year} 年 ${m} 月 ${d} 日` : `${m} 月 ${d} 日`;
    });
  }

  function formatShortDuration(str) {
    return str
      .trim()
      .replace(/(\d+)\s*d\b/gi, '$1 天')
      .replace(/(\d+)\s*h\b/gi, '$1 小时')
      .replace(/(\d+)\s*m\b/gi, '$1 分钟')
      .replace(/(\d+)\s*s\b/gi, '$1 秒')
      .replace(/\s+/g, ' ');
  }

  const permissionScopes = {
    'when not in a project': '不在项目中时',
    'in this conversation': '在此对话中',
    'in this project': '在此项目中',
    'in this workspace': '在此工作区',
    globally: '全局',
  };
  const permissionActions = {
    'read access to this path': '读取此路径',
    'write access to this path': '写入此路径',
    'reading this URL': '读取此 URL',
    'executing actions on this URL': '在此 URL 上执行操作',
    'running this command outside the sandbox': '在沙盒外运行此命令',
    'running this command': '运行此命令',
    'using this MCP tool': '使用此 MCP 工具',
    'run (unsandboxed)': '在沙盒外运行',
    'grant administrator access for': '授予管理员权限',
    run: '运行',
    read: '读取',
    write: '写入',
    use: '使用',
    access: '访问',
  };

  // 权限目标属于数据：只翻译模板，并立即返回，禁止后续规则改写命令/路径。
  function translatePermission(value) {
    const text = value.trim();
    // MutationObserver 会再次观察到翻译后的文本；二次处理也须保持目标不变。
    if (/^(正在请求权限：|智能体需要权限才能|是，并.*(?:保存|始终允许)|保存规则以始终允许\s|与您配置的询问权限冲突：|需要手动确认：|允许\s)/s.test(text)) return value;
    let m, translated;
    if ((m = text.match(/^Requesting permission to (running this command outside the sandbox|running this command|read access to this path|write access to this path|reading this URL|executing actions on this URL|using this MCP tool|run \(unsandboxed\)|grant administrator access for|run|read|write|use|access) ([\s\S]+)$/))) {
      translated = '正在请求权限：' + permissionActions[m[1]] + ' ' + m[2];
    } else if ((m = text.match(/^Agent needs permission to execute JavaScript on ([\s\S]+)$/))) {
      translated = '智能体需要权限才能在 ' + m[1] + ' 上执行 JavaScript';
    } else if ((m = text.match(/^Agent needs permission to act on ([\s\S]+)$/))) {
      translated = '智能体需要权限才能操作 ' + m[1];
    } else if ((m = text.match(/^Yes, save rule for '([\s\S]*)' (when not in a project|in this conversation|in this project|in this workspace|globally)$/))) {
      translated = `是，并${permissionScopes[m[2]]}保存 '${m[1]}' 的规则`;
    } else if ((m = text.match(/^Yes, save rule (when not in a project|in this conversation|in this project|in this workspace|globally)$/))) {
      translated = `是，并${permissionScopes[m[1]]}保存规则`;
    } else if ((m = text.match(/^Yes, and always allow '([\s\S]*)'(?: (when not in a project|in this conversation|in this project|in this workspace|globally))?$/))) {
      translated = `是，并${permissionScopes[m[2]] || ''}始终允许 '${m[1]}'`;
    } else if ((m = text.match(/^Yes, and always allow(?: (when not in a project|in this conversation|in this project|in this workspace|globally))?$/))) {
      translated = `是，并${permissionScopes[m[1]] || ''}始终允许`;
    } else if ((m = text.match(/^Conflicts with your configured Ask permission: ([\s\S]+)$/))) {
      translated = '与您配置的询问权限冲突：' + m[1];
    } else if ((m = text.match(/^Requires manual confirmation: ([\s\S]+)$/))) {
      translated = '需要手动确认：' + m[1];
    } else if (!phrases.has(text) && !lowerPhrases.has(text.toLowerCase()) && (m = text.match(/^Save rule to always allow ([\s\S]+)\?$/))) {
      translated = '保存规则以始终允许 ' + m[1] + '？';
    } else if (!phrases.has(text) && !lowerPhrases.has(text.toLowerCase()) && (m = text.match(/^Allow ([\s\S]+)$/)) && !/^(?:Non-Flow|[a-z]+ing\s|[a-z]+\s+to\s)/i.test(m[1])) {
      translated = '允许 ' + m[1];
    } else if (/^(Requesting permission to |Agent needs permission to |Yes, (?:save rule|and always allow)|Conflicts with your configured Ask permission: |Requires manual confirmation: )/.test(text)) {
      return value; // 新版未知权限模板保留原文，不能冒险翻译其中的目标。
    } else {
      return null;
    }
    return value.replace(text, () => translated); // 回调避免目标中的 $& / $' 被当作替换指令。
  }

  // 动态变量与模板匹配（仅针对含捕获组、时间、计算等动态规则）
  const dynamicPatterns = [

    // 动态时间与耗时
    [/Worked for ((?:\d+\s*[dhms]\b\s*)+)/gi, (_m, dur) => '已工作 ' + formatShortDuration(dur)],
    [/Stopped after ((?:\d+\s*[dhms]\b\s*)+)/gi, (_m, dur) => '工作 ' + formatShortDuration(dur) + '后停止'],
    [/Thought for ((?:\d+\s*[dhms]\b\s*)+)/gi, (_m, dur) => '已思考 ' + formatShortDuration(dur)],
    [/Thinking for ((?:\d+\s*[dhms]\b\s*)+)/gi, (_m, dur) => '已思考 ' + formatShortDuration(dur)],
    [/Compacting \u00b7 ((?:\d+\s*[dhms]\b\s*)+)/gi, (_m, dur) => '正在压缩上下文 · ' + formatShortDuration(dur)],
    [/Fold lines (\d+)-(\d+)/g, '折叠第 $1-$2 行'],
    [/(\d+)\s*minutes?\s*ago\b/gi, '$1 分钟前'],
    [/(\d+)\s*hours?\s*ago\b/gi, '$1 小时前'],
    [/(\d+)\s*days?\s*ago\b/gi, '$1 天前'],
    [/(\d+)\s*weeks?\s*ago\b/gi, '$1 周前'],
    [/(\d+)\s*months?\s*ago\b/gi, '$1 个月前'],
    [/(\d+)\s*years?\s*ago\b/gi, '$1 年前'],
    [/^about (\d+\s*(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))$/gi, (_m, dur) => '大约 ' + formatRelativeTime(dur)],
    [/^over (\d+\s*(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))$/gi, (_m, dur) => '超过 ' + formatRelativeTime(dur)],
    [/^almost (\d+\s*(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))$/gi, (_m, dur) => '将近 ' + formatRelativeTime(dur)],
    [/^Don't show this for (\d+)\s*days?$/gi, '$1 天内不再显示'],
    [/Refreshes in (.+)/gi, (_m, time) => `${formatRelativeTime(time)}后刷新`],
    [/You have used (some|all) of your (weekly|5-hour) limit, it will (?:fully )?refresh in (.+?)\.?$/gi, (_m, qty, type, time) => {
      const isAll = qty.toLowerCase() === 'all';
      const typeZh = type.toLowerCase() === 'weekly' ? '周' : ' 5 小时';
      const action = isAll ? '已用尽' : '已使用部分';
      return `您${action}${typeZh}额度，将在 ${formatRelativeTime(time)}后完全刷新。`;
    }],
    [/^(\d+\s*(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?)(?:,\s*\d+\s*(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))*)$/gi, (_m, dur) => formatRelativeTime(dur)],

    // 动态用量与数量词
    [/(\d+(?:\.\d+)?)% of the customization budget is available\./g, '自定义预算还剩 $1%。'],
    [/(\d+)\s*agents running/g, '$1 个代理正在运行'],
    [/See all \((\d+)\)/g, '查看全部 ($1)'],
    [/^Send all \((\d+)\)$/g, '全部发送 ($1)'],
    [/Modified in (\d+)\s*(?:projects?|项目)/gi, '已在 $1 个项目中自定义'],
    [/^(\d+)\s*projects?$/i, '$1 个项目'],
    [/Show (\d+)\s*breakdowns?/gi, '显示 $1 个明细'],
    [/Load older messages, showing (\d+) of (\d+)/g, '加载更早的消息，显示 $1 / $2'],
    [/No more older messages, showing (\d+) of (\d+)/g, '没有更早的消息了，显示 $1 / $2'],
    [/showing (\d+) of (\d+)/gi, '显示 $1 / $2'],
    [/^Folder has more than (\d+)\s*files?$/gi, '文件夹包含超过 $1 个文件'],
    [/^(\d+)\s*files?\s+changed$/gi, '$1 个文件已更改'],
    [/(\d+) files?, (\d+) folders?/gi, '$1 个文件, $2 个文件夹'],
    [/(\d+) files?, (\d+) searches?/gi, '$1 个文件, $2 次搜索'],
    [/^(\d+)\s*folders?$/gi, '$1 个文件夹'],
    [/^(\d+)\s*files?$/gi, '$1 个文件'],
    [/^(\d+)\s*searches?$/gi, '$1 次搜索'],
    [/^(\d+)\s*search\b$/gi, '$1 次搜索'],
    [/^(\d+)\s*tokens?$/gi, '$1 个 Token'],
    [/^(\d+)d$/g, '$1天'],
    [/^(\d+)m$/g, '$1分钟'],
    [/^(\d+)s$/g, '$1秒'],

    // 动态下拉与控件参数
    [/Toggle Agent(\s*\([^)]+\))?/g, '切换智能体$1'],
    [/^Toggle (.+)$/g, '切换 $1'],
    [/^(\d+)\s*mo$/gi, '$1 个月前'],
    [/^See (\d+) more$/g, '查看其余 $1 个'],
    [/^Install (.+)$/g, '安装 $1'],
    [/^More actions for (.+)$/g, '$1 的更多操作'],
    [/Select (Next|Previous) (Conversation|对话)/g, (_m, dir) => `选择${dir === 'Next' ? '下一个' : '上一个'}对话`],
    [/^Select model, current: (.+)$/g, (_m, name) => '选择模型，当前：' + name.replace(/\b(High|Medium|Low)\b/g, (label) => phrases.get(label) ?? label)],
    [/^Select project, current: (.+)$/g, (_m, name) => '选择项目，当前：' + (matchExactPhrase(name) ?? name)],
    [/^Agent permissions preset selector, current: (.+)$/g, (_m, name) => '智能体权限预设选择器，当前：' + (matchExactPhrase(name) ?? name)],
    [/^Inherits your (?:Global Permissions|全局权限) when working in these conversations\.$/g, '在这些对话中工作时继承您的全局权限。'],
    [/^(Rules|Skills): (\d+) tokens$/g, (_m, type, count) => `${type === 'Rules' ? '规则' : '技能'}：${count} 个 Token`],
    [/Your Plan:\s*(.+)/g, '你的套餐：$1'],
    [/Autocomplete Speed:\s*(.+)/g, '补全速度: $1'],
    [/Send feedback as (.+)/g, '以 $1 发送反馈'],
    [/Gemini ([^(]+) \((High|Medium|Low)\)/g, (_match, model, effort) => {
      const efforts = { High: '高', Medium: '中', Low: '低' };
      return 'Gemini ' + model.trim() + ' (' + (efforts[effort] ?? effort) + ')';
    }],
    [/^(Learn more|了解更多) about\s*(.+)$/g, '了解更多关于 $2'],
  ];

  const patternsPost = [
    // 动态选项与操作
    [/^([^\x00-\xff]+)\s+options$/gi, '$1 选项'],
    [/^(?:(\b(?:Overview|Review|Terminal|Console|Output|Problems|Debug)\b)|([^\x00-\xff]+))\s+tab$/gi, '$1$2 标签页'],
    [/(?:刷新|Refresh)\s*MCP\s*servers?/gi, '刷新 MCP 服务器'],
    [/\btokens\)/gi, 'Token)'],
    // 量词与时间单位补齐（仅在已含中文的半翻译文本中补齐单位，避免破坏未知英文长句）
    [/(\d+)\s*搜索/g, '$1 次搜索'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*days?\b/gi, '$1 天'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*hours?\b/gi, '$1 小时'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*minutes?\b/gi, '$1 分钟'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*seconds?\b/gi, '$1 秒'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*weeks?\b/gi, '$1 周'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*months?\b/gi, '$1 个月'],
    [/(?<=[\u4e00-\u9fff][^\n]*?)(\d+)\s*years?\b/gi, '$1 年'],

    // 模型可用性与公告提示（模型名原样保留；日期由 translate 第 6 步统一转为中文格式）
    [/^([\w .-]+?) is now available on paid Pro and Ultra plans\. Third-party model access will no longer be available on your current plan starting on (.+?)\.$/gi, (_m, model, date) => `${model} 已面向付费 Pro 与 Ultra 套餐开放。自 ${date} 起，您当前使用的套餐将不再提供第三方模型访问。`],
    [/^([\w .-]+?) is currently available to Ultra and paid Pro plan subscribers\.$/gi, (_m, model) => `${model} 目前仅向 Ultra 及付费 Pro 套餐订阅用户开放。`],
    [/^GPT-OSS will be removed from Antigravity on (.+?)\.$/gi, (_m, date) => `GPT-OSS 将于 ${date} 从 Antigravity 中移除。`],
  ];

  function replacePhrase(value, source, target) {
    const pattern = getPhraseRegex(source);
    return value.replace(pattern, target);
  }

  // 核心翻译流水线：精准完全匹配优先 -> 动态进度栏 -> 长句及复合短语子串 -> 动态变量规则
  function translate(value) {
    if (!value || !/[A-Za-z]/.test(value)) return value;
    if (customTranslations.size) {
      const whole = value.trim();
      if (customOutputs.has(whole)) return value;
      const custom = customTranslations.get(whole.toLowerCase());
      if (custom !== undefined) return custom ? value.replace(whole, () => custom) : value;
    }
    // 项目名称属于数据；完整删除模板须先于通用词条处理。
    // 观察器重处理译文时，也不能改写名称中的英文。
    if (/^永久删除项目“[\s\S]*”及其中的 \d+ 个活跃对话。$/.test(value.trim())) return value;
    const deletion = value.trim().match(/^Permanently delete ([\s\S]+) including (\d+) active conversations?\.$/);
    if (deletion) return value.replace(value.trim(), () => `永久删除项目“${deletion[1]}”及其中的 ${deletion[2]} 个活跃对话。`);
    const permission = translatePermission(value);
    if (permission !== null) return permission;
    const trimmed = value.trim();

    // 市场分类与插件名称是变量，仅转换明确的控件模板。
    const marketAction = trimmed.match(/^(See more in|Details for) (.+)$/);
    if (marketAction) {
      const name = matchExactPhrase(marketAction[2]) ?? marketAction[2];
      const label = marketAction[1] === 'See more in' ? `查看更多：${name}` : `查看详情：${name}`;
      return value.replace(trimmed, () => label);
    }
    if (/^(?:查看更多|查看详情)：/.test(trimmed)) return value;

    // 快捷键说明中的按键和动作可能包含用户配置；只翻译已知动作，原样保留按键。
    const shortcut = trimmed.match(/^(Shortcut|Remove shortcut) (.+?) for (.+)$/);
    if (shortcut) {
      const action = matchExactPhrase(shortcut[3]) ?? shortcut[3];
      return value.replace(trimmed, () => `${shortcut[1] === 'Shortcut' ? '快捷键' : '移除快捷键'} ${shortcut[2]}：${action}`);
    }
    const addShortcut = trimmed.match(/^Add shortcut for (.+)$/);
    if (addShortcut) return value.replace(trimmed, () => `添加快捷键：${matchExactPhrase(addShortcut[1]) ?? addShortcut[1]}`);
    if (/^(?:快捷键|移除快捷键|添加快捷键)[： ]/.test(trimmed)) return value;

    // 首页问候语的用户名是用户数据，先整体处理并在重复扫描时保持不变。
    const greeting = trimmed.match(/^Hi ([\s\S]+?), what can we get done today\?$/);
    if (greeting) return value.replace(trimmed, () => `你好，${greeting[1]}，今天想完成什么？`);
    if (/^你好，[\s\S]+，今天想完成什么？$/.test(trimmed)) return value;

    // 启动浮窗中的发行版名称也属于变量，不能交给数量/短语规则改写。
    let wsl;
    if ((wsl = trimmed.match(/^Setting up WSL: ([\s\S]+)$/))) return value.replace(trimmed, () => '正在设置 WSL：' + wsl[1]);
    if ((wsl = trimmed.match(/^Installing into ([\s\S]+)…$/))) return value.replace(trimmed, () => '正在安装到 ' + wsl[1] + '…');
    if (/^(正在设置 WSL：|正在安装到 )/.test(trimmed)) return value;

    // 1. 精准完全匹配（独立按钮、菜单项、短词、快捷键与标点，彻底杜绝短词在未知长句中途破坏）
    const exact = matchExactPhrase(trimmed);
    if (exact) {
      return value.replace(trimmed, exact);
    }

    // 时间筛选完整翻译，兼容旧词库已经留下的 "Last 7 天" 等半翻译标签。
    const recentDays = trimmed.match(/^Last\s+(\d+)\s*(?:days?|天)$/i);
    if (recentDays) return value.replace(trimmed, () => `最近 ${recentDays[1]} 天`);

    // 2. 动态任务进度栏解析（例如 "Exploring files, running commands ⌵"）
    const progress = translateAgentProgress(value);
    if (progress) {
      return progress;
    }

    // 3. 长句及复合短语子串匹配（仅长度 > 15 的词条允许子串替换，短词禁止中途单点替换）
    let next = value;
    for (const [source, target] of sortedPhrases) {
      if (source.length > 15) {
        next = replacePhrase(next, source, target);
      }
    }

    // 4. 处理动态变量与模板规则
    for (const [pattern, target] of dynamicPatterns) {
      next = next.replace(pattern, target);
    }

    // 5. 后置微调与插值收尾
    for (const [pattern, target] of patternsPost) {
      next = next.replace(pattern, target);
    }

    // 6. 已含中文的译文中，英文日期统一转为“年 月 日”（新增带日期的规则无需单独处理）
    if (/[\u4e00-\u9fff]/.test(next)) next = localizeEnglishDates(next);

    return next;
  }

  function shouldSkipSubtree(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;

    // 跳过代码与编辑区（textarea 放到下方输入区规则中，保留自身 placeholder/aria-label 翻译）
    if (element.closest('script, style, code, pre, .xterm, .monaco-editor, [data-agy-hans-ui]')) {
      return true;
    }

    // 跳过输入框与文本域的正文/子节点，但允许元素自身属性（placeholder、aria-label）翻译
    if (node.nodeType === Node.TEXT_NODE) {
      if (element.closest('[contenteditable]:not([contenteditable="false"]), input, textarea')) {
        return true;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const parent = node.parentElement;
      if (parent && parent.closest('[contenteditable]:not([contenteditable="false"]), input, textarea')) {
        return true;
      }
    }

    // 跳过会话标题与面包屑（用户或模型生成的自定义会话名）
    if (element.closest('[data-testid="breadcrumb-segment"], nav [class*="breadcrumb"]')) {
      return true;
    }

    // 跳过用户输入
    if (element.closest('[data-testid="user-input-step"], [aria-label="User message"], [aria-label="用户消息"]')) {
      return true;
    }

    return false;
  }

  function shouldSkip(node) {
    if (shouldSkipSubtree(node)) return true;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;

    // 跳过侧边栏会话历史列表中的会话名称（保留行内操作按钮）
    const historyItem = element.closest('[data-testid="conversation-row-sidebar"], [data-cascade-id], .past-conversations, .conversation-list, .history-list, .conversations-list, [data-testid="history-list"], [data-testid="past-conversations"], .conversation-item, .convo-item, .history-item, [class*="history-item"], [class*="convo-item"]');
    if (historyItem) {
      const isActionBtn = element.closest('button[aria-label], button[title], [class*="delete"], [class*="pin"], [class*="archive"]');
      const isHistoryMeta = node.nodeType === Node.TEXT_NODE && element.closest('span.text-xs');
      if (!isActionBtn && !isHistoryMeta) return true;
    }

    // 跳过回复正文（保留控件、折叠步骤栏、变更概览与系统提示卡片）
    const agentResponse = element.closest('[aria-label="Agent response"], [aria-label="智能体回复"]');
    if (agentResponse) {
      if (node.nodeType === Node.ELEMENT_NODE && element === agentResponse) return false;
      const isInteractive = element.closest('button, [role="button"], [class*="action"], [class*="button-container"], [data-testid="cleared-step-notice"], .files-changed-header');
      if (!isInteractive) return true;
    }

    return false;
  }

  const antigravityContainerSelector = [
    '[class*="antigravity"]',
    '[id*="antigravity"]',
    '[class*="jetski"]',
    '[id*="jetski"]',
    '.client-experience-pill',
    '.diff-hunk-widget',
    '.keep-changes',
    '.discard-changes',
    '.monaco-dialog-box',
    '.dialog-box',
    '[role="dialog"]',
    '.inline-chat-widget',
    '.inline-chat-overflow',
    '.monaco-hover',
    '.monaco-hover-content',
    '.context-view',
    '.monaco-select-box',
    '.monaco-menu',
    '.quick-input-widget',
    '.notification-toast',
    '.notifications-toasts',
    // VS Code/Antigravity IDE 设置页是异步渲染的，页面本身不一定带有
    // antigravity/jetski 类名；显式纳入设置容器，避免 Settings 页面被白名单过滤。
    '.settings-editor',
    '.settings-body',
    '[class*="settings"]',
    '[id*="settings"]',
    '#workbench\\.parts\\.titlebar .titlebar-right',
    '#workbench\\.parts\\.titlebar .action-label',
    '#workbench\\.parts\\.titlebar .action-nudge-button',
    '.antigravity-welcome-container',
    '[class*="welcome"]',
    '[class*="agent"]',
    '[id*="agent"]',
    // 状态栏与辅助栏标题属原生外壳，不带 antigravity 类名
    '.part.statusbar',
    '.statusbar-item',
    '.part.auxiliarybar .composite.title',
    '.part.auxiliarybar .title-label',
    // 输入框补全等弹层挂在 body 下，和 .monaco-workbench 同级
    '.monaco-workbench ~ div',
    '[role="listbox"]',
    '[role="option"]'
  ].join(', ');

  function isInAntigravityContainer(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;

    // 主窗口白名单
    const isMainWindow = window.location.pathname.endsWith('workbench.html') ||
      window.location.href.indexOf('/workbench.html') >= 0 ||
      window.location.href.indexOf('\\workbench.html') >= 0;
    if (!isMainWindow) return true;

    return !!element.closest(antigravityContainerSelector);
  }

  // React 把部分说明文案拆成多个文本节点，按中文语序重写各节点以保留行内链接。
  const composedSentences = [
    {
      // 空状态标题可能被 React 拆成三个节点：No / Automations / yet。
      match: /^(?:No|否)\s+(?:Automations|自动化)\s+yet$/i,
      nodes: new Map([
        ['No', '暂无'], ['否', '暂无'], ['yet', ''],
      ]),
    },
    {
      match: /^Also includes (?:Global Permissions|全局权限) when working in these conversations\./,
      nodes: new Map([
        ['Also includes', '在这些对话中工作时，还包括'],
        ['when working', ''],
        ['in these conversations', ''],
        ['.', '。'],
      ]),
    },
    {
      match: /^Also includes (?:Global Permissions|全局权限) when working in this project\.(?: (?:Learn more\.|了解更多[。.]?))?$/,
      nodes: new Map([
        ['Also includes', '在此项目中工作时，还包括'],
        ['when working', ''],
        ['in this project', ''],
        ['.', '。'],
        ['when working in this project.', '。'],
      ]),
    },
    {
      match: /^Select one of the (?:two|three) options\. Agent settings and permissions can be further customized below\./,
      nodes: new Map([
        ['Select one of the', '选择以下'],
        ['two', '两'],
        ['three', '三'],
        ['options. Agent settings and permissions can be further customized below.', '项之一。智能体设置和权限可在下方进一步自定义。'],
      ]),
    },
  ];

  function translateComposedElement(element) {
    // 组合句都至少需要 3 个文本节点；叶子元素直接跳过，避免读取整棵子树的 textContent。
    if (!element.childNodes || element.childNodes.length < 3) return false;
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    const rule = composedSentences.find((item) => item.match.test(text));
    if (!rule) return false;
    for (const child of element.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const key = (child.nodeValue || '').trim();
      if (!key) {
        // 中文句子不保留节点间空白
        if (child.nodeValue) writeText(child, '');
        child.__zh_patched = true;
        continue;
      }
      if (!rule.nodes.has(key)) continue;
      writeText(child, rule.nodes.get(key));
      child.__zh_patched = true;
    }
    return true;
  }

  function translateElement(element) {
    if (shouldSkip(element)) return;
    if (!isInAntigravityContainer(element)) return;
    translateComposedElement(element);
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = element.getAttribute?.(attr);
      if (!value) continue;
      const translated = translate(value);
      if (translated !== value) writeAttr(element, attr, translated);
    }
  }

  function translateNode(root) {
    if (!root) return;
    if (shouldSkipSubtree(root)) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (shouldSkip(root)) return;
      if (!isInAntigravityContainer(root)) return;
      if (root.__zh_patched) return;
      const val = root.nodeValue || '';
      const translated = translate(val);
      if (translated !== val) writeText(root, translated);
      root.__zh_patched = true;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (!root.__zh_patched && !shouldSkip(root)) {
        // 节点可能先被插入、后被 React/Vue 补上容器 class。未处于目标容器时
        // 不能标记为已处理，否则后续容器就绪后不会再翻译它的子树。
        if (isInAntigravityContainer(root)) {
          translateElement(root);
          root.__zh_patched = true;
        }
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (shouldSkip(node)) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        if (!isInAntigravityContainer(node)) continue;
        if (node.__zh_patched) continue;
        const val = node.nodeValue || '';
        const translated = translate(val);
        if (translated !== val) writeText(node, translated);
        node.__zh_patched = true;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.__zh_patched) continue;
        if (!isInAntigravityContainer(node)) continue;
        translateElement(node);
        node.__zh_patched = true;
      }
    }
  }

  // 把同一轮内的多个变更批次累积到一个定时器，避免每个 MutationObserver 回调各建一个 timer。
  function createFlushScheduler(flush) {
    let timer = null;
    let nodes = [];
    let elements = [];
    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      nodes = [];
      elements = [];
    };
    const schedule = (newNodes, newElements) => {
      for (const node of newNodes) nodes.push(node);
      for (const element of newElements) elements.push(element);
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const batchNodes = nodes;
        const batchElements = elements;
        nodes = [];
        elements = [];
        flush(batchNodes, batchElements);
      }, 0);
    };
    return { schedule, cancel };
  }

  function applyChinese(resetMarks) {
    if (originalDocLang === null) originalDocLang = document.documentElement.lang || '';
    document.documentElement.lang = 'zh-CN';
    if (resetMarks) {
      const stale = document.createTreeWalker(document, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = stale.nextNode(); node; node = stale.nextNode()) node.__zh_patched = false;
    }
    translateNode(document);
  }

  function setLang(next, persist = true) {
    next = next === 'en' ? 'en' : 'zh';
    if (cancelled || next === lang) return;
    lang = next;
    if (persist) {
      try { window.localStorage?.setItem(LANG_KEY, next); } catch (_e) { /* ignore */ }
    }
    if (next === 'en') {
      flushScheduler?.cancel();
      restoreOriginals();
      if (originalDocLang !== null) document.documentElement.lang = originalDocLang;
    } else {
      applyChinese(true);
    }
    updateToggleUI();
  }

  // ===== 悬浮切换按钮（可拖动，位置与语言偏好保存在 localStorage） =====
  let toggleButton = null;

  function updateToggleUI() {
    if (!toggleButton) return;
    // 按钮显示“点击后将切换到的语言”
    toggleButton.textContent = lang === 'zh' ? 'EN' : '中';
    const tip = lang === 'zh' ? 'Switch to English (Antigravity-Hans)' : '切换为中文（Antigravity-Hans）';
    toggleButton.title = tip;
    toggleButton.setAttribute('aria-label', tip);
  }

  function mountToggleUI() {
    if (toggleButton || !document.body) return;
    if (/^data:/i.test(window.location.href)) return; // 启动闪屏页不放按钮
    try { if (window.top !== window) return; } catch (_e) { return; } // 仅顶层窗口

    const SIZE = 30;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-agy-hans-ui', '');
    Object.assign(btn.style, {
      position: 'fixed', zIndex: '2147483647', width: SIZE + 'px', height: SIZE + 'px',
      padding: '0', margin: '0', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.28)',
      background: 'rgba(32,33,36,0.72)', color: '#fff', font: '600 12px/1 system-ui, -apple-system, sans-serif',
      cursor: 'pointer', opacity: '0.45', userSelect: 'none', touchAction: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'opacity .15s', webkitAppRegion: 'no-drag',
    });
    btn.style.setProperty('-webkit-app-region', 'no-drag');

    const clamp = (v, max) => Math.max(4, Math.min(v, max - SIZE - 4));
    const placeAt = (left, top) => {
      btn.style.left = clamp(left, window.innerWidth) + 'px';
      btn.style.top = clamp(top, window.innerHeight) + 'px';
      btn.style.right = btn.style.bottom = 'auto';
    };
    let saved = null;
    try { saved = JSON.parse(window.localStorage?.getItem(POS_KEY) || 'null'); } catch (_e) { /* ignore */ }
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) placeAt(saved.left, saved.top);
    else placeAt(window.innerWidth - SIZE - 16, window.innerHeight - SIZE - 72);

    const onEnter = () => { btn.style.opacity = '1'; };
    const onLeave = () => { if (!drag) btn.style.opacity = '0.45'; };
    let drag = null;
    const onDown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY, moved: false };
      try { btn.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
    };
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      placeAt(e.clientX - drag.dx, e.clientY - drag.dy);
    };
    const onUp = (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      try { btn.releasePointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
      e.stopPropagation();
      if (moved) {
        try {
          window.localStorage?.setItem(POS_KEY, JSON.stringify({ left: parseFloat(btn.style.left), top: parseFloat(btn.style.top) }));
        } catch (_e) { /* ignore */ }
      } else {
        setLang(lang === 'zh' ? 'en' : 'zh');
      }
    };
    // 键盘（Enter / 空格）触发的 click 的 detail 为 0；鼠标点击已在 pointerup 中处理
    const onClick = (e) => { e.stopPropagation(); if (e.detail === 0) setLang(lang === 'zh' ? 'en' : 'zh'); };
    const onResize = () => placeAt(parseFloat(btn.style.left), parseFloat(btn.style.top));
    // 其他窗口切换语言时同步（同源页面共享 localStorage）
    const onStorage = (e) => { if (e.key === LANG_KEY) setLang(e.newValue, false); };

    btn.addEventListener('pointerenter', onEnter);
    btn.addEventListener('pointerleave', onLeave);
    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    window.addEventListener('storage', onStorage);

    document.body.appendChild(btn);
    toggleButton = btn;
    updateToggleUI();
    removeToggleUI = () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('storage', onStorage);
      btn.remove();
      toggleButton = null;
      if (window.__antigravityZhSetLang === setLang) delete window.__antigravityZhSetLang;
    };
  }

  function run() {
    if (cancelled) return;
    // 词库或自定义翻译名单更新时，先还原旧实例写入的译文再按新规则重译，否则已是中文的文本回不到英文
    if (updating) restoreOriginals();
    if (lang === 'zh') applyChinese(updating);
    // 控制台可用：__antigravityZhSetLang('en') / __antigravityZhSetLang('zh')
    window.__antigravityZhSetLang = setLang;

    flushScheduler = createFlushScheduler((batchNodes, batchElements) => {
      if (cancelled || lang !== 'zh') return;
      for (const node of batchNodes) translateNode(node);
      for (const element of batchElements) translateElement(element);
    });

    observer = new MutationObserver((mutations) => {
      // 应用若整体重建 body，把切换按钮挂回去
      if (toggleButton && !toggleButton.isConnected && document.body) document.body.appendChild(toggleButton);
      if (lang !== 'zh') return;
      const nodesToTranslate = [];
      const elementsToTranslate = [];

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const target = mutation.target;
          target.__zh_patched = false;
          nodesToTranslate.push(target);
        } else if (mutation.type === 'attributes') {
          const target = mutation.target;
          target.__zh_patched = false;
          // 容器身份变化时要重新扫描整个子树；仅翻译属性本身会漏掉此前
          // 因未命中白名单而尚未处理的 Settings 子节点。
          if (mutation.attributeName === 'class' || mutation.attributeName === 'id' ||
              mutation.attributeName === 'role' || mutation.attributeName === 'data-testid') {
            nodesToTranslate.push(target);
          } else {
            elementsToTranslate.push(target);
          }
        } else {
          for (const node of mutation.addedNodes) {
            nodesToTranslate.push(node);
          }
        }
      }

      if (nodesToTranslate.length > 0 || elementsToTranslate.length > 0) {
        flushScheduler.schedule(nodesToTranslate, elementsToTranslate);
      }
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      // 监听容器身份变化。Settings 页面经常先挂载空节点，再异步补 class/id。
      attributeFilter: ['aria-label', 'title', 'placeholder', 'alt', 'class', 'id', 'role', 'data-testid'],
    });
    mountToggleUI();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
