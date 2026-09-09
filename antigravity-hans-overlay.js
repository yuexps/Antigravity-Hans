(() => {
  if (typeof window === 'undefined') return;
  if (window.__antigravityZhPatchInstalled === true && window.__observedDocument === document) return;
  window.__antigravityZhPatchInstalled = true;
  window.__observedDocument = document;

  const phrases = new Map([
    ['Provides a comprehensive guide, quick reference, and sitemap for Google Antigravity (AGY), including the Antigravity CLI (agy), Antigravity 2.0, Antigravity IDE, Python SDK, slash commands, keybindings, and customizations (skills, rules, MCP, sidecars). Activate this skill when the user asks questions about how to use, configure, or customize Antigravity, AGY, the agy CLI, the Antigravity IDE, or Antigravity 2.0.', '提供 Google Antigravity (AGY) 的全面指南、快速参考与站点地图，包括 Antigravity CLI (agy)、Antigravity 2.0、Antigravity IDE、Python SDK、斜杠命令、快捷键及自定义项（技能、规则、MCP、Sidecar）。当用户询问如何使用、配置或自定义 Antigravity、AGY、agy CLI、Antigravity IDE 或 Antigravity 2.0 时激活此技能。'],
    ['Within each group, models share a weekly limit and a 5-hour limit. Quota is consumed proportionally to the cost of the tokens. Thus, limits will last longer with shorter tasks or using more cost-effective models. The 5-hour limit smooths out aggregate demand to fairly distribute global capacity across all users, while your weekly limit is tied directly to your individual tier.', '在每个分组中，模型共享每周限额和 5 小时限额。额度的消耗与 Token 的成本成比例。因此，使用较短的任务或更具性价比的模型可以让限额维持更久。5 小时限额平滑了总体需求，以便在所有用户之间公平地分配全局容量，而您的每周限额则直接与您的个人套餐等级挂钩。'],
    ['When enabled, Agent can use browser tools to open URLs, read web pages, and interact with browser content. This allows the Agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.', '启用后，智能体可以使用浏览器工具打开 URL、读取网页并与浏览器内容交互。这能让智能体获取重要知识和验证方式，但任何浏览器集成都可能增加遭受外部恶意利用的风险。'],
    ['When enabled, your UI will be slightly modified to ensure more consistent demos. This is only recommended for demo purposes. In most cases, you can run "Antigravity: Start Demo Mode" and "Antigravity: Stop Demo Mode" to control this switch and update your ~/.gemini/antigravity data directory.', '启用后，您的界面将稍作修改以确保演示的一致性。仅建议用于演示目的。在大多数情况下，您可以运行 “Antigravity: Start Demo Mode” 和 “Antigravity: Stop Demo Mode” 来控制此开关并更新您的 ~/.gemini/antigravity 数据目录。'],
    ['Agent auto-executes commands matched by an allow list entry. For Unix shells, an allow list entry matches a command if its space-separated tokens form a prefix of the command\\\'s tokens. For PowerShell, the entry tokens may match any contiguous subsequence of the command tokens.', '智能体将自动执行与允许列表条目匹配的命令。对于 Unix Shell，如果允许列表条目的空格分隔令牌是该命令令牌的前缀，则匹配。对于 PowerShell，条目令牌可匹配命令令牌的任意连续子序列。'],
    ['Comprehensive guide and reference for the Antigravity Customization System. Use to explain how customizations work, their loading priority, discovery mechanisms, and to guide the creation of skills, rules, plugins, hooks, and MCP servers.', 'Google Antigravity 自定义系统的全面指南与参考。用于解释自定义项的工作原理、加载优先级、发现机制，并指导技能、规则、插件、钩子及 MCP 服务器的创建。'],
    ['Show a floating notification card when background conversations need your input. Answer questions, approve commands, and grant permissions without leaving your current conversation. Share feedback at go/inline-actions-feedback.', '当后台对话需要您输入时显示浮动通知卡片。无需离开当前对话即可回答问题、批准命令和授予权限。可在 go/inline-actions-feedback 分享反馈。'],
    ['When toggled on, Antigravity IDE will use your AI credits to fulfill model requests once you\\\'re out of model quota. Antigravity IDE will always use your model quota first before using AI credits.', '开启后，当模型额度用完时，Antigravity IDE 将使用 AI 积分完成模型请求。Antigravity IDE 始终会先使用模型额度，再使用 AI 积分。'],
    ['When toggled on, Antigravity IDE will use your AI credits to fulfill model requests once you\'re out of model quota. Antigravity IDE will always use your model quota first before using AI credits.', '开启后，当模型额度用完时，Antigravity IDE 将使用 AI 积分完成模型请求。Antigravity IDE 始终会先使用模型额度，再使用 AI 积分。'],
    ['When toggled on, Antigravity will use your AI credits to fulfill model requests once you\\\'re out of model quota. Antigravity will always use your model quota first before using AI credits.', '开启后，当模型额度用完时，Antigravity 将使用 AI 积分完成模型请求。Antigravity 始终会先使用模型额度，再使用 AI 积分。'],
    ['Agent asks for permission before executing commands matched by a deny list entry. The deny list follows the same matching rules as the allow list and takes precedence over the allow list.', '在执行与拒绝列表条目匹配的命令前，智能体会先请求权限。拒绝列表遵循与允许列表相同的匹配规则，且优先级高于允许列表。'],
    ['When toggled on, Antigravity will use your AI credits to fulfill model requests once you\'re out of model quota. Antigravity will always use your model quota first before using AI credits.', '开启后，当模型额度用完时，Antigravity 将使用 AI 积分完成模型请求。Antigravity 始终会先使用模型额度，再使用 AI 积分。'],
    ['View your available model quota and AI credits. Model quota refreshes periodically based on your plan. Enable AI Credit Overages to continue using models when your quota is exhausted.', '查看可用的模型额度和 AI 积分。模型额度会根据你的计划定期刷新。启用 AI 积分超额使用后，可在额度耗尽时继续使用模型。'],
    ['The breakdown below shows token usage from customizations like skills, rules, and MCP. If the budget is exceeded, large customizations will be truncated automatically.', '下面的明细展示技能、规则和 MCP 等自定义内容的 Token 使用量。如果超出预算，较大的自定义内容会被自动截断。'],
    ['Allow Tab to view and edit the files in .gitignore. Use with caution if your .gitignore lists files containing credentials, secrets, or other sensitive information.', '允许 Tab 键查看和编辑 .gitignore 中的文件。如果您的 .gitignore 列出了包含凭据、机密或其他敏感信息的文件，请谨慎使用。'],
    ['Orchestrates Android development tasks including project creation, deployment, SDK management, and environment diagnostics using the `android` command-line tool.', '使用 android 命令行工具协调 Android 开发任务，包括项目创建、部署、SDK 管理和环境诊断。'],
    ['Configure the browser subagent. It requires Google Chrome to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.', '配置浏览器子智能体。它需要安装 Google Chrome。你可以在对话输入框中输入 /browser 来调用浏览器子智能体。'],
    ['Please describe the issue in detail. The more actionable your feedback, the quicker our team can address your request. Some helpful information includes:', '请详细描述问题。您的反馈越具体，我们的团队就能越快处理您的请求。一些有用的信息包括：'],
    ['When enabled, the agent will be able to access its knowledge base to inform its responses and automatically generate knowledge items in the background.', '启用后，智能体将能够访问其知识库以辅助生成回复，并在后台自动生成知识项。'],
    ['Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.', '当有新版本可用时，自动提示您重启应用。禁用后，您可以从应用菜单中手动检查更新。'],
    ['Changes the base URL for marketplace search results. You must restart Antigravity IDE to use the new marketplace after changing this value.', '更改插件市场搜索结果的基准 URL。更改此值后，您必须重启 Antigravity IDE 才能使用新的插件市场。'],
    ['Specifies Agent\\\'s behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.', '指定智能体在请求审核产物时的行为。产物是智能体创建的文档，用于提供更丰富的对话体验。'],
    ['Specifies Agent\'s behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.', '指定智能体在请求审核产物时的行为。产物是智能体创建的文档，用于提供更丰富的对话体验。'],
    ['Note: A change to this setting will only apply to new messages sent to Agent. In-progress responses will use the previous setting value.', '注意：对此设置的更改将仅适用于发送给智能体的新消息。正在进行的回复将使用之前的设置值。'],
    ['Changes the base URL for marketplace search results. You must restart Antigravity to use the new marketplace after changing this value.', '更改插件市场搜索结果的基准 URL。更改此值后，您必须重启 Antigravity 才能使用新的插件市场。'],
    ['Changes the base URL on each extension page. You must restart Antigravity IDE to use the new marketplace after changing this value.', '更改每个插件页面的基准 URL。更改此值后，您必须重启 Antigravity IDE 才能使用新的插件市场。'],
    ['Changes the base URL on each extension page. You must restart Antigravity to use the new marketplace after changing this value.', '更改每个插件页面的基准 URL。更改此值后，您必须重启 Antigravity 才能使用新的插件市场。'],
    ['When enabled, Agent is given awareness of lint errors created by its edits and may fix them without explicit user prompting.', '启用后，智能体将感知到其编辑所导致的 Lint 错误，并可在不明确提示用户的情况下进行修复。'],
    ['Choose a predefined security preset for the agent. This controls terminal auto-execution policy, and file access policy.', '为智能体选择预设安全策略。它会控制终端自动执行策略和文件访问策略。'],
    ['Custom path for the browser user profile directory. Leave empty for default (~/.gemini/antigravity-browser-profile).', '浏览器用户资料目录的自定义路径。留空则使用默认路径（~/.gemini/antigravity-browser-profile）。'],
    ['You currently don\\\'t have any MCP Servers installed. Add an MCP server above or add a custom one via the MCP Config.', '您当前还没有安装任何 MCP 服务器。请在上方添加 MCP 服务器，或通过 MCP 配置文件添加自定义服务器。'],
    ['When enabled, \\\'Explain and Fix\\\' actions will continue in the current conversation instead of starting a new one.', '启用后，“解释并修复”操作将在当前对话中继续，而不是开始新对话。'],
    ['The app will be accessible from the menu bar and will keep running in the background when all windows are closed.', '应用可从菜单栏访问，并会在所有窗口关闭后继续在后台运行。'],
    ['Reliable automation, in-depth debugging, and performance analysis in Chrome using Chrome DevTools and Puppeteer', '使用 Chrome DevTools 和 Puppeteer 在 Chrome 中进行可靠的自动化、深度调试和性能分析'],
    ['We recommend attaching logs. Attaching logs will help the Antigravity team act on and prioritize your feedback.', '我们建议附上日志。附上日志将有助于 Antigravity 团队处理并优先解决您的反馈。'],
    ['When enabled, the Changes Overview toolbar will automatically expand when Agent finishes generating a response.', '启用后，Changes Overview 工具栏将在智能体完成回复生成时自动展开。'],
    ['Projects serve as your workspace where your agents work. Each project has its own file scope and permissions. ', '项目是智能体工作的工作区。每个项目都有自己的文件范围和权限。'],
    ['Agents run in a secure sandbox that restricts access to external resources outside of your trusted folders.', '智能体会在安全沙盒中运行，限制其访问受信任文件夹之外的外部资源。'],
    ['Prototype, build & run modern apps users love with Firebase\\\'s backend, AI, and operational infrastructure.', '利用 Firebase 的后端、AI 和运营基础设施，原型设计、构建和运行深受用户喜爱的现代应用。'],
    ['Terminal commands always require review and the agent cannot access files outside of its given workspaces.', '终端命令始终需要审核，且智能体无法访问其给定工作区之外的文件。'],
    ['Developer-only tools. These settings are stored locally in this browser and do not affect other users.', '仅限开发者工具。这些设置保存在当前浏览器本地，不会影响其他用户。'],
    ['to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.', '安装 Google Chrome。您可以在对话输入框中输入 /browser 来调用浏览器子智能体。'],
    ['When enabled, Agent will use IDE\\\'s shell integration to detect and report terminal command execution.', '启用后，智能体将使用 IDE 的 Shell 集成来检测并报告终端命令的执行。'],
    ['When enabled, Agent will show browser notifications when user action is needed or execution finishes.', '启用后，当需要用户操作或执行完成时，智能体将显示浏览器通知。'],
    ['When toggled on, Antigravity IDE collects usage data to help Google enhance performance and features.', '开启后，Antigravity IDE 将收集使用数据，以帮助 Google 提升性能和功能。'],
    ['Keep the app accessible from the menu bar and running in the background when all windows are closed.', '在所有窗口关闭后，保持应用可从菜单栏访问并在后台继续运行。'],
    ['Modify scoped permissions, folders, and agent settings like Sandbox and Terminal Command Execution.', '修改作用域权限、文件夹，以及沙盒和终端命令执行等智能体设置。'],
    ['Requires manual review for all terminal commands and file accesses outside of the working folders.', '对于所有工作文件夹之外的终端命令和文件访问，都需要手动审核。'],
    ['When toggled on, Antigravity collects usage data to help Google enhance performance and features.', '开启后，Antigravity 会收集使用数据，帮助 Google 改进性能和功能。'],
    ['Select one of the three options. Agent settings and permissions can be further customized below.', '选择以下三个选项之一。智能体设置和权限可在下方进一步自定义。'],
    ['All terminal commands require review. The agent can read or write to any file in the machine.', '所有终端命令均需要审核。智能体可以读取或写入电脑上的任何文件。'],
    ['Confirm the command is safe to run outside of the sandbox with full network and disk access.', '确认该命令可在沙盒外 safe 运行，并拥有完整网络和磁盘访问权限。'],
    ['Port number for Chrome DevTools Protocol remote debugging. Leave empty for default (9222).', 'Chrome DevTools Protocol 远程调试端口号。留空则使用默认值（9222）。'],
    ['Try out early-stage features before they ship. These may change or be removed at any time.', '在正式发布前试用早期功能。这些功能可能随时更改或移除。'],
    ['When enabled, the agent will be able to access past conversations to inform its responses.', '启用后，智能体将能够访问历史对话以辅助其生成回复。'],
    ['Controls whether the agent can run custom JavaScript to automate complex browser actions.', '控制智能体是否可以运行自定义 JavaScript 来自动化复杂浏览器操作。'],
    ['When enabled, Antigravity will play a sound when Agent finishes generating a response.', '启用后，Antigravity 会在智能体完成回复生成时播放提示音。'],
    ['The browser subagent can be invoked by typing /browser in the conversation input box.', '你可以在对话输入框中输入 /browser 来调用浏览器子智能体。'],
    ['Receive product updates, tips, and promotions from Google Antigravity IDE via email.', '通过电子邮件接收来自 Google Antigravity IDE 的产品更新、技巧和促销活动。'],
    ['Predict the location of your next edit and navigates you there with a tab keypress.', '预测您下一次编辑的位置，并在按下 Tab 键时导航至该处。'],
    ['To modify notification settings, open your operating system\\\'s system preferences.', '要修改通知设置，请打开操作系统的系统设置。'],
    ['To modify notification settings, open your operating system\'s system preferences.', '要修改通知设置，请打开操作系统的系统设置。'],
    ['Receive product updates, tips, and promotions from Google Antigravity via email.', '通过电子邮件接收 Google Antigravity 的产品更新、技巧和促销信息。'],
    ['Configures how the agent tries to access files outside of its working folders.', '配置智能体如何访问工作文件夹之外的文件。'],
    ['You can upgrade to a Google AI Ultra plan to receive the highest rate limits.', '你可以升级到 Google AI Ultra 套餐以获得最高速率限制。'],
    ['Use Add MCP to browse the store, or add a custom server via the MCP config.', '使用“添加 MCP”浏览商店，或通过 MCP 配置文件添加自定义服务器。'],
    ['Google3 chats will be regrouped into their workspaces in the sidebar. See', 'Google3 聊天将在侧边栏中重新按其工作区分组。请参阅'],
    ['Controls whether terminal commands require your approval before running.', '控制终端命令运行前是否需要你的批准。'],
    ['Model must be available on the Gemini API and use the gemini-api scheme.', '模型必须可在 Gemini API 中使用，并使用 gemini-api 模式。'],
    ['options. Agent settings and permissions can be further customized below.', '项之一。智能体设置和权限可在下方进一步自定义。'],
    ['You can upgrade to a Google AI Ultra plan to receive higher rate limits.', '您可以升级到 Google AI Ultra 套餐以获得更高的速率限制。'],
    ['Path to the Chrome/Chromium executable. Leave empty for auto-detection.', 'Chrome/Chromium 可执行文件路径。留空则自动检测。'],
    ['VCS used when generating a new workspace based off your initial prompt.', '根据您的初始提示词生成新工作区时使用的 VCS。'],
    ['Inherits from global settings. Local permissions have higher priority.', '继承全局设置。本地权限优先级更高。'],
    ['Jetski Chat configuration is not available in the current environment.', '当前环境中无法使用 Jetski Chat 配置。'],
    ['Open in current window, Continue conversation in the current workspace', '在当前窗口打开，并在当前工作区继续对话'],
    ['Agent settings and permissions for conversations outside of projects.', '为项目外对话配置智能体设置和权限。'],
    ['Configure a chat bot so you can use Jetski directly from Google Chat.', '配置聊天机器人，以便直接从 Google Chat 使用 Jetski。'],
    ['Google3 chats will be regrouped into their workspaces in the sidebar.', 'Google3 聊天将在侧边栏中重新按其工作区分组。'],
    ['Keep your coding agent up to date with the latest web best practices.', '让您的编码智能体始终与最新的 Web 最佳实践保持同步。'],
    ['Configure agent execution, queued message delivery, and permissions.', '配置智能体执行、排队消息发送以及权限。'],
    ['Allows the agent to access files outside of your current workspace.', '允许智能体访问当前工作区之外的文件。'],
    ['External tools the agent can invoke via the Model Context Protocol.', '智能体可通过模型上下文协议 (MCP) 调用的外部工具。'],
    ['To modify editor settings, open Settings within the editor window.', '要修改编辑器设置，请在编辑器窗口中打开设置。'],
    ['Show "Edit" and "Chat" buttons when selecting text in the editor.', '在编辑器中选择文本时显示“编辑”和“聊天”按钮。'],
    ['Add an MCP server above or add a custom one via the MCP Config.', '在上方添加 MCP 服务器，或通过 MCP 配置添加自定义服务器。'],
    ['Agent settings and permissions can be further customized below.', '智能体设置和权限可在下方进一步自定义。'],
    ['Agents have full access to your machine and external resources.', '智能体可完整访问你的电脑和外部资源。'],
    ['Allow/deny agent write access to specific files or directories.', '允许或拒绝智能体写入指定文件或目录。'],
    ['Configure allowed and denied URLs for browser action execution.', '配置允许和拒绝浏览器执行操作的 URL。'],
    ['Configure tab completion, suggestions, and navigation behavior.', '配置 Tab 补全、建议和导航行为。'],
    ['Highlight newly inserted text after accepting a Tab completion.', '在接受 Tab 补全后高亮显示新插入的文本。'],
    ['Manage settings specific to Google CitC workspaces development.', '管理特定于 Google CitC 工作区开发的设置。'],
    ['Allow/deny agent read access to specific files or directories.', '允许或拒绝智能体读取指定文件或目录。'],
    ['Browse and enable plugins from the Build With Google catalog.', '从 Build With Google 目录中浏览并启用插件。'],
    ['Configure allowed and denied paths for file reads and writes.', '配置允许和拒绝读写的文件路径。'],
    ['External tools the agent can call via Model Context Protocol.', '智能体可通过 Model Context Protocol 调用的外部工具。'],
    ['The agent will wait for you to install the browser extension.', '智能体会等待你安装浏览器扩展。'],
    ['This migration may mess up your settings, chats, and sidebar.', '此迁移可能会影响您的设置、聊天记录和侧边栏。'],
    ['Configure the agent\\\'s visual theme and display preferences.', '配置智能体的视觉主题与显示偏好。'],
    ['Disables all safety barriers for maximal iteration velocity.', '禁用所有安全屏障，以获得最大的迭代速度。'],
    ['Prevent the computer from sleeping while the app is running.', '应用运行时防止电脑进入睡眠。'],
    ['Allow/deny agent browser actuation access to specific URLs.', '允许或拒绝智能体对指定 URL 执行浏览器操作。'],
    ['Configure the agent\'s visual theme and display preferences.', '配置智能体的视觉主题与显示偏好。'],
    ['Manage how Best of N sets up the workspace its arms run in.', '管理 Best of N 如何配置其各分支运行所在的工作区。'],
    ['Open files in the background if Agent creates or edits them', '当智能体创建或编辑文件时，在后台打开这些文件'],
    ['Restricts agent tools to a secure, isolated local sandbox.', '将智能体工具限制在安全隔离的本地沙盒中。'],
    ['Allow/deny agent read access to specific URLs or domains.', '允许或拒绝智能体读取指定 URL 或域名。'],
    ['Configure global allowed and denied resource permissions.', '配置全局允许和拒绝的资源权限。'],
    ['Configure allowed and denied URLs for browser actuation.', '配置允许和拒绝浏览器执行操作的 URL。'],
    ['Core tools and knowledge required to develop for Android', '开发 Android 应用所需的核心工具与知识'],
    ['Allow/deny agent command execution outside the sandbox.', '允许或拒绝智能体在沙盒外执行命令。'],
    ['Manage your plan, credentials, and general preferences.', '管理你的套餐、凭据和通用偏好设置。'],
    ['Allow full browser script execution without prompting.', '允许完整的浏览器脚本执行而无需提示。'],
    ['Configure the maximum width of the conversation panel.', '配置对话面板的最大宽度。'],
    ['for more information (this migration is experimental).', '了解更多信息（此迁移为实验性功能）。'],
    ['Sidebar after conversations are regrouped by workspace', '按工作区分组后的对话侧边栏'],
    ['URLs the agent can perform actions on via the browser.', '智能体可以通过浏览器执行操作的 URL。'],
    ['Configure default behaviors, skills, and MCP servers.', '配置默认行为、技能和 MCP 服务器。'],
    ['Configure external tools via Model Context Protocol.', '配置通过 Model Context Protocol 使用的外部工具。'],
    ['Keyboard shortcuts for quick navigation and control.', '用于快速导航和控制的键盘快捷键。'],
    ['You currently don\\\'t have any MCP Servers installed.', '您当前还没有安装任何 MCP 服务器。'],
    ['Prompt for approval before running browser scripts.', '运行浏览器脚本前请求批准。'],
    ['Quickly add and update imports with a tab keypress.', '按下 Tab 键快速添加和更新导入。'],
    ['Search for MCP servers to add to your configuration', '搜索要添加到配置中的 MCP 服务器'],
    ['Using the Antigravity Python SDK to build AI agents', '使用 Antigravity Python SDK 构建 AI 智能体'],
    ['Configure editor-specific behaviors and shortcuts.', '配置编辑器特有的行为和快捷键。'],
    ['New standalone conversation, outside of projects.', '新建独立对话，不属于任何项目。'],
    ['Display and preserve intermediate thinking steps', '显示并保留中间思考步骤'],
    ['Import feature is not available in this context.', '当前上下文中无法使用导入功能。'],
    ['Require review for all browser script execution.', '所有浏览器脚本执行都需要审核。'],
    ['URLs the agent can actuate on using the browser.', '智能体可通过浏览器执行操作的 URL。'],
    ['Commands the agent can run outside the sandbox.', '智能体可在沙盒外运行的命令。'],
    ['Configure allowed commands outside the sandbox.', '配置允许在沙盒外运行的命令。'],
    ['Curated collection of agent skills for science.', '为科学领域精心挑选的智能体技能集合。'],
    ['Select light, dark, or inherit system settings.', '选择浅色、深色或继承系统设置。'],
    ['URLs the agent can read or open in the browser.', '智能体可以在浏览器中读取或打开的 URL。'],
    ['Configure allowed and denied URLs for reading.', '配置允许和拒绝读取的 URL。'],
    ['Continue conversation in the current workspace', '在当前工作区继续对话'],
    ['Agent needs permission to execute JavaScript', '智能体需要权限才能执行 JavaScript'],
    ['Conversation copied as Markdown to clipboard', '对话已作为 Markdown 复制到剪贴板'],
    ['Please list the steps to reproduce the issue', '请列出复现此问题的步骤'],
    ['Quickly add and update imports with Tab key.', '按下 Tab 键快速添加和更新导入。'],
    ['Search conversations (by name or Cascade ID)', '搜索对话（按名称或 Cascade ID）'],
    ['% of the customization budget is available.', '% 的自定义预算可用。'],
    ['broadcast Go Live, Click to run live server', '广播 Go Live，点击运行实时服务器'],
    ['Configure the browser subagent. It requires', '配置浏览器子智能体。它需要'],
    ['Configure when follow-up messages are sent.', '配置何时发送后续消息。'],
    ['No customizations found for this workspace.', '此工作区没有找到自定义内容。'],
    ['to back up your data and run the migration.', '备份数据并运行迁移。'],
    ['Work with local agents from another device.', '从其他设备连接并使用本地智能体。'],
    ['Antigravity would like to use the browser.', 'Antigravity 想要使用浏览器。'],
    ['Confirmation required to execute this step', '执行此步骤需要确认'],
    ['Folder no longer exists or is unavailable.', '文件夹不再存在或不可用。'],
    ['Show suggestions when typing in the editor', '在编辑器中输入时显示建议'],
    ['Allow Tab to access .gitignore exclusions', 'Tab 键访问 .gitignore 排除文件'],
    ['Ask anything, @ to mention, / for actions', '想问什么都可以，@ 引用，/ 执行动作'],
    ['Interrupt the agent and send immediately.', '打断智能体并立即发送。'],
    ['Configure AI models and view your quota.', '配置 AI 模型并查看额度。'],
    ['Terminal commands the agent can execute.', '智能体可执行的终端命令。'],
    ['Block all browser JavaScript execution.', '阻止所有浏览器 JavaScript 执行。'],
    ['Explain and Fix in Current Conversation', '在当前对话中解释并修复'],
    ['GCP Project ID for enterprise features.', '适用于企业级功能的 GCP 项目 ID。'],
    ['Local permissions have higher priority.', '本地权限优先级更高。'],
    ['Manually customize individual settings.', '手动自定义各项设置。'],
    ['Allow/deny specific terminal commands.', '允许或拒绝指定终端命令。'],
    ['Google Drive integration not available', 'Google 云端硬盘集成不可用'],
    ['No (tell the agent what to do instead)', '否（告诉智能体改做什么）'],
    ['Manage your notification preferences.', '管理您的通知偏好设置。'],
    ['Outside of folders file access policy', '文件夹外访问策略'],
    ['Select where to open the conversation', '选择在哪里打开对话'],
    ['Configure allowed terminal commands.', '配置允许的终端命令。'],
    ['Manage your model quota and credits.', '管理您的模型额度与积分。'],
    ['(tell the agent what to do instead)', '（告诉智能体改做什么）'],
    ['Browser Javascript Execution Policy', '浏览器 JavaScript 执行策略'],
    ['Browser JavaScript Execution Policy', '浏览器 JavaScript 执行策略'],
    ['By using this app, you agree to its', '使用本应用即表示你同意其'],
    ['Describe the bug you encountered...', '描述您遇到的错误...'],
    ['Enter command (e.g., git, blaze)...', '输入命令（例如 git、blaze）...'],
    ['Loading workspace customizations...', '正在加载工作区自定义项...'],
    ['Queue until after the current turn.', '排队直到当前轮次结束后发送。'],
    ['Set how fast Tab suggestions appear', '设置 Tab 建议的显示速度'],
    ['Build with Antigravity IDE Plugins', '使用 Antigravity IDE 插件构建'],
    ['Search for files in the project...', '在项目中搜索文件...'],
    ['Initializing virtual environments', '正在初始化虚拟环境'],
    ['Open Agent panel on window reload', '窗口重新加载时打开智能体面板'],
    ['Manage Antigravity app settings.', '管理 Antigravity 应用设置。'],
    ['Select one of the three options.', '选择以下三个选项之一。'],
    ['Set the speed of tab suggestions', '设置 Tab 建议的显示速度'],
    ['Agent Non-Workspace File Access', '智能体非工作区文件访问'],
    ['Enter file or directory path...', '输入文件或目录路径...'],
    ['Search by name or Cascade ID...', '按名称或 Cascade ID 搜索...'],
    ['Terminal Command Auto Execution', '终端命令自动执行'],
    ['Welcome to the new Antigravity!', '欢迎使用新版 Antigravity！'],
    ['Attach a screenshot (optional)', '附上截图（可选）'],
    ['Attach Antigravity server logs', '附上 Antigravity 服务端日志'],
    ['Attach Antigravity Server Logs', '附上 Antigravity 服务端日志'],
    ['Enable notifications for Agent', '为智能体启用通知'],
    ['Getting started with a Project', '开始使用项目'],
    ['Refresh quota and credits data', '刷新额度和积分数据'],
    ['Terminal & Tooling Permissions', '终端与工具权限'],
    ['Enable Sandbox Mode (Preview)', '启用沙盒模式（预览）'],
    ['New Conversation in Workspace', '在工作区中新建对话'],
    ['Undo changes up to this point', '撤销到此处的更改'],
    ['Allow List Terminal Commands', '终端命令允许列表'],
    ['Auto-Expand Changes Overview', '自动展开更改概览'],
    ['Download the Antigravity IDE', '下载 Antigravity IDE'],
    ['Enter tool name or server...', '输入工具名称或服务器...'],
    ['Manage application settings.', '管理应用设置。'],
    ['Select Model to Send Message', '选择用于发送消息的模型'],
    ['Steps to reproduce the issue', '重现此问题的步骤'],
    ['Allow running this command?', '允许运行此命令？'],
    ['Confirm Browser Interaction', '确认浏览器交互'],
    ['Deny List Terminal Commands', '终端命令拒绝列表'],
    ['Enter avatar URL (optional)', '输入头像 URL（可选）'],
    ['Explore the new Antigravity', '探索新版 Antigravity'],
    ['Generate CitC Workspace VCS', '生成 CitC 工作区 VCS'],
    ['New Conversation in Project', '在项目中新建对话'],
    ['Paths the agent can modify.', '智能体可修改的路径。'],
    ['Agent Auto-Fix Lint Errors', '智能体自动修复 Lint 错误'],
    ['Click to copy full command', '点击复制完整命令'],
    ['Copy conversation markdown', '复制对话 Markdown'],
    ['Copy full URL to clipboard', '复制完整 URL 到剪贴板'],
    ['Search MCP servers by name', '按名称搜索 MCP 服务器'],
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
    ['Mark As Unread', '标记为未读'],
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
    ['Select Project', '选择项目'],
    ['Toggle Sidebar', '切换侧边栏'],
    ['Typeahead menu', '自动补全菜单'],
    ['View Changelog', '查看更新日志'],
    ['Agent Decides', '由智能体决定'],
    ['Allow options', '允许选项'],
    ['Chat Settings', '聊天设置'],
    ['CitC Settings', 'CitC 设置'],
    ['conversations', '对话'],
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
    ['Always Allow', '始终允许'],
    ['App Settings', '应用设置'],
    ['Bad response', '差评'],
    ['Browser Task', '浏览器任务'],
    ['Close Folder', '关闭文件夹'],
    ['Confirm Quit', '确认退出'],
    ['conversation', '对话'],
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
    ['Mark As Read', '标记为已读'],
    ['More actions', '更多操作'],
    ['New Worktree', '新建工作树'],
    ['Record Audio', '录制音频'],
    ['Restart Task', '重启任务'],
    ['Select Model', '选择模型'],
    ['Send message', '发送消息'],
    ['Toggle Agent', '切换智能体'],
    ['User message', '用户消息'],
    ['Weekly Limit', '周额度'],
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
    ['Add Folder', '添加文件夹'],
    ['Allow once', '允许一次'],
    ['Allow Once', '允许一次'],
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
    ['workspaces', '工作区'],
    ['Workspaces', '工作区'],
    ['Your Plan:', '您的套餐：'],
    ['Actuation', '操作'],
    ['Add Model', '添加模型'],
    ['Automatic', '自动'],
    ['Copy path', '复制路径'],
    ['Copy Path', '复制路径'],
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
    ['workspace', '工作区'],
    ['Workspace', '工作区'],
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
    ['Searches', '搜索'],
    ['See less', '收起'],
    ['Settings', '设置'],
    ['Show all', '显示全部'],
    ['Sign Out', '退出登录'],
    ['Terminal', '终端'],
    ['Worktree', '工作树'],
    ['Zoom Out', '缩小'],
    ['Account', '账户'],
    ['Actions', '操作'],
    ['Add MCP', '添加 MCP'],
    ['Browser', '浏览器'],
    ['Context', '上下文'],
    ['Default', '默认'],
    ['Deleted', '已删除'],
    ['Dismiss', '忽略'],
    ['Enabled', '已启用'],
    ['folders', '文件夹'],
    ['Folders', '文件夹'],
    ['General', '常规'],
    ['Go Back', '后退'],
    ['Go Live', '实时预览 (Go Live)'],
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
    ['Accent', '强调色'],
    ['Cancel', '取消'],
    ['Custom', '自定义'],
    ['Delete', '删除'],
    ['Edited', '已编辑'],
    ['Editor', '编辑器'],
    ['Export', '导出'],
    ['Filter', '筛选'],
    ['folder', '文件夹'],
    ['Folder', '文件夹'],
    ['Global', '全局'],
    ['Inline', '内联'],
    ['Log in', '登录'],
    ['Medium', '中'],
    ['Models', '模型'],
    ['Narrow', '窄'],
    ['Picker', '选择器'],
    ['Pinned', '已固定'],
    ['Preset', '预设'],
    ['Recent', '最近使用'],
    ['Rename', '重命名'],
    ['Review', '审核'],
    ['search', '搜索'],
    ['Search', '搜索'],
    ['Skills', '技能'],
    ['Snooze', '稍后提醒'],
    ['Status', '状态'],
    ['Strict', '严格'],
    ['Submit', '提交'],
    ['System', '系统'],
    ['Value:', '当前值：'],
    ['Window', '窗口'],
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
    ['Copy', '复制'],
    ['Dark', '深色'],
    ['Edit', '编辑'],
    ['Fast', '快'],
    ['file', '文件'],
    ['File', '文件'],
    ['Help', '帮助'],
    ['High', '高'],
    ['Hold', '按住'],
    ['Labs', '实验室'],
    ['None', '无'],
    ['Open', '打开'],
    ['Plan', '套餐计划'],
    ['Quit', '退出'],
    ['Read', '读取'],
    ['Skip', '跳过'],
    ['Slow', '慢'],
    ['View', '视图'],
    ['Wide', '宽'],
    ['Add', '添加'],
    ['App', '应用'],
    ['Low', '低'],
    ['now', '刚刚'],
    ['Now', '当前'],
    ['Off', '关闭'],
    ['Ran', '已运行'],
    ['Run', '运行'],
    ['Use', '使用'],
    ['Go', '转到'],
    ['On', '开启'],
  ]);

  // 根据长度倒序排序
  const sortedPhrases = Array.from(phrases.entries()).sort((a, b) => b[0].length - a[0].length);


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


  // 动态变量与模板匹配（仅针对含捕获组、时间、计算等动态规则）
  const dynamicPatterns = [
    // 动态权限请求
    [/Requesting permission to (read access to this path|write access to this path|reading this URL|executing actions on this URL|running this command|running this command outside the sandbox|using this MCP tool) (.+)/g, (_match, action, target) => {
      const actions = {
        'read access to this path': '读取此路径',
        'write access to this path': '写入此路径',
        'reading this URL': '读取此 URL',
        'executing actions on this URL': '在此 URL 上执行操作',
        'running this command': '运行此命令',
        'running this command outside the sandbox': '在沙盒外运行此命令',
        'using this MCP tool': '使用此 MCP 工具',
      };
      return '正在请求权限：' + (actions[action] ?? action) + ' ' + target;
    }],
    [/Agent needs permission to act on (.+)/g, '智能体需要权限才能操作 $1'],
    [/Agent needs permission to execute JavaScript on (.+)/g, '智能体需要权限才能在 $1 上执行 JavaScript'],
    [/Yes, save rule for '([^']+)' (when not in a project|in this project|in this workspace|globally)/g, (_m, target, scope) => {
      const scopes = { 'when not in a project': '在未处于项目时', 'in this project': '在此项目中', 'in this workspace': '在此工作区', 'globally': '全局' };
      return `是，并在${scopes[scope] || scope}保存 '${target}' 的规则`;
    }],
    [/Yes, save rule (when not in a project|in this project|in this workspace|globally)/g, (_m, scope) => {
      const scopes = { 'when not in a project': '在未处于项目时', 'in this project': '在此项目中', 'in this workspace': '在此工作区', 'globally': '全局' };
      return `是，并在${scopes[scope] || scope}保存规则`;
    }],
    [/Yes, and always allow '([^']+)'( (when not in a project|in this project|in this workspace))?/g, (_m, target, _p, scope) => {
      const scopes = { 'when not in a project': '在未处于项目时', 'in this project': '在此项目中', 'in this workspace': '在此工作区' };
      return `是，并${scope ? '在' + scopes[scope] : ''}始终允许 '${target}'`;
    }],
    [/Yes, and always allow( (when not in a project|in this project|in this workspace))?/g, (_m, _p, scope) => {
      const scopes = { 'when not in a project': '在未处于项目时', 'in this project': '在此项目中', 'in this workspace': '在此工作区' };
      return `是，并${scope ? '在' + scopes[scope] : ''}始终允许`;
    }],

    // 动态时间与耗时
    [/Worked for (\d+)\s*s\b/gi, '已工作 $1 秒'],
    [/Worked for (\d+)\s*m\b/gi, '已工作 $1 分钟'],
    [/Worked for (\d+)\s*h\b/gi, '已工作 $1 小时'],
    [/(\d+)\s*minutes?\s*ago\b/gi, '$1 分钟前'],
    [/(\d+)\s*hours?\s*ago\b/gi, '$1 小时前'],
    [/(\d+)\s*days?\s*ago\b/gi, '$1 天前'],
    [/(\d+)\s*weeks?\s*ago\b/gi, '$1 周前'],
    [/(\d+)\s*months?\s*ago\b/gi, '$1 个月前'],
    [/(\d+)\s*years?\s*ago\b/gi, '$1 年前'],
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
    [/Show (\d+)\s*breakdowns?/gi, '显示 $1 个明细'],
    [/No more older messages, showing (\d+) of (\d+)/g, '没有更早的消息了，显示 $1 / $2'],
    [/showing (\d+) of (\d+)/gi, '显示 $1 / $2'],
    [/(\d+) files?, (\d+) folders?/gi, '$1 个文件, $2 个文件夹'],
    [/(\d+) files?, (\d+) searches?/gi, '$1 个文件, $2 次搜索'],
    [/(\d+)\s*folders?/gi, '$1 个文件夹'],
    [/(\d+)\s*files?/gi, '$1 个文件'],
    [/(\d+)\s*searches?/gi, '$1 次搜索'],
    [/(\d+)\s*search\b/gi, '$1 次搜索'],
    [/(\d+)\s*tokens?/gi, '$1 个 Token'],
    [/^(\d+)d$/g, '$1天'],
    [/^(\d+)m$/g, '$1分钟'],
    [/^(\d+)s$/g, '$1秒'],

    // 动态下拉与控件参数
    [/Toggle Agent(\s*\([^)]+\))?/g, '切换智能体$1'],
    [/Select (Next|Previous) (Conversation|对话)/g, (_m, dir) => `选择${dir === 'Next' ? '下一个' : '上一个'}对话`],
    [/Select model, current: (.+)/g, '选择模型，当前：$1'],
    [/Your Plan:\s*(.+)/g, '你的套餐：$1'],
    [/Autocomplete Speed:\s*(.+)/g, '补全速度: $1'],
    [/Send feedback as (.+)/g, '以 $1 发送反馈'],
    [/Gemini ([^(]+) \((High|Medium|Low)\)/g, (_match, model, effort) => {
      const efforts = { High: '高', Medium: '中', Low: '低' };
      return 'Gemini ' + model.trim() + ' (' + (efforts[effort] ?? effort) + ')';
    }],
    [/(Learn more|了解更多) about\s*(.+)/g, '了解更多关于 $2'],
  ];

  const patternsPost = [
    // 动态命令按钮兜底
    [/^Allow (.+)$/g, '允许 $1'],
    // 动态选项与操作
    [/^(.+)\s+options$/g, '$1 选项'],
    [/(?:刷新|Refresh)\s*MCP\s*servers?/gi, '刷新 MCP 服务器'],
    [/\btokens\)/gi, 'Token)'],
    // 量词与时间单位补齐
    [/(\d+)\s*搜索/g, '$1 次搜索'],
    [/(\d+)\s*days?\b/gi, '$1 天'],
    [/(\d+)\s*hours?\b/gi, '$1 小时'],
    [/(\d+)\s*minutes?\b/gi, '$1 分钟'],
    [/(\d+)\s*seconds?\b/gi, '$1 秒'],
    [/(\d+)\s*weeks?\b/gi, '$1 周'],
    [/(\d+)\s*months?\b/gi, '$1 个月'],
    [/(\d+)\s*years?\b/gi, '$1 年'],
  ];

  function replacePhrase(value, source, target) {
    const pattern = getPhraseRegex(source);
    return value.replace(pattern, target);
  }

  // 核心翻译流水线：优先纯静态最长匹配，再处理动态变量，最后后置微调
  function translate(value) {
    if (!value || !/[A-Za-z]/.test(value)) return value;
    let next = value;

    // 1. 优先使用纯静态精准词典（最长匹配优先）
    for (const [source, target] of sortedPhrases) {
      next = replacePhrase(next, source, target);
    }

    // 2. 处理动态变量与模板规则
    for (const [pattern, target] of dynamicPatterns) {
      next = next.replace(pattern, target);
    }

    // 3. 后置微调与插值收尾
    for (const [pattern, target] of patternsPost) {
      next = next.replace(pattern, target);
    }

    return next;
  }

  function shouldSkip(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;

    // 跳过代码与编辑区
    if (element.closest('script, style, textarea, code, pre, .xterm, .monaco-editor')) {
      return true;
    }

    // 跳过输入框
    if (node.nodeType === Node.TEXT_NODE) {
      if (element.closest('[contenteditable="true"], [contenteditable=""], input')) {
        return true;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 跳过编辑框子节点
      const parent = node.parentElement;
      if (parent && parent.closest('[contenteditable="true"], [contenteditable=""], input')) {
        return true;
      }
    }

    // 跳过会话历史
    const historyItem = element.closest('.past-conversations, .conversation-list, .history-list, .conversations-list, [data-testid="history-list"], [data-testid="past-conversations"], .conversation-item, .convo-item, .history-item, [class*="history-item"], [class*="convo-item"]');
    if (historyItem) {
      const isActionBtn = element.closest('button[aria-label], button[title], [class*="delete"], [class*="pin"], [class*="archive"]');
      if (!isActionBtn) return true;
    }

    // 跳过用户输入
    if (element.closest('[data-testid="user-input-step"], [aria-label="User message"], [aria-label="用户消息"]')) {
      return true;
    }

    // 跳过回复正文（保留控件）
    const agentResponse = element.closest('[aria-label="Agent response"], [aria-label="智能体回复"]');
    if (agentResponse) {
      const isInteractive = element.closest('button, [role="button"], [class*="action"], [class*="button-container"]');
      if (!isInteractive) return true;
    }

    return false;
  }

  function isInAntigravityContainer(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;

    // 主窗口白名单
    const isMainWindow = window.location.pathname.endsWith('workbench.html') ||
      window.location.href.indexOf('/workbench.html') >= 0 ||
      window.location.href.indexOf('\\workbench.html') >= 0;
    if (!isMainWindow) return true;


    const containerSelector = [
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
      '[id*="agent"]'
    ].join(', ');

    return !!element.closest(containerSelector);
  }

  function translateElement(element) {
    if (!isInAntigravityContainer(element)) return;
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = element.getAttribute?.(attr);
      if (!value) continue;
      const translated = translate(value);
      if (translated !== value) element.setAttribute(attr, translated);
    }
  }

  function translateNode(root) {
    if (!root) return;
    if (shouldSkip(root)) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (!isInAntigravityContainer(root)) return;
      if (root.__zh_patched) return;
      const val = root.nodeValue || '';
      const translated = translate(val);
      if (translated !== val) root.nodeValue = translated;
      root.__zh_patched = true;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (!root.__zh_patched) {
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
        if (translated !== val) node.nodeValue = translated;
        node.__zh_patched = true;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.__zh_patched) continue;
        if (!isInAntigravityContainer(node)) continue;
        translateElement(node);
        node.__zh_patched = true;
      }
    }
  }

  function run() {
    document.documentElement.lang = 'zh-CN';
    translateNode(document);

    new MutationObserver((mutations) => {
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
        setTimeout(() => {
          for (const node of nodesToTranslate) {
            translateNode(node);
          }
          for (const el of elementsToTranslate) {
            translateElement(el);
          }
        }, 0);
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      // 监听容器身份变化。Settings 页面经常先挂载空节点，再异步补 class/id。
      attributeFilter: ['aria-label', 'title', 'placeholder', 'alt', 'class', 'id', 'role', 'data-testid'],
    });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
