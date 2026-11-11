(() => {
  if (typeof window === 'undefined') return;
  const fingerprint = window.__antigravityZhPatchRequestedFingerprint || 'app-2.30.0-20261111-r17';
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
  let removePreferenceSync = null;
  let ideNlsChanges = [];
  window.__antigravityZhPatchCleanup = () => {
    cancelled = true;
    observer?.disconnect();
    window.removeEventListener('DOMContentLoaded', run);
    flushScheduler?.cancel();
    restoreIdeNlsMessages();
    removePreferenceSync?.();
    removeToggleUI?.();
    if (window.__antigravityZhSetLang === setLang) delete window.__antigravityZhSetLang;
  };

  // ===== 中英切换：记录每个被改写节点的原文，切回英文时按原样还原 =====
  // WeakMap 挂在 window 上，词库热更新后新实例仍能还原旧实例翻译过的节点。
  const LANG_KEY = 'antigravityHansLang';
  const POS_KEY = 'antigravityHansTogglePos';
  const originals = window.__antigravityZhOriginals ||
    (window.__antigravityZhOriginals = { texts: new WeakMap(), attrs: new WeakMap() });

  // 偏好持久化（localStorage）
  function loadPref(key) {
    try { return window.localStorage?.getItem(key) ?? null; } catch (_e) { return null; } // data: 页面无 localStorage
  }
  function savePref(key, value) {
    try { window.localStorage?.setItem(key, value); } catch (_e) { /* ignore */ }
  }

  let lang = loadPref(LANG_KEY) === 'en' ? 'en' : 'zh';
  let originalDocLang = null;

  // 自定义翻译名单（由启动器从 custom-translations.txt 注入）：[[原文, 译文], ...]
  // 整段文本与原文一致（忽略大小写和首尾空白）时优先使用；译文为空表示保留英文原文。
  const customTranslations = new Map();
  for (const item of Array.isArray(window.__antigravityZhCustom) ? window.__antigravityZhCustom : []) {
    if (!Array.isArray(item)) continue;
    const key = String(item[0] ?? '').trim().toLowerCase();
    const target = String(item[1] ?? '').trim();
    if (!key) continue;
    customTranslations.set(key, target);
  }

  // 内置预设「选项名保留英文」：默认关闭，可在悬浮按钮菜单（双击或右键）中勾选。
  // 仅包含选项名 / 档位名，说明文字照常汉化；custom-translations.txt 的个人规则优先于预设。
  const ENGLISH_LABELS_KEY = 'antigravityHansEnglishLabels';
  const englishLabelsPreset = new Set([
    // 对话权限预设菜单
    'This Conversation', 'Request Review', 'Default', 'Auto', 'Turbo',
    // 模型推理强度档位
    'High', 'Medium', 'Low',
  ].map((item) => item.toLowerCase()));
  let englishLabels = loadPref(ENGLISH_LABELS_KEY) === '1';

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

  function restoreTrackedNode(node) {
    const text = originals.texts.get(node);
    if (text) {
      // 仅还原仍是本脚本译文的节点；已被应用改写的内容保持不动。
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

  function restoreOriginals() {
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      restoreTrackedNode(node);
    }
  }

  /*
   * Visual Studio Code Localization Packs
   * Copyright (c) Microsoft Corporation. All rights reserved.
   * MIT License
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  // VS Code localization data: microsoft/vscode-loc commit 1f1da543, MIT; additional Antigravity translations.
  // Entries are [index, original, translation].
  const ideNlsSupplement = [
    [147,"Extensions","扩展"],
    [148,"Integrated Terminal","集成终端"],
    [149,"Chat","聊天"],
    [150,"Telemetry","遥测"],
    [151,"Update","更新"],
    [366,"Hover is enabled.","悬停已启用。"],
    [367,"Hover is disabled.","悬停已禁用。"],
    [368,"Hover is shown when holding `{0}` or `Alt` (the opposite modifier of `#editor.multiCursorModifier#`)","按住 `{0}` 或 `Alt` (`#editor.multiCursorModifier#` 的相反修饰键)时显示悬停"],
    [459,"Controls whether inline suggestions are suppressed when in snippet mode.","控制在代码片段模式下是否抑制内联建议。"],
    [462,"Controls whether to send request information from the inline suggestion provider.","控制是否从内联建议提供者处发送请求信息。"],
    [467,"Controls whether long distance inline suggestions are shown.","控制是否显示长距离内联建议。"],
    [731,"Background color for the highlight of line at the cursor position when the editor is not focused.","编辑器未聚焦时，光标所在行的高亮背景色。"],
    [808,"Whether the context is a multi diff editor","上下文是否为多个差异编辑器"],
    [946,"Go to Offset...","转到偏移量..."],
    [1176,"Explain and Fix Problem","解释并修复问题"],
    [1294,"Copy","复制"],
    [1295,"Copied to clipboard","已复制到剪贴板"],
    [1305,"Explain and Fix","解释并修复"],
    [1339,"Triggers an inline suggestion in the editor.","在编辑器中触发内联建议。"],
    [1340,"Options for triggering inline suggestions.","触发内联建议的选项。"],
    [1341,"No inline suggestion is available.","无内联建议可用。"],
    [1356,"Accept Inline Suggestion Alternative Action","接受内联建议的替代操作"],
    [1361,"Whether an alternative action for the inline suggestion is visible.","内联建议的替代操作是否可见。"],
    [1370,"Whether debounce should be disabled for inline suggestions","是否禁用内联建议的防抖"],
    [1374,"Whether any custom {0} completion UI is currently shown","当前是否显示任何自定义 {0} 补全界面"],
    [1390,"Snooze","推迟"],
    [1392,"Inline Suggestion","内联建议"],
    [1393,"{0} 1 occurrence","{0}（出现 1 次）"],
    [1394,"{0} {1} occurrences","{0}（出现 {1} 次）"],
    [1395,"{0} show occurrences","按 {0} 显示出现位置"],
    [1511,"Open a text editor first to go to a line or an offset.","先打开文本编辑器然后跳转到行或偏移量。"],
    [1512,"Current position: line {0}, column {1}. {2}","当前位置: 第 {0} 行，第 {1} 列。{2}"],
    [1513,"Use Zero-Based Offset","使用从零开始的偏移量"],
    [1514,"Open a text editor first to go to a line or an offset.","先打开文本编辑器然后跳转到行或偏移量。"],
    [1515,"Type a character position to go to (from 0 to {0}).","键入要转到的字符位置(从 0 到 {0})。"],
    [1516,"Type a character position to go to (from 1 to {0}).","键入要转到的字符位置(从 1 到 {0})。"],
    [1517,"Press 'Enter' to go to line {0} at column {1}.","按 \"Enter\" 键转到第 {0} 行，第 {1} 列。"],
    [1518,"Type a line number to go to (from 1 to {0}).","键入要转到的行号(从 1 到 {0})。"],
    [1519,"Press 'Enter' to go to line {0} or enter colon : to add a column number.","按 \"Enter\" 键转到第 {0} 行，或输入冒号 : 以添加列号。"],
    [1520,"Press 'Enter' to go to line {0} or enter a column number (from 1 to {1}).","按 \"Enter\" 键跳转到第 {0} 行，或输入列号(从 1 到 {1})。"],
    [1521,"Press 'Enter' to go to line {0} at column {1}.","按 \"Enter\" 键转到第 {0} 行，第 {1} 列。"],
    [1640,"True when focus is in the debug console, false otherwise.","焦点位于调试控制台时为 true，否则为 false。"],
    [1672,"Accept suggestion","接受建议"],
    [1848,"Send Analytics","发送分析数据"],
    [1849,"Upload Error","上传错误"],
    [1850,"Log Observability Data","记录可观测性数据"],
    [1851,"Login with Redirect","使用重定向登录"],
    [1901,"&&Select folder","选择文件夹(&S)"],
    [2142,"Hold {0} key to mouse over","按住 {0} 键将鼠标悬停"],
    [2143,"Loading...","正在加载..."],
    [2144,"Agent Window","智能体窗口"],
    [2145,"When enabled, will open a special window on startup which is a special, non-code-editor window for interfacing with {0}'s agent-first experience.","启用后，启动时会打开一个专用的非代码编辑器窗口，用于使用 {0} 的智能体优先体验。"],
    [2148,"{0} Version: {1}\nVSCode OSS Version: {2}\nCommit: {3}\nDate: {4}\nElectron: {5}\nChromium: {6}\nNode.js: {7}\nV8: {8}\nOS: {9}\nLanguage Server CL: {10}","{0} 版本：{1}\nVSCode OSS 版本：{2}\n提交：{3}\n日期：{4}\nElectron：{5}\nChromium：{6}\nNode.js：{7}\nV8：{8}\n操作系统：{9}\n语言服务器 CL：{10}"],
    [2150,"Automatically show hidden windows after 10 seconds","10 秒后自动显示隐藏的窗口"],
    [2208,"&&Workspace","&&工作区"],
    [2250,"Unable to install the shell command '{0}'.","无法安装 Shell 命令 '{0}'。"],
    [2255,"Unable to uninstall the shell command '{0}'.","无法卸载 Shell 命令 '{0}'。"],
    [2256,"Unable to find shell script at '{0}'","找不到位于 '{0}' 的 Shell 脚本"],
    [2275,"Remove from Recently Used","从最近使用中移除"],
    [2329,"Controls whether system certificates should be loaded using Node.js built-in support. Reload the window after changing this setting. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.","控制是否应使用 Node.js 内置支持加载系统证书。更改此设置后请重新加载窗口。在[远程开发](https://aka.ms/vscode-remote)期间禁用 {0} 设置时，可在本地设置和远程设置中分别配置此设置。"],
    [2332,"Controls the interval in seconds for checking network interface changes to invalidate the proxy cache. Set to -1 to disable. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.","控制检查网络接口更改以使代理缓存失效的时间间隔(秒)。设置为 -1 可禁用。在[远程开发](https://aka.ms/vscode-remote)期间禁用 {0} 设置时，可在本地设置和远程设置中分别配置此设置。"],
    [2337,"To manage how {0} stores code snippet telemetry, visit your [IDE Account Settings]({1}).\n","要管理 {0} 存储代码片段遥测数据的方式，请访问 [IDE 账号设置]({1})。\n"],
    [2402,"The background color used in stark buttons.","醒目按钮使用的背景色。"],
    [2403,"The foreground color used in stark buttons.","醒目按钮使用的前景色。"],
    [2404,"The background color used in stark buttons when hovered.","鼠标悬停在醒目按钮上时使用的背景色。"],
    [2405,"A subtler version of list hover background.","较柔和的列表悬停背景色。"],
    [2406,"Lighter background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.","插入文本较浅的背景色。该颜色不能不透明，以免遮盖底层装饰。"],
    [2407,"Darker background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.","插入文本较深的背景色。该颜色不能不透明，以免遮盖底层装饰。"],
    [2408,"Fallback background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.","插入文本的备用背景色。该颜色不能不透明，以免遮盖底层装饰。"],
    [2409,"Lighter background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.","插入文本较浅的背景色。该颜色不能不透明，以免遮盖底层装饰。"],
    [2410,"Darker background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.","插入文本较深的背景色。该颜色不能不透明，以免遮盖底层装饰。"],
    [2411,"Fallback background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.","插入文本的备用背景色。该颜色不能不透明，以免遮盖底层装饰。"],
    [2644,"Scrollbar track background color.","滚动条轨道背景色。"],
    [2747,"A new version of Jetski is available.\n\nCurrent version: {0}\nNewest version: {1}\n\nWe recommend using go/jetski-linux-installer.\n\nNote: If you already updated but still see this message, you may have stale Jetski processes running. Kill them with: pkill jetski.","有可用的 Jetski 新版本。\n\n当前版本：{0}\n最新版本：{1}\n\n建议使用 go/jetski-linux-installer。\n\n注意：如果更新后仍看到此消息，可能有旧的 Jetski 进程正在运行。可使用以下命令结束它们：pkill jetski。"],
    [2750,"Instructions to update...","更新说明..."],
    [2751,"Update is available","有可用更新"],
    [2752,"A new version of the IDE is available ({0}).\n\nIf you originally installed the IDE via your system's package manager (eg. apt), you can get the new version through your standard system update process.\n\nIf you originally installed Antigravity with the tarball, you can manually download the new tarball from the instructions below.","有可用的 IDE 新版本（{0}）。\n\n如果最初通过系统的软件包管理器（如 apt）安装 IDE，可以通过常规系统更新获取新版本。\n\n如果最初使用 tar 包安装 Antigravity，可以按照以下说明手动下载新的 tar 包。"],
    [2828,"Override the reconnection grace time window in seconds. Defaults to 10800 (3 hours).","替代重新连接宽限期窗口(秒)。默认值为 10800 秒(3 小时)。"],
    [2846,"Copy URIs & Proceed","复制 URI 并继续"],
    [2847,"Failed to copy redirect URIs to clipboard.","未能将重定向 URI 复制到剪贴板。"],
    [2899,"Authentication session for {0} removed, stopping server","已移除 {0} 的身份验证会话，正在停止服务器"],
    [2941,"Contribute views containers to Secondary Activity Bar","将视图容器添加到辅助活动栏"],
    [2956,"The view will expanded even if the container forces it to be collapsed.","即使容器强制折叠，该视图也会展开。"],
    [2970,"Contributes views to Agent Sessions container in the Activity bar. To contribute to this container, the 'chatSessionsProvider' API proposal must be enabled.","向活动栏中的 Agent Sessions 容器提供视图。要提供给此容器，必须启用 \"chatSessionsProvider\" API 建议。"],
    [2979,"View container '{0}' requires 'enabledApiProposals: [\"chatSessionsProvider\"]'.","视图容器 \"{0}\" 需要 \"enabledApiProposals: [\"chatSessionsProvider\"]\"。"],
    [3022,"Accessibility settings","辅助功能设置"],
    [3023,"Advanced settings are hidden by default in the Settings editor unless the user chooses to show advanced settings.","高级设置在设置编辑器中默认隐藏，除非用户选择显示高级设置。"],
    [3024,"Experimental settings are subject to change and may be removed in future releases.","实验性设置可能会发生变更，且可能在未来版本中移除。"],
    [3025,"Preview settings can be used to try out new features before they are finalized.","预览设置可在新功能最终确定前用于试用这些功能。"],
    [3026,"Telemetry settings","遥测设置"],
    [3027,"Settings that use online services","使用联机服务的设置"],
    [3140,"Provide &&Feedback","提供&&反馈"],
    [3176,"Move Secondary Side Bar Left","将辅助侧边栏移至左侧"],
    [3177,"Move Secondary Side Bar Right","将辅助侧边栏移至右侧"],
    [3192,"Show Primary Side Bar","显示主侧边栏"],
    [3228,"Secondary Activity Bar","辅助活动栏"],
    [3322,"Folder Opened in a Window","已在窗口中打开文件夹"],
    [3323,"Workspace Opened in a Window","已在窗口中打开工作区"],
    [3324,"Folder Opened in Active Window","已在活动窗口中打开文件夹"],
    [3325,"Workspace Opened in Active Window","已在活动窗口中打开工作区"],
    [3404,"Hide Menu","隐藏菜单"],
    [3405,"Secondary Activity Bar Position","辅助活动栏位置"],
    [3406,"&&Default","&&默认"],
    [3408,"&&Top","&&顶部"],
    [3410,"&&Bottom","&&底部"],
    [3411,"Bottom","底部"],
    [3412,"&&Hidden","&&隐藏"],
    [3413,"Hidden","隐藏"],
    [3414,"Secondary Activity Bar Position","辅助活动栏位置"],
    [3415,"Secondary Activity Bar Position","辅助活动栏位置"],
    [3416,"Secondary Activity Bar Position","辅助活动栏位置"],
    [3417,"Move Secondary Activity Bar to Side","将辅助活动栏移至侧面"],
    [3418,"Move Secondary Activity Bar to Top","将辅助活动栏移至顶部"],
    [3419,"Move Secondary Activity Bar to Bottom","将辅助活动栏移至底部"],
    [3420,"Hide Secondary Activity Bar","隐藏辅助活动栏"],
    [3427,"Hide Secondary Side Bar","隐藏辅助侧边栏"],
    [3428,"Show Secondary Side Bar","显示辅助侧边栏"],
    [3874,"Show All Recent Folders {0}","显示所有最近的文件夹 {0}"],
    [3882,"Installing {0}...","正在安装 {0}..."],
    [3883,"{0} installed successfully!","{0} 安装成功！"],
    [3884,"Failed to install {0}: {1}","安装 {0} 失败：{1}"],
    [3989,"Add to .gitignore","添加到 .gitignore"],
    [3990,"No .gitignore file exists in the workspace","工作区中不存在 .gitignore 文件"],
    [3991,"Cannot read .gitignore","无法读取 .gitignore"],
    [3992,"File is already in .gitignore","文件已在 .gitignore 中"],
    [3993,"Failed to add file to .gitignore: {0}","无法将文件添加到 .gitignore：{0}"],
    [4020,"You are not signed in to any accounts","你尚未登录任何账号"],
    [4031,"You are not signed in to any accounts","你尚未登录任何账号"],
    [4161,"&&Workspace","&&工作区"],
    [4327,"Navigate between open files using three-finger swipe horizontally. Note that System Preferences > Trackpad > More Gestures must be set to 'Swipe with two or three fingers'.","通过使用三指水平滑动来切换打开的文件。请注意，“系统首选项”>“触控板”>“更多手势”必须设置为“用两指或三指滑动”。"],
    [4359,"Controls whether the command palette shows 'Ask in Chat' option at the bottom.","控制命令面板底部是否显示“在聊天中询问”选项。"],
    [4386,"Controls the location of the Secondary Activity Bar relative to the Secondary Side Bar.","控制辅助活动栏相对于辅助侧边栏的位置。"],
    [4387,"Show the Secondary Activity Bar on the side of the Secondary Side Bar.","在辅助侧边栏的侧面显示辅助活动栏。"],
    [4388,"Show the Secondary Activity Bar on top of the Secondary Side Bar.","在辅助侧边栏的顶部显示辅助活动栏。"],
    [4389,"Show the Secondary Activity Bar at the bottom of the Secondary Side Bar.","在辅助侧边栏的底部显示辅助活动栏。"],
    [4390,"Hide the Secondary Activity Bar in the Secondary Side Bar.","在辅助侧边栏中隐藏辅助活动栏。"],
    [4749,"Provide information about how to open the chat terminal output in the Accessible View.","介绍如何在辅助视图中打开聊天终端输出。"],
    [4956,"{0}: Explain and Fix Problem","{0}：解释并修复问题"],
    [4957,"{0}: Send Prompt to Agent Panel","{0}：将提示发送到智能体面板"],
    [4972,"{0} Plugin Page","{0} 插件页面"],
    [4973,"{0} Configure MCP Page","{0} MCP 配置页面"],
    [4974,"{0}: Manage MCP Servers","{0}：管理 MCP 服务器"],
    [4975,"MCP icon used in Antigravity MCP editor pages.","Antigravity MCP 编辑器页面中使用的 MCP 图标。"],
    [4983,"Reset Manager Onboarding","重置管理器入门设置"],
    [4985,"Reset Manager Onboarding state.","重置管理器入门设置的状态。"],
    [4987,"Welcome to {0}","欢迎使用 {0}"],
    [4988,"Extension '{0}' cannot register plugin with invalid name '{1}'.","扩展“{0}”无法注册名称无效的插件“{1}”。"],
    [4989,"Extension '{0}' cannot register plugin '{1}' without path.","扩展“{0}”无法注册缺少路径的插件“{1}”。"],
    [4990,"Extension '{0}' plugin '{1}' path resolves outside the extension.","扩展“{0}”的插件“{1}”路径解析后位于扩展目录之外。"],
    [4991,"Extension '{0}' plugin '{1}' path is not a directory.","扩展“{0}”的插件“{1}”路径不是目录。"],
    [4992,"Failed to install plugin '{0}' from extension '{1}': {2}","无法从扩展“{1}”安装插件“{0}”：{2}"],
    [4993,"Contributes plugins for Antigravity agent. Plugins are copied to ~/.gemini/<ideName>/plugins/ when the extension is installed.","为 Antigravity 智能体提供插件。安装扩展时，插件会复制到 ~/.gemini/<ideName>/plugins/。"],
    [4994,"Unique identifier for the plugin. Must be unique within this extension. Will be prefixed with extension ID when stored.","插件的唯一标识符，必须在此扩展内唯一。存储时会加上扩展 ID 前缀。"],
    [4995,"Relative path to the plugin folder within the extension.","插件文件夹在扩展内的相对路径。"],
    [4996,"(Optional) Human-readable description of what the plugin does.","（可选）供人阅读的插件功能说明。"],
    [4997,"Contributes plugins for Antigravity agent. Each plugin folder is copied to `~/.gemini/<ideName>/plugins/<extensionId>.<pluginName>/` when the extension is installed.\\n\\n**Expected plugin folder structure:**\\n\\n```\\nplugins/my-plugin/\\n  skills/             # Agent skills\\n    my-skill/\\n      SKILL.md\\n  mcp_config.json     # MCP server definitions (optional)\\n```\\n\\nWhen the extension is uninstalled, the plugin folder is automatically removed.","为 Antigravity 智能体提供插件。安装扩展时，每个插件文件夹都会复制到 `~/.gemini/<ideName>/plugins/<extensionId>.<pluginName>/`。\\n\\n**预期的插件文件夹结构：**\\n\\n```\\nplugins/my-plugin/\\n  skills/             # Agent skills\\n    my-skill/\\n      SKILL.md\\n  mcp_config.json     # MCP server definitions (optional)\\n```\\n\\n卸载扩展时，插件文件夹会自动移除。"],
    [5000,"Failed to open Antigravity settings: {0}","无法打开 Antigravity 设置：{0}"],
    [5001,"Open {0} Settings Page With Setting ID","使用设置 ID 打开 {0} 设置页面"],
    [5003,"Open {0} User Settings","打开 {0} 用户设置"],
    [5011,"Open the {0} quick settings panel.","打开 {0} 快捷设置面板。"],
    [5014,"Open the {0} quick settings panel.","打开 {0} 快捷设置面板。"],
    [5039,"Select an account to manage","选择要管理的帐户"],
    [5040,"There are no active accounts.","没有活动帐户。"],
    [5041,"Manage '{0}'","管理 \"{0}\""],
    [5042,"Select an action","选择操作"],
    [5043,"Manage Trusted Extensions","管理受信任扩展"],
    [5044,"Sign Out","退出登录"],
    [5045,"Manage Accounts","管理帐户"],
    [5046,"Accounts","帐户"],
    [5057,"View extension details","查看扩展详细信息"],
    [5174,"To remove attached contexts, focus an attachment and press Delete or Backspace.","若要移除附加的上下文，请聚焦附件并按 Delete 或 Backspace。"],
    [5177,"To return to the last chat response you focused, invoke the Focus Last Focused Chat Response command{0}.","若要返回到聚焦的上一个聊天响应，请调用“聚焦上个聚焦的聊天响应”命令 {0}。"],
    [5182,"To navigate to the next user prompt in the conversation, invoke the Next User Prompt command{0}.","若要导航到对话中的下一个用户提示，请调用“下一个用户提示”命令 {0}。"],
    [5183,"To navigate to the previous user prompt in the conversation, invoke the Previous User Prompt command{0}.","若要导航到对话中的上一个用户提示，请调用“上一个用户提示”命令 {0}。"],
    [5185,"If there are any hidden chat terminals, you can view them by invoking the View Hidden Chat Terminals command{0}.","如果有任何隐藏的聊天终端，可以通过调用“查看隐藏聊天终端”命令 {0} 来查看它们。"],
    [5186,"To focus the last chat terminal that ran a tool, invoke the Focus Most Recent Chat Terminal command{0}.","若要聚焦运行工具的上一个聊天终端，请调用“聚焦最近聊天终端”命令{0}。"],
    [5187,"To focus the output from the last chat terminal tool, invoke the Focus Most Recent Chat Terminal Output command{0}.","若要聚焦上一个聊天终端工具的输出，请调用“聚焦最近聊天终端输出”命令 {0}。"],
    [5265,"Sessions Orientation","会话排列方向"],
    [5279,"Focus Last Focused Chat List Item","聚焦上次聚焦的聊天列表项"],
    [5291,"Edit/manage the tool approval and confirmation preferences for AI chat agents.","编辑/管理 AI 聊天智能体的工具审批和确认首选项。"],
    [5292,"Show Sessions","显示会话"],
    [5293,"Show Chat Title","显示聊天标题"],
    [5295,"Stacked","上下排列"],
    [5296,"Side by Side","并排"],
    [5297,"Show Welcome","显示欢迎界面"],
    [5298,"New {0}","新建 {0}"],
    [5299,"A chat session is in progress. It will continue running in the background.","有一个聊天会话正在进行，它将继续在后台运行。"],
    [5300,"Open Agent Sessions","打开智能体会话"],
    [5319,"Terminal","终端"],
    [5329,"Continue Chat in...","继续聊天..."],
    [5332,"Continue in {0}","在 {0} 后继续"],
    [5333,"Continue In","继续于"],
    [5334,"Continue in {0}","在 {0} 后继续"],
    [5335,"Continue In","继续于"],
    [5336,"Continue in...","继续于..."],
    [5337,"Continue Chat in...","继续聊天..."],
    [5340,"Copy Math Source","复制数学源代码"],
    [5343,"Accept Request","接受请求"],
    [5352,"Send to Agent","发送给智能体"],
    [5361,"Open Picker","打开选取器"],
    [5392,"New Chat","新建聊天"],
    [5393,"New Chat","新建聊天"],
    [5394,"New Chat","新建聊天"],
    [5396,"Undo Last Request","撤消上一个请求"],
    [5397,"Redo Last Request","恢复上一个请求"],
    [5398,"Redo","恢复"],
    [5399,"Reapply discarded workspace changes and chat","重新应用放弃的工作区更改和聊天"],
    [5400,"Next User Prompt","下一个用户提示"],
    [5401,"Previous User Prompt","上一个用户提示"],
    [5421,"Combined Sessions View","合并的会话视图"],
    [5440,"Select tools for this custom agent","为此自定义智能体选择工具"],
    [5441,"The selected tools are configured by the '{0}' custom agent. Changes to the tools will be applied to the custom agent file as well.","所选工具由“{0}”自定义智能体配置。对工具的更改也将应用于自定义智能体文件。"],
    [5442,"Select tools for this custom agent","为此自定义智能体选择工具"],
    [5443,"The selected tools are configured by the '{0}' custom agent. Changes to the tools will only be used for this session and will not change the '{0}' custom agent.","所选工具由“{0}”自定义智能体配置。对工具的更改将仅应用于本会话，并且不会更改 \"{0}\" 自定义智能体。"],
    [5445,"The selected tools will be applied globally for all chat sessions that use the default agent.","所选工具将全局应用于使用默认智能体的所有聊天会话。"],
    [5448,"Skip","跳过"],
    [5481,"Filter Agent Sessions","筛选智能体会话"],
    [5482,"Filter Agent Sessions","筛选智能体会话"],
    [5483,"Local","本地"],
    [5484,"Background","背景"],
    [5485,"Cloud","云"],
    [5486,"Foreground color for the read indicator in an agent session.","智能体会话中已读指示器的前景色。"],
    [5487,"Archive chat with pending edits?","归档包含待处理编辑的聊天吗？"],
    [5488,"You have pending changes in this chat session.","此聊天会话中有待处理的更改。"],
    [5489,"Open as Editor","作为编辑器打开"],
    [5490,"Open to the Side","在侧边打开"],
    [5493,"Unarchive","取消归档"],
    [5496,"Refresh Agent Sessions","刷新智能体会话"],
    [5497,"Find Agent Session","查找智能体会话"],
    [5498,"Refresh Agent Sessions","刷新智能体会话"],
    [5499,"Find Agent Session","查找智能体会话"],
    [5500,"Show Agent Sessions Sidebar","显示智能体会话侧边栏"],
    [5501,"Hide Agent Sessions Sidebar","隐藏智能体会话侧边栏"],
    [5504,"Failed","失败"],
    [5508,"Refreshing agent sessions...","正在刷新智能体会话..."],
    [5509,"New Session","新建会话"],
    [5510,"New Session","新建会话"],
    [5511,"New Session","新建会话"],
    [5512,"New Local Session","新建本地会话"],
    [5513,"New Background Session","新建后台会话"],
    [5514,"New Cloud Session","新建云会话"],
    [5515,"New {0}","新建 {0}"],
    [5517,"{0} files","{0} 个文件"],
    [5518,"Working...","正在运行..."],
    [5519,"Failed after {0}.","{0} 后失败。"],
    [5520,"Finished in {0}.","在 {0} 后完成。"],
    [5521,"Failed","失败"],
    [5522,"Finished","已完成"],
    [5523,"Agent Sessions","智能体会话"],
    [5524,"{0} agent sessions","{0} 个智能体会话"],
    [5530,"Current file context","当前文件上下文"],
    [5562,"Controls which URLs are automatically approved when requested by chat tools. Keys are URL patterns and values can be `true` to approve both requests and responses, `false` to deny, or an object with `approveRequest` and `approveResponse` properties for granular control.\n\nExamples:\n- `\"https://example.com\": true` - Approve all requests to example.com\n- `\"https://*.example.com\": true` - Approve all requests to any subdomain of example.com\n- `\"https://example.com/api/*\": { \"approveRequest\": true, \"approveResponse\": false }` - Approve requests but not responses for example.com/api paths","控制在聊天工具请求时哪些 URL 会得到自动批准。键是 URL 模式，值可以是 `true` 以表示批准请求和响应，可以是 `false` 以表示拒绝，还可以是包含 `approveRequest` 和 `approveResponse` 属性的对象，以用于进行细粒度控制。\r\n\r\n示例:\r\n- `\"https://example.com\": true` - 批准对 example.com 的所有请求\r\n- `\"https://*.example.com\": true` - 批准对 example.com 任意子域的所有请求\r\n- `\"https://example.com/api/*\": { \"approveRequest\": true, \"approveResponse\": false }` - 批准对 example.com/api 路径的请求，但不批准响应"],
    [5563,"Controls which tools are eligible for automatic approval. Tools set to 'false' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to 'true') may result in the tool offering auto-approval options.","控制哪些工具有资格获得自动批准。设置为 `false` 的工具将始终提出确认，且从不提供自动批准选项。默认行为(或将工具设置为 `true`)可能使工具提供自动批准选项。"],
    [5564,"Controls which tools are eligible for automatic approval. Tools set to 'false' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to 'true') may result in the tool offering auto-approval options.","控制哪些工具有资格获得自动批准。设置为 `false` 的工具将始终提出确认，且从不提供自动批准选项。默认行为(或将工具设置为 `true`)可能使工具提供自动批准选项。"],
    [5565,"Controls whether background throttling is suspended when a chat request is in progress, allowing the chat session to continue even when the window is not in focus.","控制进行聊天请求时是否暂停后台限流，让聊天会话在窗口未聚焦时也能继续。"],
    [5571,"Show welcome banner when chat is empty.","聊天为空时显示欢迎横幅。"],
    [5572,"Show chat agent sessions when chat is empty or to the side when chat view is wide enough.","聊天为空时显示聊天智能体会话；聊天视图足够宽时在侧边显示。"],
    [5573,"Automatically determine the orientation based on available space.","根据可用空间自动确定排列方向。"],
    [5574,"Display sessions vertically stacked unless a chat session is visible.","除非有聊天会话可见，否则垂直堆叠显示会话。"],
    [5575,"Display sessions side by side if space is sufficient.","空间足够时并排显示会话。"],
    [5576,"Controls the orientation of the chat agent sessions view when it is shown alongside the chat.","控制聊天智能体会话视图与聊天并排显示时的排列方向。"],
    [5577,"Show the title of the chat above the chat in the chat view.","在聊天视图的聊天内容上方显示聊天标题。"],
    [5578,"Controls whether a chat session should present the user with an OS notification when a response is received while the window is not in focus. This includes a window badge as well as notification toast.","控制在窗口未处于焦点且接收到响应时，聊天会话是否应向用户呈现 OS 通知。这包括窗口徽章和通知横幅。"],
    [5605,"When applying edits, show a progress animation in the code block pill. If disabled, shows the progress percentage instead.","应用编辑时，在代码块药丸形状中显示进度动画。如果禁用，则改为显示进度百分比。"],
    [5606,"Show status widget for free tier users.","向免费层级用户显示状态小组件。"],
    [5607,"Show status widget for anonymous users.","向匿名用户显示状态小组件。"],
    [5608,"Controls which user type should see the status widget in new chat sessions when quota is exceeded.","控制额度超出时，哪些用户类型会在新聊天会话中看到状态小组件。"],
    [5611,"Enables the default Marketplace for Model Context Protocol (MCP) servers.","为模型上下文协议(MCP)服务器启用默认商城。"],
    [5620,"This setting is deprecated and will be removed in future releases. Chat modes are now called custom agents and are located in `.github/agents`","此设置已弃用，将在未来的版本中移除。聊天模式现称为自定义智能体，位于 `.github/agents` 中"],
    [5623,"Use nested AGENTS.MD files","使用嵌套的 AGENTS.MD 文件"],
    [5624,"Controls whether instructions from nested `AGENTS.MD` files found in the workspace are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available.","控制是否在所有聊天请求中列出在工作区中找到的嵌套 `AGENTS.MD` 文件中的指令。如果 `read` 工具可用，语言模型可以按需加载这些技能。"],
    [5625,"Use Claude skills","使用 Claude 技能"],
    [5626,"Controls whether Claude skills found in the workspace and user home directories under `.claude/skills` are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available.","控制是否在所有聊天请求中列出在 `.claude/skills` 下的工作区和用户主目录中找到的 Claude 技能。如果 `read` 工具可用，语言模型可以按需加载这些技能。"],
    [5629,"Controls whether to show the todo list widget above the chat input. When enabled, the widget displays todo items created by the agent and updates as progress is made.","控制是否在聊天输入上方显示待办事项列表小组件。启用后，小组件显示智能体创建的待办事项，并随进度更新。"],
    [5631,"When enabled, todo items include detailed descriptions for implementation context. This provides more information but uses additional tokens and may slow down responses.","启用后，待办事项包含实现上下文的详细描述。这会提供更多信息，但同时会使用额外的令牌，可能导致响应变慢。"],
    [5636,"Controls whether to use an LLM to generate summary titles for thinking sections.","控制是否使用大语言模型为思考部分生成摘要标题。"],
    [5637,"Tool calls are shown separately, not collapsed into thinking.","工具调用单独显示，不折叠到思考内容中。"],
    [5638,"Tool calls are collapsed into thinking sections when thinking is present.","有思考内容时，将工具调用折叠到思考部分。"],
    [5639,"Tool calls are always collapsed, even without thinking.","始终折叠工具调用，即使没有思考内容也是如此。"],
    [5640,"Controls how tool calls are displayed in relation to thinking sections.","启用后，可折叠的思考部分将根据所选模式添加工具调用。"],
    [5644,"Controls whether the last session is restored in panel after restart.","控制重启后是否在面板中恢复上一次会话。"],
    [5645,"Controls whether the chat panel automatically exits after delegating a request to another session.","控制将请求委派给另一个会话后，聊天面板是否自动退出。"],
    [5646,"Enables the unification of GitHub Copilot extensions. When enabled, all GitHub Copilot functionality is served from the GitHub Copilot Chat extension. When disabled, the GitHub Copilot and GitHub Copilot Chat extensions operate independently.","启用统一 GitHub Copilot 扩展。启用后，所有 GitHub Copilot 功能均通过 GitHub Copilot 聊天助手扩展提供。禁用时，GitHub Copilot 和 GitHub Copilot 聊天助手扩展独立运行。"],
    [5647,"Whether the runSubagent tool is able to use custom agents. When enabled, the tool can take the name of a custom agent, but it must be given the exact name of the agent.","runSubagent 工具是否能使用自定义智能体。启用后，工具可获取自定义智能体的名称，但必须获得智能体的准确名称。"],
    [5654,"Approve results of tool","审批工具的结果"],
    [5657,"Details: {0}","详细信息: {0}"],
    [5669,"Chat: {0}","聊天: {0}"],
    [5670,"Untitled Chat","无标题聊天"],
    [5671,"New chat response.","新建聊天响应。"],
    [5681,"Terminal command, {0}","终端命令，{0}"],
    [5682,"Command: {0}, exit code: {1}","命令: {0}，退出代码: {1}"],
    [5683,"Command","命令"],
    [5684,"Output:","输出:"],
    [5685,"Click to focus this command in the terminal.","单击聚焦终端中的此命令。"],
    [5712,"Enable more AI features","启用更多 AI 功能"],
    [5720,"Chat: {0}","聊天: {0}"],
    [5721,"Untitled Chat","无标题聊天"],
    [5725,"Applying edits","正在应用编辑"],
    [5728,"Edited","已编辑"],
    [5734,"Skip?","是否跳过?"],
    [5735,"Activating MCP extensions...","正在激活 MCP 扩展..."],
    [5736,"Starting MCP servers {0}...","正在启动 MCP 服务器 {0}..."],
    [5742,"Open Changes","打开更改"],
    [5745,"Auto approved by {0}","已由 {0} 自动审批"],
    [5746,"Auto approved for this session","已对此会话自动审批"],
    [5747,"Auto approved for this workspace","已对此工作区自动审批"],
    [5748,"Auto approved for this profile","已对此配置文件自动审批"],
    [5749,"Edit","编辑"],
    [5751,"Waiting for tool '{0}' to respond...","等待工具 \"{0}\" 响应..."],
    [5753,"Manage Paid Premium Requests","管理付费高级请求"],
    [5756,"Click to Retry","单击以重试"],
    [5764,"current mode","当前模式"],
    [5765,"Proceed from {0}","从 {0} 继续"],
    [5767,"More options for {0}","{0} 的更多选项"],
    [5768,"Continue in {0}","在 {0} 中继续"],
    [5772,"Finished thinking and invoked {0} tool{1}","已完成思考并调用 {0} 个工具"],
    [5773,"Finished Thinking","思考完成"],
    [5782,"Chat Todo List","聊天待办事项列表"],
    [5783,"Cannot clear todos while a task is in progress","任务正在进行时，无法清除待办事项"],
    [5785,"Collapse Todos","折叠待办事项"],
    [5786,"Expand Todos","展开待办事项"],
    [5787,"Todos ({0}/{1})","待办事项({0}/{1})"],
    [5790,"Todos ({0}/{1})","待办事项({0}/{1})"],
    [5796,"Failed to save {0}: {1}","未能保存 {0}: {1}"],
    [5797,"Saving resources...","正在保存资源..."],
    [5798,"Saved resources to {0}","已将资源保存到 {0}"],
    [5799,"Pick folder to save resources","选取文件夹以保存资源"],
    [5800,"Save As...","另存为..."],
    [5802,"Skip","跳过"],
    [5807,"Auto approved by {0}","已由 {0} 自动审批"],
    [5808,"Auto approved for this session","已对此会话自动审批"],
    [5809,"Auto approved for this workspace","已对此工作区自动审批"],
    [5810,"Auto approved for this profile","已对此配置文件自动审批"],
    [5811,"Edit","编辑"],
    [5816,"All commands will be auto approved for this session","此会话的所有命令将得到自动批准"],
    [5817,"Disable","禁用"],
    [5818,"Allow","允许"],
    [5819,"Skip","跳过"],
    [5826,"Terminal output for {0}","{0} 的终端输出"],
    [5827,"Command: {0}","命令: {0}"],
    [5828,"No output was produced by the command.","命令未生成任何输出。"],
    [5829,"Command output is no longer available.","命令输出不再可用。"],
    [5830,"No output was produced by the command.","命令未生成任何输出。"],
    [5831,"Output truncated.","输出已截断。"],
    [5832,"No output was produced by the command.","命令未生成任何输出。"],
    [5833,"No output was produced by the command.","命令未生成任何输出。"],
    [5834,"Terminal is no longer available.","终端不再可用。"],
    [5835,"Command information is not available.","命令信息不可用。"],
    [5836,"Show Output","显示输出"],
    [5837,"Hide Output","隐藏输出"],
    [5838,"Show Output","显示输出"],
    [5839,"Show and Focus Terminal","显示并聚焦终端"],
    [5840,"Focus Terminal","聚焦终端"],
    [5841,"Focus Terminal","聚焦终端"],
    [5842,"Allow and Review","允许和审阅"],
    [5845,"Allow and Skip Reviewing Result","允许并跳过审阅结果"],
    [5851,"Allow","允许"],
    [5852,"Skip Results","跳过结果"],
    [5853,"Approve Tool Result","审批工具结果"],
    [5854,"No results to display","没有可显示的结果"],
    [5855,"No displayable results","无可显示结果"],
    [5856,"Contributes chat context integrations to the chat widget.","向聊天小组件提供聊天上下文集成。"],
    [5857,"A unique identifier for this item.","此项的唯一标识符。"],
    [5858,"The icon associated with this chat context item.","与此聊天上下文项关联的图标。"],
    [5859,"A user-friendly name for this item which is used for display in menus.","此项的用户友好名称，用于在菜单中显示。"],
    [5880,"All Session Changes","所有会话更改"],
    [5896,"View All Changes","查看所有更改"],
    [5917,"Keep","保留"],
    [5918,"Undo","撤消"],
    [5926,"The current editor is currently being modified","当前编辑器正在被修改"],
    [5930,"The cursor is inside a change range made by chat editing.","光标位于聊天编辑所做的更改范围内。"],
    [5971,"Loading...","正在加载..."],
    [5982,"{0} line {1}","{0} 第 {1} 行"],
    [5983,"{0} lines {1} to {2}","{0} 第 {1} 至 {2} 行"],
    [6007,"1 file ready to merge","1 个文件可合并"],
    [6008,"{0} files ready to merge","{0} 个文件可合并"],
    [6010,"Worktree Changes","工作树更改"],
    [6030,"Chat Management Editor","聊天管理编辑器"],
    [6031,"Models Management Editor","模型管理编辑器"],
    [6032,"Manage Language Models","管理语言模型"],
    [6033,"Clear Models Search Results","清除模型搜索结果"],
    [6034,"The color of the Chat Management editor splitview sash border.","聊天管理编辑器拆分视图窗体边框的颜色。"],
    [6035,"Usage","使用情况"],
    [6036,"Models","模型"],
    [6037,"Sections","部分"],
    [6039,"Free","免费"],
    [6040,"Upgrade to Copilot Pro+","升级到 Copilot Pro+"],
    [6041,"Upgrade to Copilot Pro","升级到 Copilot Pro"],
    [6042,"Upgrade to Copilot Pro","升级到 Copilot Pro"],
    [6043,"Use AI Features","使用 AI 功能"],
    [6044,"Enable more AI Features","启用更多 AI 功能"],
    [6045,"Enable AI Features","启用 AI 功能"],
    [6046,"Sign in to use AI Features","登录以使用 AI 功能"],
    [6052,"Icon of the AI Management editor label.","AI 管理编辑器标签的图标。"],
    [6053,"Icon of the Models Management editor label.","模型管理编辑器标签的图标。"],
    [6054,"Manage Copilot","管理 Copilot"],
    [6055,"Language Models","语言模型"],
    [6056,"Visible","可见"],
    [6057,"Hidden","隐藏"],
    [6058,"Multiplier","乘数"],
    [6059,"Context Size","上下文大小"],
    [6060,"Input","输入"],
    [6061,"Output","输出"],
    [6062,"Capabilities","功能"],
    [6063,"Tools","工具"],
    [6064,"Vision","视觉"],
    [6065,"Agent Mode","智能体模式"],
    [6066,"Filter","筛选器"],
    [6067,"Group by {0}","按 {0} 分组"],
    [6068,"Filter by {0}","按 {0} 筛选"],
    [6069,"Filter by {0}","按 {0} 筛选"],
    [6070,"Filter by {0}","按 {0} 筛选"],
    [6071,"Visible","可见"],
    [6072,"Hidden","已隐藏"],
    [6073,"Tools","工具"],
    [6074,"Vision","视觉"],
    [6075,"Agent Mode","智能体模式"],
    [6076,"Provider","提供商"],
    [6077,"Visibility","可见性"],
    [6079,"Expand","展开"],
    [6080,"Collapse","折叠"],
    [6081,"Hide","隐藏"],
    [6082,"Show","显示"],
    [6083,"Hide in the chat model picker","在聊天模型选取器中隐藏"],
    [6084,"Show in the chat model picker","在聊天模型选取器中显示"],
    [6085,"This model is hidden in the chat model picker","此模型在聊天模型选取器中隐藏"],
    [6086,"Every chat message counts {0} towards your premium model request quota","每条聊天消息计入你的高级模型请求额度 {0}"],
    [6087,"Context Size","上下文大小"],
    [6088,"Input","输入"],
    [6089,"Output","输出"],
    [6090,"Tools","工具"],
    [6091,"Vision","视觉"],
    [6092,"Manage {0}...","管理 {0}..."],
    [6093,"Type to search...","键入以搜索..."],
    [6094,"Clear Search","清除搜索"],
    [6096,"Add Models...","添加模型..."],
    [6097,"Name","名称"],
    [6098,"Provider","提供商"],
    [6099,"Context Size","上下文大小"],
    [6100,"Capabilities","功能"],
    [6101,"Multiplier","乘数"],
    [6102,"{0} Models","{0} 提供程序"],
    [6103,"Visible Models","可见模型"],
    [6104,"Hidden Models","隐藏的模型"],
    [6105,"{0} from {1}","{0}，来自 {1}"],
    [6106,"Context size: {0} input tokens and {1} output tokens","上下文大小：{0} 个输入 Token，{1} 个输出 Token"],
    [6107,"Capabilities: {0}","功能：{0}"],
    [6108,"Every chat message counts {0} towards your premium model request quota","每条聊天消息计入你的高级模型请求额度 {0}"],
    [6109,"This model is visible in the chat model picker","此模型在聊天模型选择器中可见"],
    [6110,"This model is hidden in the chat model picker","此模型在聊天模型选择器中隐藏"],
    [6111,"Language Models","语言模型"],
    [6112,"Manage {0}...","管理 {0}..."],
    [6113,"Inline Suggestions","内联建议"],
    [6114,"Chat messages","聊天消息"],
    [6115,"Inline Suggestions","内联建议"],
    [6116,"Chat messages","聊天消息"],
    [6117,"Premium requests","高级请求"],
    [6118,"Additional paid premium requests enabled.","已启用其他付费高级请求。"],
    [6119,"Allowance resets {0}.","限额重置为 {0}。"],
    [6120,"Included","已包含"],
    [6121,"Included","已包含"],
    [6122,"Limited","受限"],
    [6165,"By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})","继续使用 {0} Copilot 即表示你同意 {1} 的[条款]({2})和[隐私声明]({3})"],
    [6166,"Approve results of {0}? Result: ","是否批准 {0} 的结果?结果:"],
    [6173,"Icon identifier (codicon ID) for the chat session editor tab. For example, \"$(github)\" or \"$(cloud)\".","聊天会话编辑器选项卡的图标标识符(codicon ID)。例如 \"$(github)\" 或 \"$(cloud)\"。"],
    [6174,"Icon path when a light theme is used","使用浅色主题时的图标路径"],
    [6175,"Icon path when a dark theme is used","使用深色主题时的图标路径"],
    [6176,"Order in which this item should be displayed.","此项的显示顺序。"],
    [6177,"Alternative identifiers for backward compatibility.","用于向后兼容的备用标识符。"],
    [6178,"Title text to display in the chat welcome view for this session type.","要在此会话类型的聊天欢迎视图中显示的标题文本。"],
    [6179,"Message text (supports markdown) to display in the chat welcome view for this session type.","要在此会话类型的聊天欢迎视图中显示的消息文本(支持 Markdown)。"],
    [6180,"Tips text (supports markdown and theme icons) to display in the chat welcome view for this session type.","要在此会话类型的聊天欢迎视图中显示的提示文本(支持 Markdown 和主题图标)。"],
    [6181,"Placeholder text to display in the chat input box for this session type.","要在此会话类型的聊天输入框中显示的占位符文本。"],
    [6185,"Whether this chat session supports attaching MCP resources.","此聊天会话是否支持附加 MCP 资源。"],
    [6186,"Whether this chat session supports attaching images.","此聊天会话是否支持附加图像。"],
    [6187,"Whether this chat session supports attaching search results.","此聊天会话是否支持附加搜索结果。"],
    [6188,"Whether this chat session supports attaching instructions.","此聊天会话是否支持附加指令。"],
    [6189,"Whether this chat session supports attaching source control changes.","此聊天会话是否支持附加源代码管理更改。"],
    [6190,"Whether this chat session supports attaching problems.","此聊天会话是否支持附加问题。"],
    [6191,"Whether this chat session supports attaching symbols.","此聊天会话是否支持附加符号。"],
    [6192,"Commands available for this chat session, which the user can invoke with a `/`.","可用于此聊天会话的命令，用户可使用 `/` 进行调用。"],
    [6193,"A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant.","在 UI 中引用此命令时使用的短名称，例如使用 `fix` 或 `explain` 引用可修复问题或解释代码的命令。名称在此参与者提供的命令中应是唯一的。"],
    [6194,"A description of this command.","此命令的说明。"],
    [6195,"A condition which must be true to enable this command.","启用命令时必须为 true 的条件。"],
    [6196,"Whether delegation is supported. Default is false. Note that enabling this is experimental and may not be respected at all times.","是否支持委派。默认值为 true。"],
    [6197,"Create chat session","创建聊天会话"],
    [6200,"Waiting for confirmation: {0}","正在等待确认：{0}"],
    [6202,"New {0} with Prompt","新建带提示的 {0}"],
    [6204,"New {0}","新建 {0}"],
    [6205,"Pick Option","选择选项"],
    [6208,"Agent Sessions","智能体会话"],
    [6209,"Agent Sessions","智能体会话"],
    [6210,"1 session","1 个会话"],
    [6211,"{0} sessions","{0} 个会话"],
    [6212,"Last Activity: {0}","上一个活动: {0}"],
    [6214,"History","历史记录"],
    [6216,"More...","更多..."],
    [6222,"Chat setup failed. Would you like to try again?","聊天设置失败。要重试吗？"],
    [6224,"Explain","解释"],
    [6226,"Code Review","代码审查"],
    [6227,"Generate Docs","生成文档"],
    [6228,"Generate Tests","生成测试"],
    [6229,"Enabling AI features","正在启用 AI 功能"],
    [6230,"Disabling AI features","正在禁用 AI 功能"],
    [6231,"Use AI Features with Copilot for free...","通过 Copilot 免费使用 AI 功能..."],
    [6232,"Sign in to use AI features","登录以使用 AI 功能"],
    [6233,"Sign in to use AI features...","登录以使用 AI 功能..."],
    [6234,"Upgrade to GitHub Copilot Pro","升级到 GitHub Copilot Pro"],
    [6236,"Manage GitHub Copilot Overages","管理 GitHub Copilot 超额用量"],
    [6238,"Learn How to Hide AI Features","了解如何隐藏 AI 功能"],
    [6239,"Getting chat ready...","正在准备聊天..."],
    [6240,"Failed to sign in to {0}. Would you like to try again?","登录 {0} 失败。要重试吗？"],
    [6241,"You must be signed in to use AI features.","必须登录才能使用 AI 功能。"],
    [6243,"An error occurred while setting up chat. Would you like to try again?","设置聊天时发生错误。要重试吗？"],
    [6245,"What is your {0} instance?","你的 {0} 实例是什么？"],
    [6246,"i.e. \"octocat\" or \"https://octocat.ghe.com\"...","例如 \"octocat\" 或 \"https://octocat.ghe.com\"..."],
    [6247,"Will resolve to {0}","将解析为 {0}"],
    [6248,"You must enter a valid {0} instance (i.e. \"octocat\" or \"https://octocat.ghe.com\")","必须输入有效的 {0} 实例（例如 \"octocat\" 或 \"https://octocat.ghe.com\"）"],
    [6250,"Scaffold a new workspace in VS Code","在 VS Code 中搭建新工作区"],
    [6251,"You need to set up GitHub Copilot and be signed in to use Chat.","需要设置 GitHub Copilot 并登录才能使用聊天。"],
    [6252,"You need to trust this workspace to use Chat.","需要信任此工作区才能使用聊天。"],
    [6253,"Getting chat ready...","正在准备聊天..."],
    [6254,"Failed to get a response. Please try again.","获取回复失败。请重试。"],
    [6255,"Chat is almost ready...","聊天即将准备就绪..."],
    [6256,"Chat took too long to get ready. Please ensure that the extension `{0}` is installed and enabled.","准备聊天耗时过长。请确保已安装并启用扩展 `{0}`。"],
    [6257,"Chat took too long to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled.","准备聊天耗时过长。请确保已登录 {0}，并已安装和启用扩展 `{1}`。"],
    [6258,"Signing in to {0}...","正在登录 {0}..."],
    [6259,"Getting chat ready...","正在准备聊天..."],
    [6260,"Chat setup failed.","聊天设置失败。"],
    [6261,"Generate","生成"],
    [6262,"Modify","修改"],
    [6264,"Explain","解释"],
    [6265,"Modify","修改"],
    [6266,"Generate","生成"],
    [6267,"Explain","解释"],
    [6269,"Ask questions about VS Code","询问有关 VS Code 的问题"],
    [6270,"Ask about your workspace","询问有关工作区的问题"],
    [6271,"Ask how to do something in the terminal","询问如何在终端中执行操作"],
    [6272,"AI features are currently only supported in trusted workspaces.","AI 功能目前仅在受信任的工作区中受支持。"],
    [6273,"Continue with {0}","使用 {0} 继续"],
    [6274,"Continue with {0}","使用 {0} 继续"],
    [6275,"Continue with {0}","使用 {0} 继续"],
    [6276,"Continue with {0}","使用 {0} 继续"],
    [6277,"Use AI Features","使用 AI 功能"],
    [6278,"Skip for now","暂时跳过"],
    [6279,"Start using AI Features","开始使用 AI 功能"],
    [6280,"Enable more AI features","启用更多 AI 功能"],
    [6281,"Sign in to use AI Features","登录以使用 AI 功能"],
    [6282,"Start using AI Features","开始使用 AI 功能"],
    [6283,"By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).","继续操作即表示你同意 {0} 的[条款]({1})和[隐私声明]({2})。"],
    [6284,"By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.","继续操作即表示你同意 {0} 的[条款]({1})和[隐私声明]({2})。{3} Copilot 可能显示[公共代码]({4})建议，并使用你的数据改进产品。你可以随时更改这些[设置]({5})。"],
    [6285,"Gauge foreground color.","仪表前景色。"],
    [6286,"Gauge background color.","仪表背景色。"],
    [6287,"Gauge border color.","仪表边框颜色。"],
    [6288,"Gauge warning foreground color.","仪表警告前景色。"],
    [6289,"Gauge warning background color.","仪表警告背景色。"],
    [6290,"Gauge error foreground color.","仪表错误前景色。"],
    [6291,"Gauge error background color.","仪表错误背景色。"],
    [6292,"Copilot Usage","Copilot 用量"],
    [6293,"Manage Chat","管理聊天"],
    [6294,"Manage Chat","管理聊天"],
    [6295,"Inline Suggestions","内联建议"],
    [6296,"Chat messages","聊天消息"],
    [6297,"Premium requests","高级请求"],
    [6298,"Allowance resets {0}.","额度将于 {0} 重置。"],
    [6299,"Upgrade to GitHub Copilot Pro","升级到 GitHub Copilot Pro"],
    [6300,"Copilot Usage","Copilot 用量"],
    [6301,"Limited","有限"],
    [6302,"Inline Suggestions","内联建议"],
    [6303,"Limited","有限"],
    [6304,"Chat messages","聊天消息"],
    [6305,"Agent Sessions","智能体会话"],
    [6306,"View Agent Sessions","查看智能体会话"],
    [6307,"View Agent Sessions","查看智能体会话"],
    [6308,"$(loading~spin) {0} in progress","$(loading~spin) {0} 正在进行"],
    [6309,"Inline Suggestions","内联建议"],
    [6312,"Model: {0}","模型：{0}"],
    [6316,"By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})","继续使用 {0} Copilot 即表示你同意 {1} 的[条款]({2})和[隐私声明]({3})"],
    [6317,"Set up Copilot to use AI features.","设置 Copilot 以使用 AI 功能。"],
    [6318,"Sign in to enable more Copilot AI features.","登录以启用更多 Copilot AI 功能。"],
    [6319,"Enable Copilot to use AI features.","启用 Copilot 以使用 AI 功能。"],
    [6320,"Sign in to use Copilot AI features.","登录以使用 Copilot AI 功能。"],
    [6321,"Use AI Features","使用 AI 功能"],
    [6322,"Enable more AI Features","启用更多 AI 功能"],
    [6323,"Enable AI Features","启用 AI 功能"],
    [6324,"Sign in to use AI Features","登录以使用 AI 功能"],
    [6327,"Manage paid premium requests","管理付费高级请求"],
    [6328,"Included","已包含"],
    [6329,"+{0} requests","+{0} 次请求"],
    [6331,"Additional paid premium requests enabled.","已启用额外的付费高级请求。"],
    [6332,"Additional paid premium requests disabled.","已禁用额外的付费高级请求。"],
    [6333,"All files","所有文件"],
    [6335,"Next edit suggestions","下一处编辑建议"],
    [6336,"Cancel Snooze","取消暂时隐藏"],
    [6337,"Hide suggestions for 5 min","隐藏建议 5 分钟"],
    [6338,"Hide inline suggestions for 5 min","隐藏内联建议 5 分钟"],
    [6340,"Inline suggestions are hidden for the remaining duration","在剩余时间内隐藏内联建议"],
    [6341,"+5 min","+5 分钟"],
    [6342,"Snooze additional 5 min","再暂时隐藏 5 分钟"],
    [6343,"Currently selected","当前已选择"],
    [6344,"Select a model for {0}","为 {0} 选择模型"],
    [6345,"Copilot status","Copilot 状态"],
    [6346,"Finish Setup","完成设置"],
    [6347,"Copilot disabled","Copilot 已禁用"],
    [6348,"{0} agent sessions in progress","{0} 个智能体会话正在进行"],
    [6349,"1 agent session in progress","1 个智能体会话正在进行"],
    [6350,"Signed out","已退出登录"],
    [6351,"Chat quota reached","已达到聊天额度上限"],
    [6352,"Inline suggestions quota reached","已达到内联建议额度上限"],
    [6353,"Quota reached","已达到额度上限"],
    [6354,"Inline suggestions disabled","内联建议已禁用"],
    [6355,"Inline suggestions snoozed","内联建议已暂时隐藏"],
    [6356,"Copilot Status","Copilot 状态"],
    [6357,"You've reached the limit for chat messages. Try Copilot Pro for free.","你已达到聊天消息上限。免费试用 Copilot Pro。"],
    [6360,"You've reached the limit for chat messages.","你已达到聊天消息上限。"],
    [6363,"Recent Sessions","最近的会话"],
    [6364,"All Sessions","所有会话"],
    [6365,"Show All Sessions","显示所有会话"],
    [6366,"Show Recent Sessions","显示最近的会话"],
    [6367,"Recent Sessions","最近的会话"],
    [6368,"All Sessions","所有会话"],
    [6369,"Show All Sessions","显示所有会话"],
    [6370,"Show Recent Sessions","显示最近的会话"],
    [6372,"{0} Agent Session","{0} 智能体会话"],
    [6373,"Chat: {0}","聊天：{0}"],
    [6420,"without approval","未经审批"],
    [6421,"without reviewing result","不查看结果"],
    [6422,"Allow in this Session","在此会话中允许"],
    [6423,"Allow this tool to run in this session without confirmation.","允许此工具在此会话中运行而无需确认。"],
    [6424,"Allow in this Workspace","此工作区中允许"],
    [6425,"Allow this tool to run in this workspace without confirmation.","允许此工具在此工作区中运行而无需确认。"],
    [6426,"Always Allow","始终允许"],
    [6427,"Always allow this tool to run without confirmation.","始终允许此工具运行而无需确认。"],
    [6428,"Allow Tools from {0} in this Session","允许此会话中来自 {0} 的工具"],
    [6429,"Allow all tools from this server to run in this session without confirmation.","允许此服务器中的所有工具在此会话中运行，无需确认。"],
    [6430,"Allow Tools from {0} in this Workspace","允许此工作区中来自 {0} 的工具"],
    [6431,"Allow all tools from this server to run in this workspace without confirmation.","允许此服务器中的所有工具在此工作区中运行，无需确认。"],
    [6432,"Always Allow Tools from {0}","始终允许来自 {0} 的工具"],
    [6433,"Always allow all tools from this server to run without confirmation.","始终允许此服务器中的所有工具运行，无需确认。"],
    [6434,"Allow Without Review in this Session","在此会话中允许，无需审核"],
    [6435,"Allow results from this tool to be sent without confirmation in this session.","允许在此会话中发送此工具的结果，无需确认。"],
    [6436,"Allow Without Review in this Workspace","在此工作区中允许，无需审核"],
    [6437,"Allow results from this tool to be sent without confirmation in this workspace.","允许在此工作区中发送此工具的结果，无需确认。"],
    [6438,"Always Allow Without Review","始终允许，无需审核"],
    [6439,"Always allow results from this tool to be sent without confirmation.","始终允许发送此工具的结果，无需确认。"],
    [6440,"Allow Tools from {0} Without Review in this Session","允许此会话中来自 {0} 的工具，无需审核"],
    [6441,"Allow results from all tools from this server to be sent without confirmation in this session.","允许在此会话中发送来自此服务器的所有工具的结果，无需确认。"],
    [6442,"Allow Tools from {0} Without Review in this Workspace","允许此工作区中来自 {0} 的工具，无需审核"],
    [6443,"Allow results from all tools from this server to be sent without confirmation in this workspace.","允许在此工作区中发送来自此服务器的所有工具的结果，无需确认。"],
    [6444,"Always Allow Tools from {0} Without Review","始终允许来自 {0} 的工具，无需审核"],
    [6445,"Always allow results from all tools from this server to be sent without confirmation.","始终允许发送来自此服务器的所有工具的结果，无需确认。"],
    [6446,"Continue without reviewing any tool results","继续，无需审核任何工具结果"],
    [6447,"Run any tool without approval","在未经批准的情况下运行任何工具"],
    [6448,"Configure for this workspace only","仅为此工作区配置"],
    [6449,"Configure session tool approvals","配置会话工具审批"],
    [6450,"Configure workspace tool approvals","配置工作区工具审批"],
    [6451,"Configure global tool approvals","配置全局工具审批"],
    [6452,"Use VS Code features","使用 VS Code 功能"],
    [6453,"Execute code and applications on your machine","在你的计算机上执行代码和应用程序"],
    [6454,"Read files in your workspace","读取工作区中的文件"],
    [6455,"Allow tool to execute?","允许工具执行吗?"],
    [6456,"Run the '{0}' tool?","是否运行 \"{0}\" 工具?"],
    [6457,"Auto approval for '{0}' is restricted via {1}.","“{0}”的自动审批通过“{1}”受到限制。"],
    [6458,"Auto approval for '{0}' is restricted via {1}.","“{0}”的自动审批通过“{1}”受到限制。"],
    [6468,"Add Premium Models","添加高级模型"],
    [6470,"Add Premium Models","添加高级模型"],
    [6483,"Select the custom agents to open and configure visibility in the agent picker","在智能体选取器中选择要打开并配置可见性的自定义智能体"],
    [6485,"Custom Agents","自定义智能体"],
    [6487,"Configure Custom Agents...","配置自定义智能体..."],
    [6488,"Configure Custom Agents...","配置自定义智能体..."],
    [6494,"New Custom Agent...","新建自定义智能体..."],
    [6501,"Enter the name of the agent file","输入智能体文件的名称"],
    [6504,"Enter a new name of the agent file","输入智能体文件的新名称"],
    [6509,"Select a location to create the agent file in...","选择创建智能体文件的位置..."],
    [6512,"Select a location to move the agent file to...","选择要将智能体文件移动到的位置..."],
    [6515,"Select a location to copy the agent file to...","选择要将智能体文件复制到的位置..."],
    [6518,"Learn how to configure custom agents","了解如何配置自定义智能体"],
    [6521,"No agent source folders found.","找不到智能体来源文件夹。"],
    [6522,"Show help on prompt files","显示有关提示文件的帮助"],
    [6523,"Show help on instruction files","显示有关指令文件的帮助"],
    [6524,"Show help on custom agent files","显示有关自定义智能体文件的帮助"],
    [6528,"Create new custom agent...","创建新的自定义智能体..."],
    [6533,"Hidden from chat view agent picker. Click to show.","对聊天视图的智能体选取器隐藏。单击以显示。"],
    [6534,"Hide from agent picker","在智能体选取器中隐藏"],
    [6536,"Workspace","工作区"],
    [6537,"Agent Instructions","智能体指令"],
    [6538,"Extensions","扩展"],
    [6539,"User Data","用户数据"],
    [6540,"{0} (hidden)","{0} (隐藏)"],
    [6541,"Hidden from chat view agent picker","对聊天视图的智能体选取器隐藏"],
    [6552,"An external application wants to create a custom agent with content from a URL. Do you want to continue by selecting a destination folder and name?","外部应用程序想要创建包含 URL 内容的自定义智能体。是否要通过选择目标文件夹和名称继续操作?"],
    [6562,"Save As Prompt File","另存为提示文件"],
    [6563,"Save as prompt file","另存为提示文件"],
    [6564,"Save As Agent File","另存为智能体文件"],
    [6565,"Save as agent file","另存为智能体文件"],
    [6566,"Save As Instructions File","另存为指令文件"],
    [6567,"Save as instructions file","另存为指令文件"],
    [6586,"Suggested Actions","建议的操作"],
    [6587,"Suggested prompt: {0}, {1}","建议的提示: {0}，{1}"],
    [6590,"Edit Prompt File","编辑提示文件"],
    [6622,"True when focus is in the chat terminal output region.","当焦点位于聊天终端输出区域时为 True。"],
    [6623,"The 'kind' of the current agent.","当前智能体的“类型”。"],
    [6628,"True when the chat agent supports attachments.","当聊天智能体支持附件时为 true。"],
    [6636,"True when the chat is in a contributed chat session that has available 'models' to display.","当聊天处于参与的聊天会话中且该会话有可用的“模型”显示时为 True。"],
    [6640,"True when the current chat session has no requests.","当前聊天会话没有请求时为 true。"],
    [6646,"True when a chat elicitation request is pending.","当聊天诱导请求挂起时为 true。"],
    [6648,"True when the chat has custom agents available.","如果聊天具有可用的自定义智能体，则为 True。"],
    [6649,"True when agent mode is disabled by organization policy.","组织策略禁用智能体模式时为 true。"],
    [6651,"True when the chat session viewer uses the new combined style.","聊天会话查看器使用新的合并样式时为 true。"],
    [6652,"If the agent sessions view in the chat view is limited to show recent sessions only.","聊天视图中的智能体会话视图是否仅显示最近的会话。"],
    [6653,"Orientation of the agent sessions view in the chat view.","聊天视图中智能体会话视图的排列方向。"],
    [6654,"Position of the agent sessions view in the chat view.","聊天视图中智能体会话视图的位置。"],
    [6655,"The type of the current agent session item.","当前智能体会话项的类型。"],
    [6656,"True when the current agent session item has changes.","当前智能体会话项有更改时为 true。"],
    [6657,"True when the agent session item is archived.","智能体会话项已归档时为 true。"],
    [6658,"True when the agent session item is read.","智能体会话项已读时为 true。"],
    [6659,"True when the agent session is currently active (not deletable).","智能体会话当前处于活动状态（不可删除）时为 true。"],
    [6660,"True when focusing a KaTeX math element.","聚焦 KaTeX 数学元素时为 true。"],
    [6661,"Changes to {0} files","对 {0} 个文件的更改"],
    [6676,"New Chat","新建聊天"],
    [6677,"Delete","删除"],
    [6678,"Allow requests to {0}","允许请求 {0}"],
    [6679,"Allow responses from {0}","允许来自 {0} 的响应"],
    [6680,"Allow requests to...","允许请求..."],
    [6681,"Configure URL Approvals...","配置 URL 审批..."],
    [6682,"Select URL pattern to approve","选择要批准的 URL 模式"],
    [6683,"Make requests without confirmation","无需确认即发出请求"],
    [6684,"Allow responses without confirmation","无需确认即允许响应"],
    [6685,"Approve all","全部批准"],
    [6686,"Deny all","全部拒绝"],
    [6687,"requests","请求"],
    [6688,"responses","回复"],
    [6689,"Approves {0}","批准 {0}"],
    [6690,"No approvals","无审批"],
    [6691,"More Options...","更多选项..."],
    [6692,"Open settings","打开设置"],
    [6698,"Condition which must be true to show this language model chat provider in the Manage Models list.","必须为 true 才能在“管理模型”列表中显示此语言模型聊天提供程序的条件。"],
    [6708,"{0} of {1} binary data","{0} 二进制数据(共 {1})"],
    [6710,"Contributes {0} for chat prompts.","为聊天提示提供 {0}。"],
    [6711,"Identifier for this file. Must be unique within this extension for this contribution point.","此文件的标识符。对于此贡献点，在此扩展中必须唯一。"],
    [6712,"Path to the file relative to the extension root.","文件相对于扩展根目录的路径。"],
    [6713,"(Optional) Description of the file.","(可选)文件说明。"],
    [6714,"Extension '{0}' cannot register {1} entry with invalid name '{2}'.","扩展 \"{0}\" 无法注册具有无效名称 \"{2}\" 的 {1} 项。"],
    [6715,"Extension '{0}' cannot register {1} entry '{2}' without path.","扩展 \"{0}\" 无法注册没有路径的 {1} 项 \"{2}\"。"],
    [6716,"Extension '{0}' cannot register {1} entry '{2}' without description.","扩展 \"{0}\" 无法注册没有描述的 {1} 项 \"{2}\"。"],
    [6717,"Extension '{0}' {1} entry '{2}' path resolves outside the extension.","扩展 \"{0}\" 的 {1} 项 \"{2}\" 路径解析在扩展之外。"],
    [6718,"Failed to register {0} entry '{1}': {2}","未能注册 {0} 项 \"{1}\": {2}"],
    [6723,"Instructions for the workspace","针对工作区的指令"],
    [6724,"Instructions for folder '{0}'","针对文件夹 \"{0}\" 的指令"],
    [6726,"Rename to 'agent'","重命名为 \"agent\""],
    [6727,"Migrate to custom agent file","迁移到自定义智能体文件"],
    [6728,"Update to '{0}'","更新到 \"{0}\""],
    [6729,"Expand to {0} tools","展开为 {0} 个工具"],
    [6730,"Update all tool names","更新所有工具名称"],
    [6731,"Add Prompt Header","添加提示标头"],
    [6732,"Handoff Example","转接"],
    [6733,"The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.","UI 中显示的指令文件的名称。如果未设置，则名称从文件名派生。"],
    [6734,"The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.","指令文件的说明。它可用于提供有关指令的其他上下文或信息，并传递到语言模型作为提示的一部分。"],
    [6735,"One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`","一个或多个 glob 模式(用逗号分隔)，用于描述指令应用于哪些文件。根据这些模式，当上下文包含与其中一个或多个模式匹配的文件时，该文件会自动包含在提示中。如果希望始终添加此文件，请使用 `**`。\r\n示例: `**/*.ts`、`**/*.js`、`client/**`"],
    [6736,"The name of the agent as shown in the UI.","智能体在 UI 中显示的名称。"],
    [6737,"The description of the custom agent, what it does and when to use it.","有关自定义智能体及其作用和使用时机的说明。"],
    [6738,"The argument-hint describes what inputs the custom agent expects or supports.","参数提示描述自定义智能体期望或支持的输入。"],
    [6739,"Specify the model that runs this custom agent.","指定运行此自定义智能体的模型。"],
    [6740,"The set of tools that the custom agent has access to.","自定义智能体可访问的工具集。"],
    [6741,"The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.","标头属性(如工具)应用的目标。可能的值为 `github-copilot` 和 `vscode`。"],
    [6742,"Whether the agent can be used as a subagent.","该智能体是否可用作子智能体。"],
    [6743,"The name of the prompt. This is also the name of the slash command that will run this prompt.","提示的名称。这也是将运行此提示的 / 命令的名称。"],
    [6744,"The description of the reusable prompt, what it does and when to use it.","有关可重用提示及其作用和使用时机的说明。"],
    [6745,"The argument-hint describes what inputs the prompt expects or supports.","参数提示描述提示期望或支持的输入。"],
    [6746,"The model to use in this prompt.","要在此提示中使用的模型。"],
    [6747,"The tools to use in this prompt.","要在此提示中使用的工具。"],
    [6748,"ToolSet: {0}\n\n","工具集: {0}\r\n\r\n"],
    [6749,"Note: This attribute is not used when target is github-copilot.","注意: 当目标是 github-copilot 时，不使用此属性。"],
    [6750,"- Name: {0}","- 名称: {0}"],
    [6751,"- Family: {0}","- 系列: {0}"],
    [6752,"- Vendor: {0}","- 供应商: {0}"],
    [6753,"Built-in agent","内置智能体"],
    [6754,"Custom agent","自定义智能体"],
    [6755,"The agent to use when running this prompt.","运行此提示时要使用的智能体。"],
    [6756,"**Built-in agents:**","**内置智能体:**"],
    [6757,"**Custom agents:**","**自定义智能体:**"],
    [6758,"Custom agent","自定义智能体"],
    [6759,"Possible handoff actions when the agent has completed its task.","智能体完成任务后可能的转接操作。"],
    [6760,"Note: This attribute is not used when target is github-copilot.","注意: 当目标是 github-copilot 时，不使用此属性。"],
    [6761,"Chat modes have been renamed to agents. Please move this file to {0}","聊天模式已重命名为智能体。请将此文件移动到 {0}"],
    [6762,"Chat modes have been renamed to agents. Please move the file to {0}","聊天模式已重命名为智能体。请将该文件移动到 {0}"],
    [6763,"Invalid file reference '{0}'.","无效的文件引用“{0}”。"],
    [6764,"File '{0}' not found at '{1}'.","在“{1}”中找不到文件“{0}”。"],
    [6765,"Tool or toolset '{0}' has been renamed, use '{1}' instead.","工具或工具集 \"{0}\" 已重命名，请改用 \"{1}\"。"],
    [6766,"Tool or toolset '{0}' has been renamed, use the following tools instead: {1}","工具或工具集 '{0}' 已重命名，请改用以下工具：{1}"],
    [6767,"Unknown tool or toolset '{0}'.","未知工具或工具集“{0}”。"],
    [6768,"Tool or toolset '{0}' also needs to be enabled in the header.","工具或工具集 \"{0}\" 也需要在标头中启用。"],
    [6769,"Attribute '{0}' is not supported in prompt files. Supported: {1}.","提示文件中不支持属性“{0}”。受支持: {1}。"],
    [6770,"Attribute '{0}' is not supported in custom GitHub Copilot agent files. Supported: {1}.","自定义 GitHub Copilot 智能体文件中不支持属性 \"{0}\"。受支持: {1}。"],
    [6771,"Attribute '{0}' is ignored when running locally in VS Code.","在 VS Code 本地运行时忽略属性 \"{0}\"。"],
    [6772,"Attribute '{0}' is not supported in VS Code agent files. Supported: {1}.","VS Code 智能体文件中不支持属性 \"{0}\"。受支持: {1}。"],
    [6773,"Attribute '{0}' is not supported in instructions files. Supported: {1}.","指令文件中不支持属性“{0}”。受支持: {1}。"],
    [6774,"The 'name' attribute must be a string.","\"name\" 属性必须是字符串。"],
    [6775,"The 'name' attribute must not be empty.","\"name\" 属性不得为空。"],
    [6776,"The 'description' attribute must be a string.","\"description\" 属性必须是字符串。"],
    [6777,"The 'description' attribute should not be empty.","\"description\" 属性不得为空。"],
    [6778,"The 'argument-hint' attribute must be a string.","\"argument-hint\" 属性必须是字符串。"],
    [6779,"The 'argument-hint' attribute should not be empty.","\"argument-hint\" 属性不得为空。"],
    [6780,"The 'model' attribute must be a string.","\"model\" 属性必须是字符串。"],
    [6781,"The 'model' attribute must be a non-empty string.","\"model\" 属性必须是非空字符串。"],
    [6782,"Unknown model '{0}'.","未知模型 \"{0}\"。"],
    [6783,"Model '{0}' is not suited for agent mode.","模型“{0}”不适用于代理模式。"],
    [6784,"The 'mode' attribute has been deprecated. The 'agent' attribute is used instead.","\"mode\" 属性已弃用。改用 \"agent\" 属性。"],
    [6785,"The 'mode' attribute has been deprecated. Please rename it to 'agent'.","\"mode\" 属性已弃用。请将其重命名为 \"agent\"。"],
    [6786,"The '{0}' attribute must be a string.","\"{0}\" 属性必须是字符串。"],
    [6787,"The '{0}' attribute must be a non-empty string.","\"{0}\" 属性必须是非空字符串。"],
    [6788,"Unknown agent '{0}'. Available agents: {1}.","未知智能体 \"{0}\"。可用智能体: {1}。"],
    [6789,"The 'tools' attribute is only supported when using agents. Attribute will be ignored.","在使用智能体时仅支持 \"tools\" 属性。将忽略属性。"],
    [6790,"The 'tools' attribute must be an array.","\"tools\" 属性必须是数组。"],
    [6791,"Each tool name in the 'tools' attribute must be a string.","\"tools\" 属性中的每个工具名称都必须是字符串。"],
    [6792,"Tool or toolset '{0}' has been renamed, use '{1}' instead.","工具或工具集 \"{0}\" 已重命名，请改用 \"{1}\"。"],
    [6793,"Tool or toolset '{0}' has been renamed, use the following tools instead: {1}","工具或工具集 '{0}' 已重命名，请改用以下工具：{1}"],
    [6794,"Unknown tool '{0}'.","未知工具 \"{0}\"。"],
    [6795,"The 'applyTo' attribute must be a string.","\"applyTo\" 属性必须是字符串。"],
    [6796,"The 'applyTo' attribute must be a valid glob pattern.","\"applyTo\" 属性必须是有效的 glob 模式。"],
    [6797,"The 'applyTo' attribute must be a valid glob pattern.","\"applyTo\" 属性必须是有效的 glob 模式。"],
    [6798,"The 'applyTo' attribute must be a valid glob pattern.","\"applyTo\" 属性必须是有效的 glob 模式。"],
    [6799,"The 'excludeAgent' attribute must be an array.","\"excludeAgent\" 属性必须是数组。"],
    [6800,"The 'handoffs' attribute must be an array.","\"handoffs\" 属性必须是数组。"],
    [6801,"Each handoff in the 'handoffs' attribute must be an object with 'label', 'agent', 'prompt' and optional 'send'.","\"handoffs\" 属性中的每个转接必须是包含 \"label\"、\"agent\"、\"prompt\" 和(可选) \"send\" 的对象。"],
    [6802,"The 'label' property in a handoff must be a non-empty string.","转接中的 \"label\" 属性必须是非空字符串。"],
    [6803,"The 'agent' property in a handoff must be a non-empty string.","转接中的 \"agent\" 属性必须是非空字符串。"],
    [6804,"The 'prompt' property in a handoff must be a string.","转接中的 \"prompt\" 属性必须是字符串。"],
    [6805,"The 'send' property in a handoff must be a boolean.","转接中的 \"send\" 属性必须是布尔值。"],
    [6806,"The 'showContinueOn' property in a handoff must be a boolean.","移交中的 'showContinueOn' 属性必须是布尔值。"],
    [6807,"Unknown property '{0}' in handoff object. Supported properties are 'label', 'agent', 'prompt' and optional 'send', 'showContinueOn'.","转接对象中的未知属性 \"{0}\"。支持的属性为 \"label\"、\"agent\"、\"prompt\" 和(可选) \"send\"。"],
    [6808,"Missing required properties {0} in handoff object.","转接对象中缺少的必需属性 {0}。"],
    [6809,"The 'infer' attribute must be a boolean.","'infer' 属性必须是布尔值。"],
    [6810,"The 'target' attribute must be a string.","\"target\" 属性必须是字符串。"],
    [6811,"The 'target' attribute must be a non-empty string.","\"target\" 属性必须是非空字符串。"],
    [6812,"The 'target' attribute must be one of: {0}.","\"target\" 属性必须是以下项之一: {0}。"],
    [6813,"User Data","用户数据"],
    [6814,"Extension: {0}","扩展: {0}"],
    [6853,"Run Subagent","运行子智能体"],
    [6854,"Run a task within an isolated subagent context to enable efficient organization of tasks and context window management.","在隔离的子智能体上下文中运行任务，以便高效组织任务并管理上下文窗口。"],
    [6855,"Delegate tasks to other agents","将任务委派给其他智能体"],
    [6942,"Write your global rules for Agent here","在此编写智能体的全局规则"],
    [6943,"[[Click]] to add this file to .gitignore","[[点击]]将此文件添加到 .gitignore"],
    [6944,"This file should contain a JSON object specifying your MCP config.","此文件应包含一个指定 MCP 配置的 JSON 对象。"],
    [6971,"Go to Offset","转到偏移"],
    [6973,"Go to Offset...","转到偏移..."],
    [7086,"Editor overview ruler decoration color for comment threads with draft comments. This color should be opaque.","编辑器概述标尺修饰颜色，用于草稿评论的评论线程。此颜色应不透明。"],
    [7089,"Editor gutter decoration color for commenting glyphs for comment threads with draft comments.","编辑器装订线修饰颜色，用于草稿评论的评论线程的评论字形。"],
    [7342,"End ({1}) should be greater than Start ({0})","结束位置 ({1}) 应大于起始位置 ({0})"],
    [7537,"Debug Session...","调试会话..."],
    [7538,"Select debug data to attach","选择要附加的调试数据"],
    [7539,"Expression Value...","表达式值..."],
    [7540,"Watch Expressions","监视表达式"],
    [7541,"All variables in {0}","{0} 中的所有变量"],
    [7542,"Type an expression to evaluate...","输入要计算的表达式..."],
    [7543,"No active debug session","没有活动的调试会话"],
    [7544,"No result","无结果"],
    [7545,"Evaluation error","求值错误"],
    [7613,"&&ToggleSource","&&切换源"],
    [7898,"To customize Run and Debug [create a launch.json file]({0}).","要自定义运行和调试，请[创建一个 launch.json 文件]({0})。"],
    [7899,"To customize Run and Debug, [open a folder]({0}) and create a launch.json file.","要自定义运行和调试，请[打开文件夹]({0})并创建一个 launch.json 文件。"],
    [8039,"Search loaded scripts by name","按名称搜索已加载的脚本"],
    [8283,"Controls the timeout in milliseconds for HTTP requests made when fetching extensions from the Marketplace","控制从商城获取扩展时发出 HTTP 请求的超时时间(毫秒)"],
    [8405,"{0} for the Web","用于 Web 的 {0}"],
    [8535,"All GitHub Copilot functionality is now being served from the GitHub Copilot Chat extension. To temporarily opt out of this extension unification, toggle the {0} setting.","所有 GitHub Copilot 功能现在均通过 GitHub Copilot 对话助手扩展提供。若要暂时选择退出统一此扩展，请切换 {0} 设置。"],
    [8722,"Some extensions are disabled because they are not allowed by your system administrator.","由于系统管理员不允许，部分扩展已被禁用。"],
    [8723,"Some extensions are disabled because they are configured not to be allowed.","由于配置不允许，部分扩展已被禁用。"],
    [8759,"This extension is not compatible with {0}.","此扩展与 {0} 不兼容。"],
    [9338,"Response was empty","响应为空"],
    [9342,"Generate code","编辑、重构和生成代码"],
    [9343,"Modify selected code","修改所选代码"],
    [9344,"Working...","正在运行..."],
    [9345,"Fix the attached problems","修复附加的问题"],
    [9346,"Fix the attached problem","修复附加的问题"],
    [9347,"Inline Chat to Panel Chat","从内联聊天到面板聊天"],
    [9348,"Do you want to continue in Chat view?","是否要在“聊天”视图中继续操作?"],
    [9349,"Do you want to continue in Chat view?","是否要在“聊天”视图中继续操作?"],
    [9350,"Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat.","内联聊天旨在进行单文件代码更改。在“聊天”视图中继续你的请求，或重新表述请求来进行内联聊天。"],
    [9351,"Continue in Chat view","在“聊天”视图中继续"],
    [9352,"Cancel","取消"],
    [9353,"Don't ask again","不再询问"],
    [9354,"Reset Choice for 'Move Inline Chat to Panel Chat'","“将内联聊天移至面板聊天”的重置选择"],
    [9355,"Thank you for your feedback!","感谢提供反馈！"],
    [9358,"By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})","继续使用 {0} Copilot 即表示你同意 {1} 的[条款]({2})和[隐私声明]({3})"],
    [9372,"Whether an agent for notebook cells exists","是否存在适用于笔记本单元格的智能体"],
    [9373,"Whether an agent for notebook cells exists","是否存在适用于笔记本单元格的智能体"],
    [9456,"{0} handles feedback outside of Github.","{0} 在 Github 以外处理反馈。"],
    [9457,"Thanks you for helping us improve {0}! To open the issue/feedback reporter for {0}, click the button below.","感谢你帮助我们改进 {0}！要打开 {0} 的问题或反馈报告工具，请点击下方按钮。"],
    [9544,"{0} Artifacts View","{0} 产物视图"],
    [9545,"{0} Artifacts View","{0} 产物视图"],
    [9548,"&&Reload","&&重新加载"],
    [9549,"{0} Review Changes","{0} 审核更改"],
    [9550,"Clear and Disable Workbench Tracing","清除并禁用工作台跟踪"],
    [9551,"(Re)Enable Workbench Tracing","（重新）启用工作台跟踪"],
    [9631,"Language Packs","语言包"],
    [9662,"Download {0} Diagnostics","下载 {0} 诊断信息"],
    [9664,"Get {0} Diagnostics","获取 {0} 诊断信息"],
    [9666,"Open {0} Extension Logs Folder","打开 {0} 扩展日志文件夹"],
    [9683,"Foreground color for note alerts in markdown.","Markdown 中“备注”提示的前景色。"],
    [9684,"Foreground color for tip alerts in markdown.","Markdown 中“使用技巧”提示的前景色。"],
    [9685,"Foreground color for important alerts in markdown.","Markdown 中“重要信息”提示的前景色。"],
    [9686,"Foreground color for warning alerts in markdown.","Markdown 中“警告”提示的前景色。"],
    [9687,"Foreground color for caution alerts in markdown.","Markdown 中“注意”提示的前景色。"],
    [9847,"Browse MCP Servers","浏览 MCP 服务器"],
    [9858,"Skip Current Autostart","跳过当前自动启动"],
    [9899,"Select the configuration target","选择配置目标"],
    [9923,"Authorization Required","需要授权"],
    [9924,"Open this URL?","是否打开此 URL?"],
    [9926,"Open {0}","打开 {0}"],
    [9928,"This will open {0}","这将打开 {0}"],
    [9930,"Open URL","打开 URL"],
    [9988,"<Empty>","<空>"],
    [9990,"Go back ↩","返回 ↩"],
    [9994,"Install in Workspace","在工作区中安装"],
    [9996,"Workspace Folder","工作区文件夹"],
    [9997,"Workspace","工作区"],
    [9998,"Choose where to install the MCP server","选择 MCP 服务器的安装位置"],
    [9999,"Install (Remote)","安装(远程)"],
    [10000,"Install in {0}","在 {0} 中安装"],
    [10072,"Open Settings","打开“设置”"],
    [10074,"This feature is currently in preview. You can disable it anytime using the setting {0}.","此功能目前为预览版。可以随时通过设置 {0} 将其禁用。"],
    [10075,"Enable MCP Servers Marketplace","启用 MCP 服务器商城"],
    [10076,"Enable MCP Servers Marketplace","启用 MCP 服务器商城"],
    [10077,"Enable MCP Servers Marketplace?","是否启用 MCP 服务器商城?"],
    [10078,"This feature is currently in preview. You can disable it anytime using the setting {0}.","此功能目前为预览版。可以随时通过设置 {0} 将其禁用。"],
    [10079,"Enable","启用"],
    [10080,"Cancel","取消"],
    [10081,"No MCP Servers found.","找不到 MCP 服务器。"],
    [10097,"This MCP Server is disabled because MCP servers are configured to be disabled in the Editor. Please check your [settings]({0}).","此 MCP 服务器处于禁用状态，因为在编辑器中已将 MCP 服务器配置为禁用。请检查你的 [设置]({0})。"],
    [10098,"This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).","此 MCP 服务器处于禁用状态，因为它在编辑器中配置为禁用。请检查你的 [设置]({0})。"],
    [10099,"This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).","此 MCP 服务器处于禁用状态，因为它在编辑器中配置为禁用。请检查你的 [设置]({0})。"],
    [10103,"Expected 'when' to be a non-empty string.","\"when\" 应为非空字符串。"],
    [10110,"Antigravity configurations (`~/.codeium/antigravity/mcp_config.json`)","Antigravity 配置 (`~/.codeium/antigravity/mcp_config.json`)"],
    [10133,"Condition which must be true to enable this collection.","启用此集合时必须为 true 的条件。"],
    [10345,"Go to Next Change","转到下一个更改"],
    [10346,"Go to Previous Change","转到上一个更改"],
    [10410,"Find Next","查找下一个"],
    [10411,"Find Previous","查找上一个"],
    [10494,"Save Image","保存图像"],
    [10495,"Image Files","图像文件"],
    [10815,"Mimetypes","MIME 类型"],
    [10843,"Icon to save content to disk","用于将内容保存到磁盘的图标"],
    [11076,"General editor, workbench, and feature preferences","常规编辑器、工作台和功能首选项"],
    [11078,"Open Antigravity settings panel","打开 Antigravity 设置面板"],
    [11079,"Select Settings to Open","选择要打开的设置"],
    [11169,"{0} Settings","{0} 设置"],
    [11201,"Advanced","高级"],
    [11229,"Advanced","高级"],
    [11304,"Stable","稳定"],
    [11305,"Show stable settings","显示稳定版设置"],
    [11306,"Preview","预览"],
    [11307,"Show preview settings","显示预览设置"],
    [11308,"Experimental","实验性"],
    [11309,"Show experimental settings","显示实验版设置"],
    [11310,"Advanced","高级"],
    [11311,"Show advanced settings","显示高级设置"],
    [11380,"Advanced setting: this setting is intended for advanced scenarios and configurations. Only modify this if you know what it does.","高级设置: 此设置适用于高级场景和配置。只有在了解其作用时才修改。"],
    [11426,"Ask in Chat: {0}","在聊天中提问: {0}"],
    [11427,"Configure visibility","配置可见性"],
    [11812,"Multiple repositories can be selected at the same time.","可同时选择多个存储库。"],
    [11813,"Only one repository can be selected at a time.","一次只能选择一个存储库。"],
    [11814,"Controls the selection mode of the repositories in the Source Control Repositories view.","控制“源代码管理存储库”视图中存储库的选择模式。"],
    [11815,"Controls whether to show repository artifacts in the Source Control Repositories view. This feature is experimental and only works when {0} is set to `{1}`.","控制是否在“源代码管理存储库”视图中显示存储库工件。此功能是试验性的，仅当 {0} 设置为 `{1}` 时生效。"],
    [11828,"Controls whether to show incoming changes in the Source Control Graph view.","控制是否在“源代码管理图”视图中显示传入的更改。"],
    [11829,"Controls whether to show outgoing changes in the Source Control Graph view.","控制是否在“源代码管理图”视图中显示传出的更改。"],
    [11838,"Resolve Conflicts with AI","使用 AI 解决冲突"],
    [11880,"Incoming Changes","传入的更改"],
    [11881,"Outgoing Changes","传出的更改"],
    [11900,"Incoming Changes","传入的更改"],
    [11901,"Outgoing Changes","传出的更改"],
    [11913,"Incoming Changes","传入的更改"],
    [11914,"Outgoing Changes","传出的更改"],
    [11927,"Select Single Repository","选择单个存储库"],
    [11928,"Select Multiple Repositories","选择多个存储库"],
    [11984,"{0} ↔ {1} (Replace Preview)","{0} ↔ {1}（替换预览）"],
    [12381,"Task \"{0}\" finished in {1}.","任务 \"{0}\" 已在 {1} 中完成。"],
    [12382,"Task finished in {0}.","任务已在 {0} 中完成。"],
    [12383,"{0}m {1}s","{0} 分钟 {1} 秒"],
    [12384,"{0}m","{0} 分钟"],
    [12385,"{0}s","{0} 秒"],
    [12525,"Controls the minimum task runtime in milliseconds before showing an OS notification when the task finishes while the window is not in focus. Set to -1 to disable notifications. Set to 0 to always show notifications. This includes a window badge as well as notification toast.","控制在任务已完成且窗口未聚焦的情况下，距离显示 OS 通知的最短任务运行时间(毫秒)。设置为 -1 可禁用通知。设置为 0 则始终显示通知。这包括窗口徽章和通知横幅。"],
    [12624,"Controls whether to preserve the task name in the terminal after task completion.","控制在任务完成后是否在终端中保留任务名称。"],
    [12907,"Copy Selection (No Warning)","复制所选内容（不显示警告）"],
    [13012,"Show hidden chat terminals","显示隐藏的聊天终端"],
    [13013,"{0} Hidden Terminal","{0} 个隐藏终端"],
    [13014,"{0} Hidden Terminals","{0} 个隐藏终端"],
    [13015,"Show 1 hidden chat terminal","显示 1 个隐藏的聊天终端"],
    [13016,"Show {0} hidden chat terminals","显示 {0} 个隐藏的聊天终端"],
    [13048,"Attach To Chat","附加到聊天"],
    [13059,"Unknown","未知"],
    [13060,"Running","正在运行"],
    [13066,"Command executed {0} ","命令已执行 {0}"],
    [13075,"Defines terminal completion providers that will be registered when the extension activates.","定义扩展激活时将注册的终端补全提供程序。"],
    [13076,"A description of what the completion provider does. This will be shown in the settings UI.","对补全提供程序的作用的描述。该描述会显示在“设置”UI 中。"],
    [13091,"Highlight below the word for which a hover is shown. The color must not be opaque so as not to hide underlying decorations.","在下面突出显示悬停的字词。颜色必须透明，以免隐藏下面的修饰效果。"],
    [13246,"Configures the duration in milliseconds to wait for shell integration after launch before declaring it's not there. Set to {0} to wait the minimum time (500ms), the default value {1} means the wait time is variable based on whether shell integration injection is enabled and whether it's a remote window. Consider setting this to a small value if you intentionally disabled shell integration, or a large value if your shell starts very slowly.","配置启动后等待 shell 集成的时长(毫秒)，超过该时间则声明其不存在。设置为 {0} 以等待最短时间(500ms)，默认值 {1} 表示等待时间会根据是否启用 shell 集成注入及是否为远程窗口而变化。如果有意禁用 shell 集成，建议将其设置为较小的值；如果 shell 启动非常慢，建议将其设置为较大的值。"],
    [13247,"When shell integration is enabled, enables quick fixes for terminal commands that appear as a lightbulb or sparkle icon to the left of the prompt.","启用 shell 集成后，会为提示符左侧显示为灯泡或闪光图标的终端命令启用快速修复。"],
    [13256,"Simulated latency in milliseconds applied to all calls made to the pty host. This is useful for testing terminal behavior under high latency conditions.","对 pty 主机发出的所有调用都应用了模拟延迟(毫秒)。这有助于测试终端在高延迟情况下的行为。"],
    [13257,"Simulated startup delay in milliseconds for the pty host process. This is useful for testing terminal initialization under slow startup conditions.","pty 主机进程的模拟启动延迟(毫秒)。这有助于测试终端在缓慢启动情况下的初始化表现。"],
    [13258,"Enable developer mode for the terminal. This shows additional debug information and visualizations for shell integration sequences.","为终端启用开发人员模式。这会显示额外的调试信息和 shell 集成序列的可视化内容。"],
    [13261,"Whether a terminal in the Agent panel is focused.","智能体面板中的终端是否已聚焦。"],
    [13289,"Focus Terminal","聚焦终端"],
    [13307,"Reveal Command in Terminal","在终端中显示命令"],
    [13351,"Whether there are any chat terminals.","是否存在聊天终端。"],
    [13352,"Whether there are any hidden chat terminals.","是否存在隐藏的聊天终端。"],
    [13369,"Chat: Focus Most Recent Terminal","聊天：聚焦最近的终端"],
    [13370,"Chat: Focus Most Recent Terminal Output","聊天：聚焦最近的终端输出"],
    [13384,"View Hidden Chat Terminals","查看隐藏的聊天终端"],
    [13385,"Terminal","终端"],
    [13386,"Last: {0}","上次: {0}"],
    [13387,"Select a chat terminal to show and focus","选择要显示并聚焦的聊天终端"],
    [13388,"Chat Terminals","聊天终端"],
    [13394,"Allow All Commands in this Session","允许此会话中的所有命令"],
    [13395,"Allow this tool to run in this session without confirmation.","允许此工具在此会话中运行而无需确认。"],
    [13400,"Auto approved for this session","已对此会话自动审批"],
    [13401,"Disable","禁用"],
    [13402,"Web content may contain malicious code or attempt prompt injection attacks.","Web 内容可能包含恶意代码或尝试提示注入攻击。"],
    [13403,"View rule in settings","在设置中查看规则"],
    [13404,"Auto approved by setting {0}","已通过设置 {0} 自动审批"],
    [13405,"View settings","查看设置"],
    [13406,"Auto approved by rule {0}","已通过规则 {0} 自动审批"],
    [13407,"Auto approved by rule {0}","已通过规则 {0} 自动审批"],
    [13408,"Auto approved by rules {0}","已通过规则 {0} 自动审批"],
    [13409,"Auto approval denied by rule {0}","已通过规则 {0} 拒绝自动审批"],
    [13410,"Auto approval denied by rule {0}","已通过规则 {0} 拒绝自动审批"],
    [13411,"Auto approval denied by rules {0}","已通过规则 {0} 拒绝自动审批"],
    [13412,"File write operations detected that cannot be auto approved: {0}","检测到无法自动批准的文件写入操作: {0}"],
    [13413,"File write operations detected: {0}","检测到文件写入操作: {0}"],
    [13434,"Confirm Terminal Command","确认终端命令"],
    [13435,"Tool for confirming terminal commands","用于确认终端命令的工具"],
    [13451,"A task `{0}` with command `{1}`{2} will be created.","将创建任务 `{0}`，命令为 `{1}`{2}。"],
    [13461,"Task not found: `{0}`","找不到任务：`{0}`"],
    [13462,"The task `{0}` is already running.","任务 `{0}` 已在运行。"],
    [13463,"Task started but no terminal was found for: `{0}`","任务已启动，但未找到 `{0}` 对应的终端。"],
    [13464,"Task started but no terminal was found for: `{0}`","任务已启动，但未找到 `{0}` 对应的终端。"],
    [13465,"Task not found: `{0}`","找不到任务：`{0}`"],
    [13466,"The task is already running.","任务已在运行。"],
    [13467,"`{0}` is already running.","`{0}` 已在运行。"],
    [13468,"`{0}` was already running.","`{0}` 原本已在运行。"],
    [13469,"Running `{0}`","正在运行 `{0}`"],
    [13470,"Started `{0}`","已启动 `{0}`"],
    [13471,"Ran `{0}`","已运行 `{0}`"],
    [13472,"Allow task run?","是否允许任务运行?"],
    [13473,"Allow to run the task `{0}`?","是否允许运行任务 `{0}`?"],
    [13480,"A path to a shell executable.","shell 可执行文件的路径。"],
    [13481,"Controls whether to allow auto approval in the run in terminal tool.","控制在终端工具中的运行中是否允许自动审批。"],
    [13482,"Controls whether to allow auto approval in the run in terminal tool.","控制在终端工具中的运行中是否允许自动审批。"],
    [13487,"Note that there's a default set of rules to allow and also deny commands. Consider setting {0} to {1} to ignore all default rules to ensure there are no conflicts with your own rules. Do this at your own risk, the default denial rules are designed to protect you against running dangerous commands.","请注意，系统有一组默认规则用于允许和拒绝命令。建议将 {0} 设置为 {1} ，以忽略所有默认规则，确保不会与你自己的规则发生冲突。这样做需要自行承担风险，默认的拒绝规则旨在防止你运行危险命令。"],
    [13504,"Whether to ignore the built-in default auto-approve rules used by the run in terminal tool as defined in {0}. When this setting is enabled, the run in terminal tool will ignore any rule that comes from the default set but still follow rules defined in the user, remote and workspace settings. Use this setting at your own risk; the default auto-approve rules are designed to protect you against running dangerous commands.","是否如 {0} 中所定义，忽略终端工具中的运行使用的内置默认自动批准规则。启用此设置后，终端工具中的运行将忽略默认规则集中的所有规则，但仍会遵循用户设置、远程设置和工作区设置中定义的规则。使用此设置需要自行承担风险，默认自动批准规则旨在防止你运行危险命令。"],
    [13505,"Allow all detected file writes.","允许所有检测到的文件写入。"],
    [13506,"Block file writes detected outside the workspace. This depends on the shell integration feature working correctly to determine the current working directory of the terminal.","阻止在工作区外检测到的文件写入。这依赖于 shell 集成功能正常工作，以确定终端的当前工作目录。"],
    [13507,"Block all detected file writes.","阻止所有检测到的文件写入。"],
    [13508,"Controls whether detected file write operations are blocked in the run in terminal tool. When detected, this will require explicit approval regardless of whether the command would normally be auto approved. Note that this cannot detect all possible methods of writing files, this is what is currently detected:\n\n- File redirection (detected via the bash or PowerShell tree sitter grammar)","控制是否在终端工具的运行过程中阻止检测到的文件写入操作。此类操作在被检测到时，无论命令是否通常会自动批准，都需要获得明确批准。请注意，这无法检测所有可能的文件写入方式，目前检测到的方式包括:\r\n\r\n- 文件重定向(通过 bash 或 PowerShell 的 tree sitter 语法检测)"],
    [13510,"Use {0} instead","请改用 {0}"],
    [13511,"The terminal profile to use on Linux for chat agent's run in terminal tool.","在 Linux 上的聊天智能体在终端工具中运行所使用的终端配置文件。"],
    [13512,"The terminal profile to use on macOS for chat agent's run in terminal tool.","在 macOS 上的聊天智能体在终端工具中运行所使用的终端配置文件。"],
    [13513,"The terminal profile to use on Windows for chat agent's run in terminal tool.","在 Windows 上的聊天智能体在终端工具中运行所使用的终端配置文件。"],
    [13515,"Where to show the output from the run in terminal tool session.","在终端工具会话中显示运行输出的位置。"],
    [13516,"Reveal the terminal when running the command.","运行命令时显示终端。"],
    [13517,"Do not reveal the terminal automatically.","不自动显示终端。"],
    [13640,"Trigger Suggest","触发建议"],
    [13690,"The foreground color for a plaintext suggestion. These icons will appear in the terminal suggest widget.","纯文本建议的前景色。这些图标将显示在终端建议小组件中。"],
    [13709,"Icon for plain text suggestions in the terminal suggest widget.","终端建议小组件中纯文本建议的图标。"],
    [13737,"Controls whether a space is automatically inserted after accepting a suggestion and re-trigger suggestions. Folders and symbolic link folders will never have a trailing space added.","控制在接受建议并重新触发建议后是否自动插入空格。文件夹和符号链接文件夹从不添加尾随空格。"],
    [13739,"Show suggestions from {0}.","显示来自 {0} 的建议。"],
    [13741,"Controls which suggestions automatically show up while typing. Suggestion providers are enabled by default.","控制在键入时自动显示哪些建议。建议提供程序默认启用。"],
    [13750,"Would you like to enable the speech extension?","是否要启用语音扩展?"],
    [13751,"Enable Extension","启用扩展"],
    [13752,"Would you like to install 'VS Code Speech' extension from 'Microsoft'?","是否要从 \"Microsoft\" 安装 \"VS Code Speech\" 扩展?"],
    [13753,"Install Extension","安装扩展"],
    [13754,"Microphone support requires this extension.","麦克风支持需要此扩展。"],
    [13778,"Go to Next Uncovered Line","转到未覆盖的下一行"],
    [13779,"Go to Previous Uncovered Line","转到未覆盖的上一行"],
    [13786,"Navigate to the next line that is not covered by tests.","导航到测试未覆盖的下一行。"],
    [13787,"Navigate to the previous line that is not covered by tests.","导航到测试未覆盖的上一行。"],
    [13911,"Toggle Tree Position","切换树位置"],
    [14075,"Controls the layout of the Test Results view.","控制“测试结果”视图的布局。"],
    [14076,"Show the test run tree on the right side with details on the left.","在右侧显示测试运行树，在左侧显示详细信息。"],
    [14077,"Show the test run tree on the left side with details on the right.","在左侧显示测试运行树，在右侧显示详细信息。"],
    [14628,"Onboarding","入门"],
    [14709,"Accept an Autocomplete","接受自动补全"],
    [14710,"Tab to accept an Autocomplete","按 Tab 接受自动补全"],
    [14711,"Trigger Command","触发命令"],
    [14712,"Trigger Command","触发命令"],
    [14715,"Open Documentation","打开文档"],
    [14716,"Open Documentation","打开文档"],
    [14717,"Finish IDE Setup","完成 IDE 设置"],
    [14718,"Finish IDE Setup","完成 IDE 设置"],
    [14719,"Sign in to {0}","登录 {0}"],
    [14720,"Sign in to {0}","登录 {0}"],
    [14721,"Accept an Autocomplete","接受自动补全"],
    [14722,"Tab to accept an Autocomplete","按 Tab 接受自动补全"],
    [14723,"Trigger Command","触发命令"],
    [14724,"Trigger Command","触发命令"],
    [14749,"By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})","继续使用 {0} Copilot 即表示你同意 {1} 的[条款]({2})和[隐私声明]({3})"],
    [14931,"If you'd like to explore an untrusted workspace with the agent, we recommend enabling strict mode via the settings window. See the [strict mode docs](https://antigravity.google/docs/strict-mode) for details.","如果想让智能体探索不受信任的工作区，建议在设置窗口中启用严格模式。详情请参阅[严格模式文档](https://antigravity.google/docs/strict-mode)。"],
    [15070,"Show Content Tracing","显示内容跟踪"],
    [15083,"Close Active Window","关闭活动窗口"],
    [15092,"Close Other Windows","关闭其他窗口"],
    [15176,"Migrate Old Settings","迁移旧设置"],
    [15177,"Migrate Old Conversations","迁移旧对话"],
    [15214,"{0} on {1} will soon stop receiving updates. Consider upgrading your macOS version.","{1} 上的 {0} 将很快停止接收更新。请考虑升级 macOS 版本。"],
    [15248,"The Source Control repository menu","源代码管理存储库菜单"],
    [15257,"The Source Control artifact group context menu","源代码管理工件组上下文菜单"],
    [15258,"The Source Control artifact context menu","源代码管理工件上下文菜单"],
    [15300,"A prominent button overlaying the multi diff editor","覆盖在多差异编辑器上的醒目按钮"],
    [15306,"The Chat Editing widget toolbar menu for session changes.","用于会话更改的聊天编辑小组件工具栏菜单。"],
    [15308,"Menu for new chat sessions.","新建聊天会话菜单。"],
    [15536,"Folder path","文件夹路径"],
    [15649,"{0} for the Web","用于 Web 的 {0}"],
    [16329,"Settings dropdown icon.","设置下拉菜单图标。"],
  ];

  // Only patch untranslated entries in the verified IDE 2.6.0 workbench layout.
  // English source checks prevent overwriting a different language pack or a new IDE version.
  function applyIdeNlsMessages() {
    if (!window.location?.pathname?.endsWith('workbench.html') ||
        typeof window._VSCODE_NLS_LANGUAGE !== 'string' ||
        window._VSCODE_NLS_LANGUAGE.toLowerCase() !== 'zh-cn') return;
    const messages = window._VSCODE_NLS_MESSAGES;
    if (!Array.isArray(messages) || messages.length !== 16558 ||
        messages[3864] !== 'Used to represent onboardingsteps which have not been completed' ||
        messages[3865] !== 'Used to represent onboarding steps which have been completed' ||
        messages[3866] !== 'Code with Agent') return;
    for (const [index, original, translated] of ideNlsSupplement) {
      if (messages[index] !== original) continue;
      const custom = customTranslations.get(original.trim().toLowerCase());
      const replacement = custom === undefined ? translated : (custom || original);
      if (replacement === original) continue;
      try {
        messages[index] = replacement;
        if (messages[index] === replacement) ideNlsChanges.push({ messages, index, original, translated: replacement });
      } catch (_e) { /* Some workbenches may expose read-only localization data. */ }
    }
  }

  function restoreIdeNlsMessages() {
    for (const { messages, index, original, translated } of ideNlsChanges) {
      try { if (messages[index] === translated) messages[index] = original; } catch (_e) { /* ignore */ }
    }
    ideNlsChanges = [];
  }

  const phrases = new Map([
    ["How to manage and create plugins — namespaced bundles of skills, agents, rules, MCP servers and hooks that install, enable and disable as a single unit. Use this skill when the user wants to enable, disable, install or uninstall a plugin, when they want to create a new plugin, or when a new customization should be packaged into a plugin rather than left loose. Also triggered by the /plugin slash command. Don't use for the underlying customization system itself — discovery roots, loading priority, or authoring a standalone skill, agent, rule, hook or MCP server outside a plugin; see the customizations guide skill for those.", "介绍如何管理和创建插件。插件通过命名空间将技能、智能体、规则、MCP 服务器和钩子打包为一个整体，以便安装、启用和停用。当用户需要启用、停用、安装、卸载或创建插件，或者希望把新自定义项打包为插件时使用此技能。/plugin 斜杠命令也会触发此技能。不要将其用于底层自定义系统本身，例如发现根目录、加载优先级，或在插件外独立编写技能、智能体、规则、钩子或 MCP 服务器；这些情况请参阅自定义指南技能。"],
    ["How to write and run a dynamic workflow script with the `run_workflow` tool: a Python script that orchestrates many agents with `agent`, `parallel`, `pipeline`, and `phase`. Use when a task splits into many independent or staged pieces of agent work (fan out over files, modules, bugs, or review angles, then aggregate), or when the user asks for a workflow. Don't use for a single delegated task (use a subagent) or for legacy workflow files (see migrate-workflows).", "介绍如何使用 `run_workflow` 工具编写和运行动态工作流脚本：通过 Python 脚本中的 `agent`、`parallel`、`pipeline` 和 `phase` 协调多个智能体。当任务可分成多个独立或分阶段的智能体工作（例如按文件、模块、缺陷或审查角度分发后再汇总），或者用户要求使用工作流时使用此技能。不要将其用于单个委派任务（请使用子智能体）或旧版工作流文件（请参阅 migrate-workflows）。"],
    ["Teamwork Graph CLI is Atlassian's agent-first interface to your entire work context: Jira issues, Confluence pages, Bitbucket PRs, along with your connected third-party data sources. Purpose-built for coding agents like Antigravity (terminal or desktop), and powered by Atlassian's context graph. Try: \"draft a Jira issue from this PR and link it to the epic.\" Run /twg-setup after install to connect Atlassian Teamwork Graph CLI to Antigravity.", "Teamwork Graph CLI 是 Atlassian 面向智能体的工作上下文接口，可访问 Jira 问题、Confluence 页面、Bitbucket 拉取请求和已连接的第三方数据源。它基于 Atlassian 上下文图谱，专为 Antigravity 等终端或桌面编程智能体构建。试着说：“根据此拉取请求起草 Jira 问题并将其关联到史诗任务。”安装后运行 /twg-setup，将 Atlassian Teamwork Graph CLI 连接到 Antigravity。"],
    ["Provides a comprehensive guide, quick reference, and sitemap for Google Antigravity (AGY), including the Antigravity CLI (agy), Antigravity 2.0, Antigravity IDE, Python SDK, slash commands, keybindings, and customizations (skills, rules, MCP, sidecars). Activate this skill when the user asks questions about how to use, configure, or customize Antigravity, AGY, the agy CLI, the Antigravity IDE, or Antigravity 2.0.", "提供 Google Antigravity (AGY) 的全面指南、快速参考与站点地图，包括 Antigravity CLI (agy)、Antigravity 2.0、Antigravity IDE、Python SDK、斜杠命令、快捷键及自定义项（技能、规则、MCP、Sidecar）。当用户询问如何使用、配置或自定义 Antigravity、AGY、agy CLI、Antigravity IDE 或 Antigravity 2.0 时激活此技能。"],
    ["Migrates the user's MCP servers, skills, slash commands, subagents, and instruction files from other coding agents (Claude Code, Codex, Cursor, Gemini CLI) into one new Antigravity plugin. Use when the user wants to bring over, import, or migrate their setup or config from another agent or tool. Don't use for installing Marketplace plugins or authoring a new plugin from scratch (use the plugin skill).", "将用户在其他编码智能体（Claude Code、Codex、Cursor、Gemini CLI）中的 MCP 服务器、技能、斜杠命令、子智能体和指令文件迁移到一个新的 Antigravity 插件。当用户希望从其他智能体或工具导入或迁移其设置、配置时使用。不要用于安装插件市场中的插件或从头创建新插件（请使用 plugin 技能）。"],
    ["Within each group, models share a weekly limit and a 5-hour limit. Quota is consumed proportionally to the cost of the tokens. Thus, limits will last longer with shorter tasks or using more cost-effective models. The 5-hour limit smooths out aggregate demand to fairly distribute global capacity across all users, while your weekly limit is tied directly to your individual tier.", "在每个分组中，模型共享每周限额和 5 小时限额。额度的消耗与 Token 的成本成比例。因此，使用较短的任务或更具性价比的模型可以让限额维持更久。5 小时限额平滑了总体需求，以便在所有用户之间公平地分配全局容量，而您的每周限额则直接与您的个人套餐等级挂钩。"],
    ["Allow the agent to automatically view and edit files outside the current workspace. Use with caution: this gives the agent access to additional potentially-relevant information, but also allows the agent to access credential files, secrets, and other files outside of the workspace that could be targeted in prompt injection attacks or other exploits by malicious actors.", "允许智能体自动查看和编辑当前工作区之外的文件。请谨慎使用：此操作虽可让智能体获取更多潜在相关上下文，但也会使其能够访问工作区外的凭据、机密文件等，可能在提示词注入攻击或其他恶意漏洞利用中带来风险。"],
    ["When enabled, Agent can use browser tools to open URLs, read web pages, and interact with browser content. This allows the Agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.", "启用后，智能体可以使用浏览器工具打开 URL、读取网页并与浏览器内容交互。这能让智能体获取重要知识和验证方式，但任何浏览器集成都可能增加遭受外部恶意利用的风险。"],
    ["Give each Best of N fork its own clone of your Git repository instead of a copy-on-write overlay. Each fork is then a real repository, so commits it makes are kept when you choose it as the winner. Forks take longer to create, and the wait grows with the size of your repository. See go/jetski-best-of-n.", "为每个 Best of N 分支提供独立的 Git 仓库克隆，而非写时复制叠加层。每个分支都是真实仓库，因此在您将其选为优胜方案后会保留其提交记录。创建分支耗时更长，且等待时间随仓库体积增加。"],
    ["Let the agent use browser tools to open URLs, read web pages, and interact with browser content. This allows the agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.", "允许智能体使用浏览器工具打开网址、读取网页并与网页内容交互。这能让智能体获取重要（甚至关键）的信息与验证手段，但任何浏览器集成都会增加遭受外部恶意攻击与漏洞利用的风险。"],
    ["Let the agent use browser tools to open URLs, read web pages, and interact with browser content. This gives the agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.", "允许智能体使用浏览器工具打开 URL、读取网页并与浏览器内容交互。这能让智能体获取重要知识和验证方式，但任何浏览器集成都可能增加遭受外部恶意利用的风险。"],
    ["Discover UI plugin panels relevant to the current task and surface a one-click pill in chat to open (toggle) them in the side pane. Use when a running UI plugin's panel would help with what the user is doing, or right after the user enables a new UI plugin pane and a shortcut to open it is handy.", "查找与当前任务相关的界面插件面板，并在对话中提供一键按钮，用于打开或切换侧边面板。当正在运行的界面插件面板有助于用户完成当前工作，或用户刚启用新的界面插件面板、需要快捷打开方式时使用。"],
    ["When enabled, your UI will be slightly modified to ensure more consistent demos. This is only recommended for demo purposes. In most cases, you can run \"Antigravity: Start Demo Mode\" and \"Antigravity: Stop Demo Mode\" to control this switch and update your ~/.gemini/antigravity data directory.", "启用后，您的界面将稍作修改以确保演示的一致性。仅建议用于演示目的。在大多数情况下，您可以运行 “Antigravity: Start Demo Mode” 和 “Antigravity: Stop Demo Mode” 来控制此开关并更新您的 ~/.gemini/antigravity 数据目录。"],
    ["Google does not control the availability or functionality of third party developer tools. Your data from third party developer tools connected to your Antigravity instance may be shared with Google. Google will protect any such data in accordance with the Google Privacy Policy, found here:", "Google 无法控制第三方开发工具的可用性或功能。连接到您的 Antigravity 实例的第三方开发工具中的数据可能会与 Google 共享。Google 将按照以下 Google 隐私权政策保护此类数据："],
    ["Interactive guide to design and create a scheduled background automation. Use this skill when the user wants to create an automated or recurring scheduled task (e.g. \"summarize my emails every morning\", \"every Monday send me a to-do list\"). Also triggered by the /automation slash command.", "设计并创建定时后台自动化任务的交互式指南。当用户希望创建自动执行或定期运行的任务时使用此技能（例如“每天早上汇总我的邮件”“每周一给我发送待办事项清单”）。/automation 斜杠命令也会触发此技能。"],
    ["The agent never asks for confirmation before executing terminal commands (except those in the Deny list). This provides the agent with the maximum ability to operate over long periods without intervention, but also has the highest risk of the agent executing an unsafe terminal command.", "智能体在执行终端命令前从不请求确认（拒绝列表中的命令除外）。这能让智能体在无需干预的情况下最大程度地长时间自主运行，但也具有执行不安全终端命令的最高风险。"],
    ["Agent auto-executes commands matched by an allow list entry. For Unix shells, an allow list entry matches a command if its space-separated tokens form a prefix of the command's tokens. For PowerShell, the entry tokens may match any contiguous subsequence of the command tokens.", "智能体将自动执行与允许列表条目匹配的命令。对于 Unix Shell，如果允许列表条目的空格分隔令牌是该命令令牌的前缀，则匹配。对于 PowerShell，条目令牌可匹配命令令牌的任意连续子序列。"],
    ["How to render rich interactive HTML widgets inline in the chat or as standalone artifacts. Use this skill when you want to show the user diagrams, data visualizations, interactive controls, educational walkthroughs, or any rich visual content beyond plain text and markdown.", "介绍如何在对话中内嵌或以独立产物形式呈现丰富的交互式 HTML 组件。需要向用户展示图表、数据可视化、交互控件、教学演示，或纯文本和 Markdown 之外的其他丰富视觉内容时使用此技能。"],
    ["Give each Best of N fork a full clone of your workspace, including its local commit history. Choosing a winner then gives your workspace that fork's state, so the commits it made are kept. Forks take longer to create than the default CitC clone. See go/jetski-best-of-n.", "为每个 Best of N 分支提供包含本地提交历史的完整工作区克隆。选出优胜方案后，工作区将采用该分支的状态并保留其提交记录。创建耗时比默认 CitC 克隆更长。"],
    ["Slightly modify your UI to ensure more consistent demos. This is only recommended for demo purposes. In most cases, you can run \"Antigravity: Start Demo Mode\" and \"Antigravity: Stop Demo Mode\" to control this switch and update your ~/.gemini/antigravity data directory.", "微调界面以确保演示效果更加一致。仅建议用于演示目的。大多数情况下，您可以运行“Antigravity: Start Demo Mode”和“Antigravity: Stop Demo Mode”来控制此开关并更新 ~/.gemini/antigravity 数据目录。"],
    ["Comprehensive guide and reference for the Antigravity Customization System. Use to explain how customizations work, their loading priority, discovery mechanisms, and to guide the creation of skills, rules, plugins, hooks, and MCP servers.", "Google Antigravity 自定义系统的全面指南与参考。用于解释自定义项的工作原理、加载优先级、发现机制，并指导技能、规则、插件、钩子及 MCP 服务器的创建。"],
    ["Give your AI agent 600,000+ real app screens, and the skills to use them. Includes the Mobbin MCP and a skill that redesigns your screen from patterns real apps ship, in your own design system, with the references behind every change.", "为人工智能智能体提供超过 60 万个真实应用界面及使用这些界面的技能。包含 Mobbin MCP 和一项技能，可根据真实应用采用的模式，使用您自己的设计系统重新设计界面，并提供每项更改的参考依据。"],
    ["Show a floating notification card when background conversations need your input. Answer questions, approve commands, and grant permissions without leaving your current conversation. Share feedback at go/inline-actions-feedback.", "当后台对话需要您输入时显示浮动通知卡片。无需离开当前对话即可回答问题、批准命令和授予权限。可在 go/inline-actions-feedback 分享反馈。"],
    ["AI coding agents are known to have certain security risks, including autonomous code execution, data exfiltration, prompt injection and supply chain risks. Ensure that you monitor and verify all actions taken by the agent.", "AI 编程智能体存在一定的安全风险，包括自主执行代码、数据外传、提示词注入和供应链风险。请确保监控并核实智能体执行的所有操作。"],
    ["Accept payments and grow your business. Stripe's official MCP server enables AI agents to manage customers, products, prices, payment links, invoices, subscriptions, and refunds, as well as search Stripe documentation.", "接受付款并拓展业务。Stripe 官方 MCP 服务器支持人工智能智能体管理客户、产品、价格、付款链接、发票、订阅和退款，并搜索 Stripe 文档。"],
    ["Controls whether terminal commands require your approval before running.  Note: A change to this setting will only apply to new messages sent to the agent. In-progress responses will use the previous setting value.", "控制终端命令在执行前是否需要你的审批。注意：此设置的更改仅适用于向智能体发送的新消息，进行中的响应将继续使用先前的设置。"],
    ["Useful for tasks that require file access across your full machine. The agent has full read and write access to all local files, but all proposed terminal commands require manual review and approval before running.", "适用于需要在整机范围内访问文件的任务。智能体对所有本地文件具有完全读写权限，但在执行任何终端命令前均需手动审查与批准。"],
    ["The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.", "下方明细显示规则、技能和 MCP 等自定义项的 Token 使用量。超出预算时，大型规则会降级为路径指针，大型自定义项会被自动排除。"],
    ["You are logged in using Application Default Credentials (ADC). To log out, undo any changes to ~/.gemini/config/config.json (or unset AGY_ADC_AUTH if launched from terminal) and restart the application.", "你使用应用默认凭据（ADC）登录。如需退出，请撤销对 ~/.gemini/config/config.json 的修改（如果从终端启动，也可取消设置 AGY_ADC_AUTH），然后重启应用。"],
    ["Automatically migrate legacy workflows to modern skills across global and workspace configurations. Scans for existing workflows, creates target SKILL.md files, and safely archives old workflow files.", "自动将全局及工作区配置中的旧工作流迁移为新版技能。会扫描已有工作流、创建目标 SKILL.md 文件，并安全归档旧工作流文件。"],
    ["A high-risk mode that disables all safety barriers. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts.", "一种禁用所有安全屏障的高风险模式。智能体将以完全系统访问权限运行，自动执行所有终端命令，读写所有本地文件，且不弹出审查提示。"],
    ["When toggled on, Antigravity IDE will use your AI credits to fulfill model requests once you're out of model quota. Antigravity IDE will always use your model quota first before using AI credits.", "开启后，当模型额度用完时，Antigravity IDE 将使用 AI 积分完成模型请求。Antigravity IDE 始终会先使用模型额度，再使用 AI 积分。"],
    ["Useful for typical development with an emphasis on security. It prioritizes safety over speed by requiring manual approval for all terminal commands and files outside the project directory.", "适用于注重安全性的常规开发场景。通过对所有终端命令和项目目录之外的文件访问强制要求手动审批，安全性优先于速度。"],
    ["Agent asks for permission before executing commands matched by a deny list entry. The deny list follows the same matching rules as the allow list and takes precedence over the allow list.", "在执行与拒绝列表条目匹配的命令前，智能体会先请求权限。拒绝列表遵循与允许列表相同的匹配规则，且优先级高于允许列表。"],
    ["When toggled on, Antigravity will use your AI credits to fulfill model requests once you're out of model quota. Antigravity will always use your model quota first before using AI credits.", "开启后，当模型额度用完时，Antigravity 将使用 AI 积分完成模型请求。Antigravity 始终会先使用模型额度，再使用 AI 积分。"],
    ["Enforce settings that prevent the agent from autonomously running targeted exploits and require human review for all agent actions. Visit antigravity.google/docs/strict-mode for details.", "强制启用安全设置，防止智能体自主执行针对性的漏洞利用，并要求所有智能体操作均经过人工审核。详情请访问 antigravity.google/docs/strict-mode。"],
    ["Try out early-stage features before they ship. These may be changed or removed at any time. These features are experimental, and we make no guarantees about performance or functionality.", "在正式发布前试用早期功能。这些功能可能随时更改或移除，属于实验性质，我们不对其性能或功能作任何保证。"],
    ["Automated safeguards help to protect your conversations from insecure or unsafe content. That being said, users should be aware of potential agentic risks, including data exfiltration.", "自动安全措施有助于保护对话免受不安全内容的影响。用户仍应了解智能体可能带来的风险，包括数据外传。"],
    ["View your available model quota and AI credits. Model quota refreshes periodically based on your plan. Enable AI Credit Overages to continue using models when your quota is exhausted.", "查看可用的模型额度和 AI 积分。模型额度会根据你的套餐定期刷新。启用 AI 积分超额使用后，可在额度耗尽时继续使用模型。"],
    ["Agent skills for Neo4j graph database — write Cypher queries, design graph models, use drivers, run imports, build GraphRAG pipelines, run GDS algorithms, and manage Aura instances.", "用于 Neo4j 图数据库的智能体技能：编写 Cypher 查询、设计图模型、使用驱动、导入数据、构建 GraphRAG 流程、运行 GDS 算法和管理 Aura 实例。"],
    ["Databricks skills for the CLI, Apps, Lakebase, Model Serving, Lakeflow Jobs, Spark Declarative Pipelines, Declarative Automation Bundles (DABs), and classic-to-serverless migration.", "适用于 Databricks 命令行、应用、Lakebase、模型服务、Lakeflow 作业、Spark 声明式流水线、声明式自动化包以及从经典架构迁移到无服务器架构的技能。"],
    ["Terminal commands automatically proceed inside the sandbox. A command that needs to leave the sandbox proceeds only if an agent judges it reversible, and otherwise requests review.", "终端命令会在沙盒内自动继续执行。需要脱离沙盒的命令仅在智能体判断其可逆时才会继续执行，否则会请求审核。"],
    ["Adds an Autonomous Mode switch to the modes dropdown below the input box. Turns sent with it on run non-interactively: the agent does not ask questions or request new permissions.", "在输入框下方的模式下拉菜单中添加“自主模式”开关。开启后发送的轮次将以非交互方式运行：智能体不会提问或请求新权限。"],
    ["Please describe the feature you'd like to see. The more detailed the requirements, the easier it will be for our team to incorporate your ideas. Some helpful information includes:", "请描述你希望增加的功能。需求越详细，我们的团队就越容易采纳你的想法。以下信息可能有帮助："],
    ["Sets the `workspaceUri` URL parameter and reloads, repointing the active workspace. Pick a folder from an existing project or enter a custom URI (e.g. file:///path/to/workspace).", "设置 `workspaceUri` URL 参数并重新加载以重定向活动工作区。请从现有项目中选择文件夹，或输入自定义 URI（例如 file:///path/to/workspace）。"],
    ["Your Antigravity use will be associated with provided project. Make sure you trust the project ID before proceeding. Account activity and data may be logged by your organization.", "你的 Antigravity 使用将与所提供的项目关联。继续之前，请确认你信任该项目 ID。你的组织可能会记录账号活动和数据。"],
    ["Verify that these licenses were provided by your administrator and that you trust the project ID before proceeding. Account activity and data may be logged by your organization.", "继续之前，请确认这些许可证由管理员提供，且你信任该项目 ID。你的组织可能会记录账号活动和数据。"],
    ["Use the IDE's shell integration to detect and report terminal command execution. When disabled, the agent uses its own shell. Restart the application for this to take effect.", "使用 IDE 的 Shell 集成来检测并报告终端命令执行情况。禁用时，智能体将使用自带 Shell。重启应用后生效。"],
    ["When enabled, Agent is given awareness of lint errors created by its edits and may fix them without explicit user prompting. Note that this may increase Agent's tool usage.", "启用后，智能体将获悉其编辑产生的 Lint 错误，并可在用户未明确要求的情况下修复这些错误。请注意，这可能增加智能体的工具使用量。"],
    ["Build applications with the Gemini Interactions API and Live API, including text, image, video, and speech generation, managed agents, and real-time multimodal streaming.", "使用 Gemini Interactions API 和 Live API 构建应用，支持文本、图像、视频和语音生成、托管智能体及实时多模态流。"],
    ["Permanently delete your remote conversations, projects, scheduled tasks, connected plugins and settings. Data in the desktop app and your Google account are not affected.", "永久删除你的远程会话、项目、定时任务、已连接的插件及设置。桌面客户端本地数据及你的 Google 账号不受影响。"],
    ["When Turbo mode is on, the agent will automatically capture screenshots in the Browser without explicit user input. You can toggle this setting in Antigravity's settings.", "开启 Turbo 模式后，智能体将在浏览器中自动截图，无需用户明确操作。你可以在 Antigravity 设置中调整此项。"],
    ["The agent never asks for review. This maximizes the autonomy of the agent, but also has the highest risk of the agent operating over unsafe or injected artifact content.", "智能体从不请求审核。这能最大限度提高自主性，但智能体处理不安全或被注入恶意内容的产物时执行操作的风险也最高。"],
    ["The breakdown below shows token usage from customizations like skills, rules, and MCP. If the budget is exceeded, large customizations will be truncated automatically.", "下面的明细展示技能、规则和 MCP 等自定义内容的 Token 使用量。如果超出预算，较大的自定义内容会被自动截断。"],
    ["Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content.", "智能体从不请求审核。这能最大限度提高自主性，但智能体处理不安全或被注入恶意内容的产物时执行操作的风险也最高。"],
    ["Connect Antigravity to your Notion workspace with the Notion MCP server, plus skills for research, documentation, meeting prep, specs, trackers, and project updates.", "通过 Notion MCP 服务器将 Antigravity 连接到 Notion 工作区，并使用研究、文档、会议准备、规格说明、跟踪和项目更新技能。"],
    ["Allow Tab to view and edit the files in .gitignore. Use with caution if your .gitignore lists files containing credentials, secrets, or other sensitive information.", "允许 Tab 键查看和编辑 .gitignore 中的文件。如果您的 .gitignore 列出了包含凭据、机密或其他敏感信息的文件，请谨慎使用。"],
    ["Orchestrates Android development tasks including project creation, deployment, SDK management, and environment diagnostics using the `android` command-line tool.", "使用 android 命令行工具协调 Android 开发任务，包括项目创建、部署、SDK 管理和环境诊断。"],
    ["Configure the browser subagent. It requires Google Chrome to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.", "配置浏览器子智能体。它需要安装 Google Chrome。你可以在对话输入框中输入 /browser 来调用浏览器子智能体。"],
    ["Connect Antigravity to Dropbox to search, inspect, summarize, share, collect uploads, organize folders, and clean up files with confirmation for write actions.", "将 Antigravity 连接到 Dropbox，以搜索、查看、总结和共享文件，收集上传内容并整理文件夹；写入操作需要确认。"],
    ["Deploy, configure, monitor, and troubleshoot apps, databases, and infrastructure on Railway from Antigravity with Railway's agent skill and hosted MCP server.", "通过 Railway 智能体技能和托管 MCP 服务器，在 Antigravity 中部署、配置、监控和排查 Railway 上的应用、数据库及基础设施。"],
    ["Logs each telemetry event to the browser's DevTools console as it fires, with the click or key that caused it. Stays on across reloads until you turn it off.", "在每个遥测事件触发时将其连同触发它的点击或按键实时输出到浏览器的 DevTools 控制台。跨页面刷新保持生效，直到手动关闭。"],
    ["A permanent Chief of Staff conversation in the sidebar that manages your other conversations: delegate tasks, check status, and read results from one place.", "在侧边栏保留一个统筹助手对话，集中管理其他对话：分派任务、检查状态并查看结果。"],
    ["Add Auth0 authentication to any app: login, MFA, SSO, Organizations, RBAC, custom domains, and branding. Debug auth errors and migrate from other providers.", "为应用添加 Auth0 身份验证，包括登录、多因素认证、单点登录、组织、基于角色的访问控制、自定义域名和品牌设置；排查身份验证错误并从其他提供商迁移。"],
    ["Free users and Google AI Plus users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.", "免费用户和 Google AI Plus 用户可获得 Antigravity 的最低基础额度。升级到 Google AI Pro 或更高版本可获得更高的速率限制。"],
    ["Investigate production issues with real Dynatrace data: problems and root causes, logs, metrics, traces, and vulnerabilities, via skills and the MCP server.", "通过技能和 MCP 服务器，使用真实 Dynatrace 数据调查生产问题，包括问题及根因、日志、指标、链路追踪和漏洞。"],
    ["Build, publish, and manage WordPress.com and Jetpack-connected sites. Draft posts, edit blocks, check traffic stats, moderate comments, and manage plugins.", "构建、发布和管理 WordPress.com 及连接 Jetpack 的网站，起草文章、编辑区块、查看流量统计、审核评论并管理插件。"],
    ["Build and deploy on Netlify: functions, edge functions, blobs, database, identity, forms, image CDN, caching, and AI Gateway, plus the Netlify MCP server.", "在 Netlify 上构建和部署，使用函数、边缘函数、对象存储、数据库、身份、表单、图像 CDN、缓存、AI 网关及 Netlify MCP 服务器。"],
    ["Uploaded project files and in-chat attachments are stored on Google servers and mounted into your cloud sandbox so your agent can read and work with them.", "上传的项目文件和聊天附件存储在 Google 服务器上，并挂载到你的云端沙盒中，以便智能体读取与处理。"],
    ["Please describe the issue in detail. The more actionable your feedback, the quicker our team can address your request. Some helpful information includes:", "请详细描述问题。您的反馈越具体，我们的团队就能越快处理您的请求。一些有用的信息包括："],
    ["Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the application menu.", "有新版本可用时自动提示重启应用。禁用后，你可以通过应用程序菜单手动检查更新。"],
    ["When enabled, the agent will be able to access its knowledge base to inform its responses and automatically generate knowledge items in the background.", "启用后，智能体将能够访问其知识库以辅助生成回复，并在后台自动生成知识项。"],
    ["SEO workflows on live Semrush data: keyword research, site audits, backlinks, competitor, traffic and market analytics, PPC, and AI brand visibility.", "基于实时 Semrush 数据执行搜索引擎优化工作流，包括关键词研究、网站审计、反向链接、竞争对手、流量和市场分析、按点击付费广告及人工智能品牌可见度。"],
    ["Use the official CrowdStrike-hosted MCP server to work across Falcon: detections, cases, threat intel, SIEM, hosts, vulnerabilities, cloud, and more.", "使用 CrowdStrike 官方托管的 MCP 服务器处理 Falcon 中的检测、案件、威胁情报、安全信息与事件管理、主机、漏洞和云资源等。"],
    ["Search Intercom conversations, contacts, and companies, spot support trends, and install the Intercom Messenger with secure identity verification.", "搜索 Intercom 对话、联系人和公司，发现支持趋势，并安装具有安全身份验证的 Intercom Messenger。"],
    ["Please describe your auth or billing issue. More details will help our support team resolve your issue quicker. Some helpful information includes:", "请描述你的身份验证或计费问题。更多细节有助于支持团队更快解决问题。以下信息可能有帮助："],
    ["Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.", "当有新版本可用时，自动提示您重启应用。禁用后，您可以从应用菜单中手动检查更新。"],
    ["Plan and track work in monday.com from Antigravity: create, update and assign items, write docs, and build forms that turn requests into items.", "在 Antigravity 中规划和跟踪 monday.com 工作：创建、更新及分配事项，编写文档，并创建将请求转为事项的表单。"],
    ["Up-to-date documentation lookup. Pull version-specific documentation and code examples directly from source repositories into your LLM context.", "查询最新文档，将指定版本的文档和代码示例直接从源代码仓库引入大语言模型上下文。"],
    ["Build and deploy Base44 full-stack apps: CLI project management, JavaScript/TypeScript SDK development, and production troubleshooting skills.", "构建和部署 Base44 全栈应用，包括命令行项目管理、JavaScript/TypeScript SDK 开发和生产环境排查技能。"],
    ["Specifies the agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.", "指定智能体请求审核产物时的行为。产物是智能体创建的文档，用于提供更丰富的对话体验。"],
    ["You should not enter any sensitive information on this site (for example, passwords or credit cards), because it could be stolen by attackers.", "你不应在此网站上输入任何敏感信息（例如密码或信用卡号），因为这些信息可能被攻击者窃取。"],
    ["Guidelines for interacting with GitHub and request permissions from the user when commands fail due to restrictions in the agent environment.", "与 GitHub 交互的指南；当命令因智能体运行环境的限制而失败时，向用户请求权限。"],
    ["Git-on-Borg repository used when creating a new Cog workspace from your initial prompt (e.g., chromium/src or android/platform/superproject).", "用于根据你的初始提示创建 Cog 工作区的 Git-on-Borg 仓库（例如 chromium/src 或 android/platform/superproject）。"],
    ["Give your agent a real browser: navigate, click, type, screenshot, and extract data from any site, locally or on Browserbase cloud browsers.", "为智能体提供真实浏览器，在本地或 Browserbase 云浏览器中导航、点击、输入、截图并提取网站数据。"],
    ["Note: A change to this setting will only apply to new messages sent to the agent. In-progress responses will use the previous setting value.", "注意：对此设置的更改仅适用于发送给智能体的新消息。正在进行的回复仍使用之前的设置值。"],
    ["Remove individual uploaded files or connected resources in Project Settings, or delete a project or conversation to remove its stored files.", "你可以在项目设置中移除单独上传的文件或关联的资源，也可直接删除项目或会话以清理其存储的文件。"],
    ["Rules and customization token budgets exceeded. Large rules are demoted to path pointers and large customizations are excluded from context.", "规则和自定义项的 Token 预算均已超出。较大的规则会降级为路径引用，较大的自定义项将从上下文中排除。"],
    ["Build and deploy web apps and AI agents on Vercel with skills for Next.js, AI SDK, and cloud services, plus the official Vercel MCP server.", "使用 Next.js、AI SDK 和云服务技能以及官方 Vercel MCP 服务器，在 Vercel 上构建和部署网页应用与人工智能智能体。"],
    ["Changes the base URL for marketplace search results. You must restart Antigravity IDE to use the new marketplace after changing this value.", "更改插件市场搜索结果的基准 URL。更改此值后，您必须重启 Antigravity IDE 才能使用新的插件市场。"],
    ["Specifies Agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.", "指定智能体在请求审核产物时的行为。产物是智能体创建的文档，用于提供更丰富的对话体验。"],
    ["The product development system for teams and agents. Manage issues, projects, and documents across your Linear workspace from Antigravity.", "面向团队和智能体的产品开发系统。在 Antigravity 中管理 Linear 工作区的问题、项目和文档。"],
    ["Files, folders, and repositories you connect are accessible to your agent in this project, including during background or scheduled runs.", "你关联的文件、文件夹与代码仓库在当前项目中均可供智能体访问，包括后台任务或定时运行期间。"],
    ["Connect your agent to invideo's AI-native video editor. It trims, grades and mixes on a real timeline while you watch every change land.", "将智能体连接到 invideo 的人工智能视频编辑器，在真实时间线上剪辑、调色和混音，并实时查看每项更改。"],
    ["Note: A change to this setting will only apply to new messages sent to Agent. In-progress responses will use the previous setting value.", "注意：对此设置的更改将仅适用于发送给智能体的新消息。正在进行的回复将使用之前的设置值。"],
    ["Search and read your Wispr Flow meeting notes, transcripts, scratchpad notes, and calendar events. Read-only access to your own account.", "搜索和阅读 Wispr Flow 会议笔记、转录、草稿笔记和日历活动；仅对您自己的账户提供只读访问。"],
    ["Artifacts like Google Docs, PDFs, Office documents (Word, Excel, PowerPoint), etc. Everything else the agent creates is under Artifacts.", "产物包括 Google 文档、PDF 和 Office 文档（Word、Excel、PowerPoint）等。智能体创建的其他内容也位于产物中。"],
    ["Changes the base URL for marketplace search results. You must restart Antigravity to use the new marketplace after changing this value.", "更改插件市场搜索结果的基准 URL。更改此值后，您必须重启 Antigravity 才能使用新的插件市场。"],
    ["Build Wix apps and headless sites, and manage Wix stores, bookings, CMS and more, with Wix CLI skills and the official Wix MCP server.", "使用 Wix CLI 技能和官方 Wix MCP 服务器构建 Wix 应用与无头网站，管理商店、预约和内容管理系统等。"],
    ["Configure allowed and denied URLs for the browser subagent. It runs in the built-in browser, so no separate browser install is needed.", "配置浏览器子智能体允许和拒绝访问的网址。它在内置浏览器中运行，因此无需单独安装浏览器。"],
    ["Create and send proposals, quotes, and contracts for e-signature. Track signing progress and identify documents that need follow-up.", "创建并发送提案、报价和合同以供电子签署，跟踪签署进度并找出需要跟进的文档。"],
    ["Changes the base URL on each extension page. You must restart Antigravity IDE to use the new marketplace after changing this value.", "更改每个插件页面的基准 URL。更改此值后，您必须重启 Antigravity IDE 才能使用新的插件市场。"],
    ["Manage your Bigin CRM from Antigravity: review pipelines, find contacts and deals, log calls, plan follow-ups, and email customers.", "在 Antigravity 中管理 Bigin 客户关系系统：查看销售流程，查找联系人和交易，记录通话，安排跟进并给客户发送邮件。"],
    ["Changes the base URL on each extension page. You must restart Antigravity to use the new marketplace after changing this value.", "更改每个插件页面的基准 URL。更改此值后，您必须重启 Antigravity 才能使用新的插件市场。"],
    ["Enable fine-grained GitHub permissions and define the org, repository, and resource-level access the agent is allowed to use.", "启用细粒度 GitHub 权限，并定义允许智能体使用的组织、仓库和资源级访问权限。"],
    ["When enabled, Agent is given awareness of lint errors created by its edits and may fix them without explicit user prompting.", "启用后，智能体将获悉其编辑产生的 Lint 错误，并可在用户未明确要求的情况下修复这些错误。"],
    ["A chunk is a section of the page. Long pages are chunked so that only the sections that are relevant to your query are read.", "分块是页面的一个部分。较长页面会被分成多个部分，只读取与你的查询相关的部分。"],
    ["Sign in to an app once and your agent can use it on any device. Open an app to see the account it uses or to disconnect it.", "登录一次应用后，智能体即可在任何设备上使用它。打开应用可以查看所用账号或断开连接。"],
    ["Services this plugin connects to on your behalf. Credentials stay on this machine and are only sent to the domains listed.", "此插件代表你连接的服务。凭据保留在本机，只会发送到所列域名。"],
    ["Turn Figma designs into production code, map components with Code Connect, and create or edit Figma files in Antigravity.", "将 Figma 设计转换为生产代码，使用 Code Connect 映射组件，并在 Antigravity 中创建或编辑 Figma 文件。"],
    ["What should the agent do on each run? For example: summarize new bugs assigned to me and anything that changed overnight.", "智能体每次运行时应该做什么？例如：汇总分配给我的新错误和昨晚发生的变更。"],
    ["Choose a predefined security preset for the agent. This controls terminal auto-execution policy, and file access policy.", "为智能体选择预设安全策略。它会控制终端自动执行策略和文件访问策略。"],
    ["This shortcut is reserved by browser tabs and may not trigger in Web mode. It works in the Desktop Hub or installed PWA.", "此快捷键已被浏览器标签页占用，在网页模式下可能无法触发。在桌面客户端或已安装的 PWA 中可正常使用。"],
    ["Always auto-execute commands unless they are in your deny list. This also allows Agent to auto-execute Browser controls.", "始终自动执行命令，拒绝列表中的命令除外。此设置也允许智能体自动执行浏览器操作。"],
    ["Request Review - Agent always asks for confirmation before executing terminal commands (except those in the Allow List)", "请求审核——智能体在执行终端命令前始终请求确认（允许列表中的命令除外）"],
    ["Always Proceed - Agent never asks for confirmation before executing terminal commands (except those in the Deny List)", "始终继续——智能体在执行终端命令前从不请求确认（拒绝列表中的命令除外）"],
    ["Custom path for the browser user profile directory. Leave empty for default (~/.gemini/antigravity-browser-profile).", "浏览器用户资料目录的自定义路径。留空则使用默认路径（~/.gemini/antigravity-browser-profile）。"],
    ["No models are available for your current project or account. Please check your project settings and IAM permissions.", "当前项目或账户没有可用的模型。请检查您的项目设置和 IAM 权限。"],
    ["This page is taking longer than expected to load, or it may be blocking embedded views (via X-Frame-Options or CSP).", "此页面加载时间超出预期，或者它通过 X-Frame-Options 或 CSP 阻止了嵌入式视图。"],
    ["You currently don't have any MCP Servers installed. Add an MCP server above or add a custom one via the MCP Config.", "您当前还没有安装任何 MCP 服务器。请在上方添加 MCP 服务器，或通过 MCP 配置文件添加自定义服务器。"],
    ["Connect to your managed Looker MCP server to explore data, run saved Looks, build dashboards, and validate LookML.", "连接到托管的 Looker MCP 服务器，以探索数据、运行已保存的 Look、构建仪表盘并验证 LookML。"],
    ["Recommended: 64,000–256,000 tokens. Actual compaction threshold may differ since max output tokens are subtracted.", "建议范围：64,000–256,000 个 Token。由于会减去最大输出 Token 数，实际压缩阈值可能有所不同。"],
    ["Show how full the context window is next to the send button. Click it for a breakdown and to see your model quota.", "在发送按钮旁显示上下文窗口的使用进度。点击可查看明细及模型配额。"],
    ["The app will be accessible from the menu bar and will keep running in the background when all windows are closed.", "应用可从菜单栏访问，并会在所有窗口关闭后继续在后台运行。"],
    ["A nickname for identifying this application in the companion website. Changing this will restart the connection.", "用于在配套网站中标识此应用的昵称。更改此项将重新建立连接。"],
    ["By default, agents work in folders you choose and ask before sensitive changes. Adjust this anytime in Settings.", "默认情况下，智能体仅在你选定的文件夹中工作，并在执行敏感更改前请求确认。你可随时在设置中调整此项。"],
    ["When enabled, 'Explain and Fix' actions will continue in the current conversation instead of starting a new one.", "启用后，“解释并修复”操作将在当前对话中继续，而不是开始新对话。"],
    ["Go to the machine you are controlling and quit Antigravity. It installs pending updates the next time it starts.", "请在你控制的电脑上退出 Antigravity。下次启动时会安装待处理的更新。"],
    ["Prototype, build & run modern apps that users love with Firebase's backend, AI, and operational infrastructure.", "借助 Firebase 的后端、人工智能和运维基础设施，设计、构建和运行现代应用。"],
    ["Reliable automation, in-depth debugging, and performance analysis in Chrome using Chrome DevTools and Puppeteer", "使用 Chrome DevTools 和 Puppeteer 在 Chrome 中进行可靠的自动化、深度调试和性能分析"],
    ["We recommend attaching logs. Attaching logs will help the Antigravity team act on and prioritize your feedback.", "我们建议附上日志。附上日志将有助于 Antigravity 团队处理并优先解决您的反馈。"],
    ["When enabled, the Changes Overview toolbar will automatically expand when Agent finishes generating a response.", "启用后，Changes Overview 工具栏将在智能体完成回复生成时自动展开。"],
    ["A shell setup script run before every command the agent executes in this project. Overrides the global script.", "在智能体于当前项目中执行每条命令前所运行的 Shell 初始化脚本。该设置会覆盖全局脚本。"],
    ["Projects serve as your workspace where your agents work. Each project has its own file scope and permissions. ", "项目是智能体工作的工作区。每个项目都有自己的文件范围和权限。"],
    ["Terminal command automatically proceeds if the command runs inside the sandbox. Otherwise, it requests review.", "如果终端命令在沙盒内运行，则会自动继续执行；否则会请求审核。"],
    ["Install or enable the Google Drive plugin in Customizations to search files with @drive: or paste Drive links", "在“自定义配置”中安装或启用 Google 云端硬盘插件，即可使用 @drive: 搜索文件或直接粘贴云端硬盘链接"],
    ["Find plugins - bundles of skills, agents, MCP servers, UI extensions and more, and install them in one click.", "查找包含技能、智能体、MCP 服务器、界面扩展等内容的插件，并一键安装。"],
    ["Autonomous mode active: the agent works independently and does not ask questions or request new permissions.", "自主模式已开启：智能体将独立工作，不会提问或请求新权限。"],
    ["Agents run in a secure sandbox that restricts access to external resources outside of your trusted folders.", "智能体会在安全沙盒中运行，限制其访问受信任文件夹之外的外部资源。"],
    ["Give the agent awareness of lint errors created by its edits so it can fix them without explicit prompting.", "让智能体感知编辑引入的 Lint 错误，以便无需额外提示即可修复。"],
    ["The agent always asks for confirmation before executing terminal commands (except those in the Allow list).", "智能体在执行终端命令前始终请求确认（允许列表中的命令除外）。"],
    ["Prototype, build & run modern apps users love with Firebase's backend, AI, and operational infrastructure.", "利用 Firebase 的后端、AI 和运营基础设施，原型设计、构建和运行深受用户喜爱的现代应用。"],
    ["Terminal commands always require review and the agent cannot access files outside of its given workspaces.", "终端命令始终需要审核，且智能体无法访问其给定工作区之外的文件。"],
    ["Attackers might be able to see the images you're looking at on this site and trick you by modifying them.", "攻击者可能能够看到你在此网站上浏览的图片，并通过篡改图片来诱骗你。"],
    ["Simulate a different host (Electron, desktop or mobile Web, Extension, remote control, or installed PWA).", "模拟不同的宿主环境（Electron、桌面或移动端网页、浏览器扩展、远程控制或已安装的 PWA）。"],
    ["When enabled, the values below replace the auto-detected OS, host, and user type used for feature gating.", "启用后，下方设置将覆盖系统自动检测到的操作系统、宿主环境与用户群体类型，用于功能灰度与限制模拟。"],
    ["Your information (for example, passwords or credit card numbers) is private when it is sent to this site.", "发送到此网站时，你的信息（例如密码或信用卡号）是私密且受保护的。"],
    ["Select the workspace type that will be used for new conversations started with the New Workspace option.", "选择通过“新建工作区”选项启动新会话时所使用的工作区类型。"],
    ["AI Credits are used when you've exceeded your model quota. Keep track of your current AI Credits in the", "当超出模型配额时将使用 AI 积分。你可以在此处跟踪当前的 AI 积分余额："],
    ["The agent works with autonomy-enhancing features and does not ask questions or request new permissions.", "智能体使用自主增强功能运行，不会提问或请求新权限。"],
    ["This Google Cloud project is not supported. Input a different project, or sign in with another account.", "不支持此 Google Cloud 项目。请输入其他项目，或使用其他账号登录。"],
    ["Developer-only tools. These settings are stored locally in this browser and do not affect other users.", "仅限开发者工具。这些设置保存在当前浏览器本地，不会影响其他用户。"],
    ["to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.", "安装 Google Chrome。您可以在对话输入框中输入 /browser 来调用浏览器子智能体。"],
    ["VCS used when creating a new workspace, including workspaces generated based off your initial prompt.", "创建新工作区（包括根据初始提示词生成的工作区）时使用的 VCS。"],
    ["When enabled, Agent will show browser notifications when user action is needed or execution finishes.", "启用后，当需要用户操作或执行完成时，智能体将显示浏览器通知。"],
    ["When enabled, Agent will use IDE's shell integration to detect and report terminal command execution.", "启用后，智能体将使用 IDE 的 Shell 集成来检测并报告终端命令的执行。"],
    ["When toggled on, Antigravity IDE collects usage data to help Google enhance performance and features.", "开启后，Antigravity IDE 将收集使用数据，以帮助 Google 提升性能和功能。"],
    ["Download this site as an app to get notified when the agent needs your attention or completes a task.", "将此网站作为应用安装，以便在智能体需要关注或完成任务时收到通知。"],
    ["Continue your work from another device with Remote Control. Scan the QR code or open the link below.", "通过远程控制从其他设备继续你的工作。扫描二维码或打开下方链接。"],
    ["Keep the app accessible from the menu bar and running in the background when all windows are closed.", "所有窗口关闭后，仍保持应用在菜单栏中可用并在后台继续运行。"],
    ["Run the app against a Linux environment. Connecting relaunches the app into the selected WSL distro.", "在 Linux 环境中运行应用。连接后会将应用重启到所选的 WSL 发行版。"],
    ["The app is currently connected to a WSL distro. Reopening locally relaunches it directly on Windows.", "应用当前已连接到 WSL 发行版。在本地重新打开将直接在 Windows 上重新启动该应用。"],
    ["Modify scoped permissions, folders, and agent settings like Sandbox and Terminal Command Execution.", "修改作用域权限、文件夹，以及沙盒和终端命令执行等智能体设置。"],
    ["Requires manual review for all terminal commands and file accesses outside of the working folders.", "所有终端命令以及工作文件夹之外的文件访问均需人工审查。"],
    ["When toggled on, Antigravity collects usage data to help Google enhance performance and features.", "开启后，Antigravity 会收集使用数据，帮助 Google 改进性能和功能。"],
    ["Automatically expand the Changes Overview toolbar when the agent finishes generating a response.", "智能体完成回复生成时，自动展开更改概览工具栏。"],
    ["Payments, CRM, accounting, data, identity, customer support, marketing, and workflow automation.", "支付、客户关系管理、会计、数据、身份、客户支持、营销和工作流自动化。"],
    ["Select one of the three options. Agent settings and permissions can be further customized below.", "选择以下三个选项之一。智能体设置和权限可在下方进一步自定义。"],
    ["This conversation grew too large, so the history before this point may be missing or incomplete.", "此对话内容过长，因此该节点之前的历史记录可能缺失或不完整。"],
    ["This page is blocked in the built-in browser by your organization's Context-Aware Access policy.", "此页面因组织的上下文感知访问政策而被内置浏览器阻止。"],
    ["Describe what you want. Your agent plans and builds it, and brings in other agents when needed.", "描述你的诉求。智能体会制定计划并着手构建，必要时还会引入其他智能体协同工作。"],
    ["These allowed domain rules are set by your organization's administrator and cannot be removed.", "这些允许访问的域名规则由你所在组织的管理员设定，无法自行移除。"],
    ["This conversation is also open in another app. Sending messages from both may cause conflicts.", "此对话同时在另一个应用中打开。从两端发送消息可能会导致冲突。"],
    ["Grant read access to workflow runs and allow dispatching workflows on specific files and refs.", "授予读取工作流运行记录的权限，并允许运行指定文件和引用的工作流。"],
    ["These settings can only be changed on the computer running the app, not from a remote session.", "这些设置只能在运行应用的电脑上更改，不能从远程会话更改。"],
    ["Here's how uploaded files, attachments, and connected resources work in your cloud environment", "了解上传的文件、附件及连接的资源如何在云端环境中工作"],
    ["All terminal commands require review. The agent can read or write to any file in the machine.", "所有终端命令均需人工审查。智能体可以读写本机中的任意文件。"],
    ["Continue \"Explain and Fix\" actions in the current conversation instead of starting a new one.", "在当前对话中继续执行“解释并修复”操作，而不是开启新对话。"],
    ["Opens in the in-app preview pane. Some sites don't support iframe embedding and may not load.", "在应用内预览窗格中打开。部分网站不支持内嵌框架，可能无法加载。"],
    ["Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here.", "按计划运行提示词，例如每天早晨汇总昨天的更改。运行记录会显示在这里。"],
    ["Confirm the command is safe to run outside of the sandbox with full network and disk access.", "确认该命令可在沙盒外安全运行，并拥有完整网络和磁盘访问权限。"],
    ["Workflows are saved prompts that Agent can follow. To trigger a workflow, type \"/\" in Agent.", "工作流是智能体可以遵循的已保存提示词。要触发工作流，请在智能体中输入“/”。"],
    ["Your agent's ability to execute commands is also controlled by enterprise security policies.", "你的智能体执行命令的权限同时受企业安全策略管控。"],
    ["Configure allowed and denied URLs for the browser subagent (invoked with /browser). Requires", "配置浏览器子智能体（通过 /browser 调用）允许和拒绝访问的网址。需要"],
    ["Build on Google's developer platforms, including Android, Chrome, Gemini, and Google Cloud.", "基于 Google 开发平台构建应用，包括 Android、Chrome、Gemini 和 Google Cloud。"],
    ["Enter the configuration values this MCP server needs. Saving restarts the server with them.", "请输入此 MCP 服务器所需的配置值。保存后将以此配置重启服务器。"],
    ["Turn this on for some sick beats. The more Tab suggestions you accept in a row, the better.", "开启后可听到节奏音效；连续接受的 Tab 建议越多，效果越好。"],
    ["Port number for Chrome DevTools Protocol remote debugging. Leave empty for default (9222).", "Chrome DevTools Protocol 远程调试端口号。留空则使用默认值（9222）。"],
    ["Try out early-stage features before they ship. These may change or be removed at any time.", "在正式发布前试用早期功能。这些功能可能随时更改或移除。"],
    ["When enabled, the agent will be able to access past conversations to inform its responses.", "启用后，智能体将能够访问历史对话以辅助其生成回复。"],
    ["Optional branch or ref used when creating a new Cog workspace (defaults to main if unset).", "创建新 Cog 工作区时可选的分支或引用（未设置时默认为 main）。"],
    ["Controls whether the agent can run custom JavaScript to automate complex browser actions.", "控制智能体是否可以运行自定义 JavaScript 来自动化复杂浏览器操作。"],
    ["You are logged in using environment credentials and cannot sign out from the application.", "你使用环境凭据登录，无法在应用中退出登录。"],
    ["A label for this computer when you connect from another device. Changing it reconnects.", "从其他设备连接时用于标识这台电脑的名称。更改该名称将重新建立连接。"],
    ["Choose whether to be notified when the agent needs your attention or completes a task.", "选择是否在智能体需要您关注或完成任务时收到通知。"],
    ["Create, edit, review, resize, and brand-check Canva designs with the Canva MCP server.", "使用 Canva MCP 服务器创建、编辑、审阅和调整 Canva 设计，并检查品牌一致性。"],
    ["When enabled, Antigravity will play a sound when Agent finishes generating a response.", "启用后，Antigravity 会在智能体完成回复生成时播放提示音。"],
    ["When enabled, the agent will include default customizations, including default skills.", "启用后，智能体将包含默认自定义项（包括默认技能）。"],
    ["Comment on the plan before your agent starts, and get a walkthrough when it finishes.", "在智能体开始前审查并批注计划，并在完成后获取详细的演练讲解。"],
    ["The agent asks for permission before executing commands matched by a deny list entry.", "智能体在执行匹配拒绝列表条目的命令前，会先请求权限。"],
    ["The browser subagent can be invoked by typing /browser in the conversation input box.", "你可以在对话输入框中输入 /browser 来调用浏览器子智能体。"],
    ["Receive product updates, tips, and promotions from Google Antigravity IDE via email.", "通过电子邮件接收来自 Google Antigravity IDE 的产品更新、技巧和促销活动。"],
    ["Customization token budget exceeded. Large customizations are excluded from context.", "自定义项的 Token 预算已超出。较大的自定义项将从上下文中排除。"],
    ["Allow Gemini to notify you when the agent needs your attention or completes a task.", "允许 Gemini 在智能体需要您关注或完成任务时向您发送通知。"],
    ["Predict the location of your next edit and navigates you there with a tab keypress.", "预测您下一次编辑的位置，并在按下 Tab 键时导航至该处。"],
    ["This skill came from the marketplace, so you can add it again whenever you need it.", "此技能来自市场，你可以在需要时再次添加。"],
    ["Match when the issue component equals or is under the given Buganizer component ID.", "当问题组件等于指定 Buganizer 组件 ID 或位于其下时匹配。"],
    ["You cannot sign out from Remote Control. Please sign out on your local application.", "无法通过远程控制退出登录。请在本地应用中退出登录。"],
    ["Predict the location of your next edit and navigate you there with a tab keypress.", "预测您下一次编辑的位置，并在按下 Tab 键时导航至该处。"],
    ["Predict the location of your next edit and navigates you there with a tab keypress", "预测下一处编辑位置，按 Tab 键可跳转到该位置"],
    ["Are you sure you want to delete this side question? This action cannot be undone.", "确定要删除此副问题吗？此操作无法撤销。"],
    ["Connect to Google Workspace, including Docs, Sheets, Slides, Drive, and Calendar.", "连接 Google Workspace，包括文档、表格、演示文稿、云端硬盘和日历。"],
    ["To modify notification settings, open your operating system's system preferences.", "要修改通知设置，请打开操作系统的系统设置。"],
    ["What functionality you expect your account tier to have available that is missing", "你期望当前账号套餐提供但尚未提供的功能"],
    ["Are you sure you want to delete this conversation? This action cannot be undone.", "确定要删除此对话吗？此操作无法撤销。"],
    ["Receive product updates, tips, and promotions from Google Antigravity via email.", "通过电子邮件接收 Google Antigravity 的产品更新、技巧和促销信息。"],
    ["Which workspace the New Conversation button and keyboard shortcut start you in.", "通过“新会话”按钮及键盘快捷键新建会话时所默认进入的工作区。"],
    ["Compact the conversation now (summarize history to free up the context window).", "立即压缩对话（概括历史记录以释放上下文窗口空间）。"],
    ["Reflect on recent successes or corrections to capture reusable skills or rules.", "回顾近期的成功经验或修正，提炼可复用的技能或规则。"],
    ["Configures how the agent tries to access files outside of its working folders.", "配置智能体如何访问工作文件夹之外的文件。"],
    ["No model specified for Battle Mode, falling back to use current selected model", "对战模式未指定模型，已回退为使用当前选中的模型"],
    ["Browser is currently being operated by this conversation in another Hub window", "此对话正在另一个主窗口中操作浏览器"],
    ["Google Cloud SDK detected. Install Google Extensions to enhance your workflow.", "检测到 Google Cloud SDK。安装 Google 扩展以增强工作流程。"],
    ["Background tasks and terminals agents left running, across all conversations.", "所有会话中由智能体启动并保持运行的后台任务与终端。"],
    ["You can upgrade to a Google AI Ultra plan to receive the highest rate limits.", "你可以升级到 Google AI Ultra 套餐以获得最高速率限制。"],
    ["Uploaded files and connected resources are mounted in your cloud environment.", "上传的文件和连接的资源会挂载到你的云端环境中。"],
    ["Allow reading workflow runs (list, view, watch) across the whole repository.", "允许读取整个仓库的工作流运行记录（列表、查看、监听）。"],
    ["Show browser notifications when your action is needed or execution finishes.", "需要你操作或执行结束时，显示浏览器通知。"],
    ["These MCP allowlist rules are enforced by your organization's administrator.", "这些 MCP 白名单规则由你所在组织的管理员强制实施。"],
    ["Ignore events triggered by the automation owner to avoid self-trigger loops.", "忽略由自动化任务所有者触发的事件，以避免自触发循环。"],
    ["Check pending conversations in the last 3 days that require action from me.", "检查最近 3 天内需要我处理的待办对话。"],
    ["Configure built-in browser, link opening, and browser subagent preferences.", "配置内置浏览器、链接打开方式及浏览器子智能体首选项。"],
    ["Ignore events emitted by automated review or robot accounts (groupagent-*).", "忽略由自动审查或机器人账号 (groupagent-*) 发出的事件。"],
    ["Send messages with the keyboard's Enter key instead of starting a new line.", "按 Enter 键发送消息，而不是换行。"],
    ["Show system notifications when your action is needed or the agent finishes.", "当需要你采取操作或智能体完成任务时弹出系统通知。"],
    ["This conversation is not on disk. Delete it to remove it from your sidebar.", "此对话不在磁盘上。将其删除即可从侧边栏移除。"],
    ["Use Add MCP to browse the store, or add a custom server via the MCP config.", "使用“添加 MCP”浏览商店，或通过 MCP 配置文件添加自定义服务器。"],
    ["I prefer an immediate single response to prioritize productivity right now.", "我现在希望立即获得单个回复，以提高效率。"],
    ["Clear visited URLs and autocomplete suggestions from the built-in browser.", "清除内置浏览器中访问过的网址和自动补全建议。"],
    ["AI-powered code review and review-comment autofix, powered by CodeRabbit.", "由 CodeRabbit 提供支持的人工智能代码审查和审查意见自动修复。"],
    ["Google3 chats will be regrouped into their workspaces in the sidebar. See", "Google3 聊天将在侧边栏中重新按其工作区分组。请参阅"],
    ["Hook will only trigger if the tool name matches run_command or view_file.", "仅当工具名称匹配 run_command 或 view_file 时触发钩子。"],
    ["Plan work, track issues, sign documents, and manage your notes and files.", "规划工作、跟踪问题、签署文档并管理笔记和文件。"],
    ["Setup may take over 5 minutes. Please keep this screen open during setup.", "配置可能需要 5 分钟以上，请在此过程中保持此界面打开。"],
    ["This prompt is straightforward and does not need alternative comparisons.", "此提示较为直接，无需比较其他方案。"],
    ["Configure workspace-specific permissions, resources, and customizations.", "配置工作区专属的权限、资源和自定义项。"],
    ["Controls whether terminal commands require your approval before running.", "控制终端命令在执行前是否需要你的审批。"],
    ["Enable telemetry in Settings before changing per-conversation telemetry.", "在调整单会话遥测前，请先在设置中启用遥测。"],
    ["Model must be available on the Gemini API and use the gemini-api scheme.", "模型必须可在 Gemini API 中使用，并使用 gemini-api 模式。"],
    ["options. Agent settings and permissions can be further customized below.", "项之一。智能体设置和权限可在下方进一步自定义。"],
    ["Plugins are packaged collections of skills and MCPs to help the Agent in", "插件是技能与 MCP 的打包集合，用于在以下方面协助智能体："],
    ["Toggle if a confirmation is shown when using the \"Reload Window\" button.", "使用“重新加载窗口”按钮时是否显示确认提示。"],
    ["You can upgrade to a Google AI Ultra plan to receive higher rate limits.", "您可以升级到 Google AI Ultra 套餐以获得更高的速率限制。"],
    ["The Agent attempted to interact with some sites that are not allowlisted", "智能体尝试与未加入允许列表的网站交互"],
    ["Use this if your admin gave you a WIF config. Paste it below to sign in.", "如果管理员提供了 WIF 配置，请将其粘贴到下方以登录。"],
    ["Path to the Chrome/Chromium executable. Leave empty for auto-detection.", "Chrome/Chromium 可执行文件路径。留空则自动检测。"],
    ["Sign up for newsletters, tips and tricks, and other notifications about", "订阅简报、使用技巧及相关通知"],
    ["This plugin requires authentication before the agent can use its tools.", "此插件需要先完成身份验证，智能体方可使用其工具。"],
    ["VCS used when generating a new workspace based off your initial prompt.", "根据您的初始提示词生成新工作区时使用的 VCS。"],
    ["Contact your administrator to set up Gemini Enterprise for this project", "请联系管理员，为此项目设置 Gemini Enterprise"],
    ["This project uses Firebase. Do you want to download the Firebase skill?", "此项目使用 Firebase。要下载 Firebase 技能吗？"],
    ["Inherits from global settings. Local permissions have higher priority.", "继承全局设置。本地权限优先级更高。"],
    ["Jetski Chat configuration is not available in the current environment.", "当前环境中无法使用 Jetski Chat 配置。"],
    ["Open in current window, Continue conversation in the current workspace", "在当前窗口打开，并在当前工作区继续对话"],
    ["When enabled, sandboxed commands are allowed to make network requests.", "启用后，允许沙盒中的命令发起网络请求。"],
    ["Rules token budget exceeded. Large rules are demoted to path pointers.", "规则的 Token 预算已超出。较大的规则会降级为路径引用。"],
    ["Agent settings and permissions for conversations outside of projects.", "为项目外对话配置智能体设置和权限。"],
    ["Configure a chat bot so you can use Jetski directly from Google Chat.", "配置聊天机器人，以便直接从 Google Chat 使用 Jetski。"],
    ["Google3 chats will be regrouped into their workspaces in the sidebar.", "Google3 聊天将在侧边栏中重新按其工作区分组。"],
    ["Keep your coding agent up to date with the latest web best practices.", "让您的编码智能体始终与最新的 Web 最佳实践保持同步。"],
    ["Sync newly created JJ worktrees to head when starting a conversation.", "开始对话时将新建的 JJ 工作树同步到最新提交。"],
    ["Please sign in using the Antigravity sidebar panel to view this page.", "请使用 Antigravity 侧边栏登录以查看此页面。"],
    ["A snapshot was saved before running. To restore your previous output:", "运行前已保存快照。要恢复之前的输出："],
    ["Get notified when the agent needs your attention or completes a task.", "在智能体需要关注或完成任务时接收通知。"],
    ["Match when any modified file path starts with the given depot prefix.", "当任何已修改文件的路径以指定仓库前缀开头时匹配。"],
    ["Match when push_def equals or is a child of the given PushDef prefix.", "当 push_def 等于指定 PushDef 前缀或为其子项时匹配。"],
    ["Failed to unarchive project: project management feature not available", "恢复已归档项目失败：项目管理功能不可用"],
    ["APIs, services, and tools to build, test, secure, and run your apps.", "用于构建、测试、保护和运行应用的 API、服务与工具。"],
    ["Configure agent execution, queued message delivery, and permissions.", "配置智能体执行、排队消息发送以及权限。"],
    ["The conversation could not be loaded because its data was not found.", "无法加载该对话，因为未找到其数据。"],
    ["Pick order sets the harness for each response; the rest run control.", "选择顺序决定每个回复使用的执行框架；其余回复作为对照运行。"],
    ["Allows the agent to access files outside of your current workspace.", "允许智能体访问当前工作区之外的文件。"],
    ["An error occurred while submitting your feedback. Please try again.", "提交反馈时出错，请重试。"],
    ["External tools the agent can invoke via the Model Context Protocol.", "智能体可通过模型上下文协议 (MCP) 调用的外部工具。"],
    ["Save rule to always allow a one-time administrator (UAC) elevation?", "保存规则以始终允许一次性管理员 (UAC) 提权？"],
    ["Save rule to always allow running this command outside the sandbox?", "保存规则以始终允许在沙盒外运行此命令？"],
    ["Let's tailor the experience for you. What best describes your work?", "让我们为你定制体验。哪项最能描述你的工作？"],
    ["Configure what the agent can do in local and remote conversations.", "配置智能体在本地和远程对话中可以执行的操作。"],
    ["Intended primarily for previewing local development servers (e.g.,", "主要用于预览本地开发服务器（例如："],
    ["Scan the code to open this device in Remote Control, or copy link.", "扫描二维码以在远程控制中打开此设备，或复制链接。"],
    ["To modify editor settings, open Settings within the editor window.", "要修改编辑器设置，请在编辑器窗口中打开设置。"],
    ["View archived in the sidebar (![filter](icon://filter_list) menu).", "在侧边栏的归档列表中查看（![filter](icon://filter_list) 菜单）。"],
    ["Read access to code, refs, commits, and other repository contents.", "读取代码、引用、提交及其他仓库内容的权限。"],
    ["Error: Artifacts from remote conversations are not available here.", "错误：此处无法使用远程对话中的产物。"],
    ["Bring the full power of Google Data Cloud to your intelligent IDE.", "将 Google Data Cloud 的强大功能引入你的智能 IDE。"],
    ["This request is not well-suited for parallel Best-of-N generation.", "此请求不太适合并行生成多个备选结果。"],
    ["Chief of Staff is listening — open the Chief of Staff conversation", "统筹助手正在聆听——打开统筹助手对话"],
    ["Run an instruction on a recurring schedule or as a one-time timer.", "按周期计划或一次性定时执行一条指令。"],
    ["A shell setup script run before every command the agent executes.", "在智能体执行每条命令前所运行的 Shell 初始化脚本。"],
    ["Commands the agent can run outside the sandbox in this workspace.", "智能体在此工作区中可在沙盒外运行的命令。"],
    ["Show \"Edit\" and \"Chat\" buttons when selecting text in the editor.", "在编辑器中选择文本时显示“编辑”和“聊天”按钮。"],
    ["Voice recording is unavailable while the Chief of Staff mic is on", "统筹助手的麦克风开启时无法录音"],
    ["Create a new project using normal folders and/or citc workspaces.", "创建使用普通文件夹和／或 CitC 工作区的新项目。"],
    ["Ask a quick question without interrupting the main conversation.", "提出简短问题，无需中断主会话。"],
    ["Folder where files downloaded in the built-in browser are saved.", "内置浏览器下载文件的保存文件夹。"],
    ["Let the agent access past conversations to inform its responses.", "允许智能体参考历史对话来生成回复。"],
    ["Replace the default browser right-click menu with quick actions.", "使用快捷操作菜单替换浏览器默认的右键菜单。"],
    ["Simulate a different user cohort (Google, External, Enterprise).", "模拟不同的用户群体类型（Google 内部、外部公开用户、企业客户）。"],
    ["The agent auto-executes commands matched by an allow list entry.", "智能体会自动执行匹配允许列表条目的命令。"],
    ["The conversation was compacted to fit within the context window.", "对话已压缩以适应上下文窗口。"],
    ["This extension has no declared permissions requiring user input.", "此扩展未声明需要用户确认的权限。"],
    ["Full interface for coding, developer tools, and managing agents.", "完整界面，适合编程、使用开发者工具和管理智能体。"],
    ["Add an MCP server above or add a custom one via the MCP Config.", "在上方添加 MCP 服务器，或通过 MCP 配置添加自定义服务器。"],
    ["Agent settings and permissions can be further customized below.", "智能体设置和权限可在下方进一步自定义。"],
    ["Agents have full access to your machine and external resources.", "智能体可完整访问你的电脑和外部资源。"],
    ["Allow/deny agent write access to specific files or directories.", "允许或拒绝智能体写入指定文件或目录。"],
    ["Configure allowed and denied URLs for browser action execution.", "配置允许和拒绝浏览器执行操作的 URL。"],
    ["Configure tab completion, suggestions, and navigation behavior.", "配置 Tab 补全、建议和导航行为。"],
    ["Developer-only tools. These settings do not affect other users.", "仅限开发者使用的工具设置。这些设置不会影响其他用户。"],
    ["Highlight newly inserted text after accepting a Tab completion.", "在接受 Tab 补全后高亮显示新插入的文本。"],
    ["Manage settings specific to Google CitC workspaces development.", "管理特定于 Google CitC 工作区开发的设置。"],
    ["Open files in the background if the agent creates or edits them", "智能体创建或编辑文件时，在后台打开这些文件"],
    ["Your administrator has disabled MCP servers for this workspace.", "你的管理员已在此工作区中禁用了 MCP 服务器。"],
    ["What you would like to see to address this gap in your workflow", "你希望如何弥补工作流中的这一缺口"],
    ["Simplified interface for research, writing, and everyday tasks.", "精简界面，适合研究、写作和日常任务。"],
    ["Never auto-execute commands unless they are in your allow list.", "从不自动执行命令，允许列表中的命令除外。"],
    ["Used to represent onboardingsteps which have not been completed", "用于表示尚未完成的入门步骤"],
    ["Allow/deny agent read access to specific files or directories.", "允许或拒绝智能体读取指定文件或目录。"],
    ["Also includes Global Permissions when working in this project.", "在此项目中工作时还包括“全局权限”。"],
    ["Customize Agent to get a better, more personalized experience.", "自定义智能体，获得更好、更个性化的体验。"],
    ["Inherits your Global Permissions when working in this project.", "在此项目中工作时继承您的全局权限。"],
    ["Optimize the interface and terminal output for screen readers.", "针对屏幕阅读器优化界面交互与终端输出。"],
    ["Play a sound when your action is needed or the agent finishes.", "当需要你采取操作或智能体完成任务时播放提示音。"],
    ["The conversation was compacted while generating this response.", "生成此响应的过程中会话已被压缩。"],
    ["Ask a side question without interrupting the main conversation", "提出一个副问题，无需打断主对话"],
    ["Your Antigravity use will be associated with provided project.", "你的 Antigravity 使用将与所提供的项目关联。"],
    ["Tip: Complex tasks get better results with multiple responses.", "提示：复杂任务使用多个回复通常会得到更好的结果。"],
    ["A license or project selection is required to use Antigravity.", "使用 Antigravity 需要许可证或选择项目。"],
    ["Invoke a team of agents to autonomously tackle large projects.", "调用智能体团队自主处理大型项目。"],
    ["Allow opening pull requests and grant access to specific PRs.", "允许创建拉取请求并授予对特定 PR 的访问权限。"],
    ["Browse and enable plugins from the Build With Google catalog.", "从 Build With Google 目录中浏览并启用插件。"],
    ["Configure allowed and denied paths for file reads and writes.", "配置允许和拒绝读写的文件路径。"],
    ["Credential expires in less than 1 week. Click to refresh TDAT", "凭据将在 1 周内过期。点击刷新 TDAT"],
    ["External tools the agent can call via Model Context Protocol.", "智能体可通过 Model Context Protocol 调用的外部工具。"],
    ["Hook will only trigger if the tool name starts with browser_.", "仅当工具名称以 browser_ 开头时触发钩子。"],
    ["The agent will wait for you to install the browser extension.", "智能体会等待你安装浏览器扩展。"],
    ["There was an error with your authentication. To log in, click", "身份验证过程中发生错误。若要登录，请点击"],
    ["This migration may mess up your settings, chats, and sidebar.", "此迁移可能会影响您的设置、聊天记录和侧边栏。"],
    ["Request Review - Collaborate with the agent to complete tasks", "请求审核——与智能体协作完成任务"],
    ["Allow/deny agent browser file downloads from specific sites.", "允许或拒绝智能体浏览器从特定网站下载文件。"],
    ["Credential valid (> 1 week remaining). Click to refresh TDAT", "凭据有效（剩余超过 1 周）。点击刷新 TDAT"],
    ["Disables all safety barriers for maximal iteration velocity.", "禁用所有安全屏障，以最大程度提高迭代速度。"],
    ["Hook will only trigger if the tool name matches run_command.", "仅当工具名称匹配 run_command 时触发钩子。"],
    ["Prevent the computer from sleeping while the app is running.", "在应用运行期间阻止计算机进入睡眠状态。"],
    ["This setting cannot be changed while strict mode is enabled.", "启用严格模式时无法更改此设置。"],
    ["Grant create, update, or delete access to specific branches.", "授予对指定分支的创建、更新或删除权限。"],
    ["Used to represent onboarding steps which have been completed", "用于表示已完成的入门步骤"],
    ["Invoke the Boost multi-agent orchestrator for complex tasks.", "调用 Boost 多智能体协调器处理复杂任务。"],
    ["Allow/deny agent browser actuation access to specific URLs.", "允许或拒绝智能体浏览器针对特定网址执行页面操作。"],
    ["Configure the agent's visual theme and display preferences.", "配置智能体的视觉主题与界面显示偏好。"],
    ["Manage how Best of N sets up the workspace its arms run in.", "管理 Best of N 如何配置其各分支运行所在的工作区。"],
    ["Open files in the background if Agent creates or edits them", "当智能体创建或编辑文件时，在后台打开这些文件"],
    ["Play a sound when the agent finishes generating a response.", "智能体完成回复生成时播放提示音。"],
    ["Allow creating issues and grant access to specific issues.", "允许创建议题并授予对特定议题的访问权限。"],
    ["Remote Control isn't active on this instance. Enable it in", "当前实例未启用远程控制。请在以下位置启用："],
    ["Restricts agent tools to a secure, isolated local sandbox.", "将智能体工具限制在安全隔离的本地沙盒中。"],
    ["Terminal commands the agent can execute in this workspace.", "智能体在此工作区中可执行的终端命令。"],
    ["Using the Google Antigravity Python SDK to build AI agents", "使用 Google Antigravity Python SDK 构建人工智能智能体"],
    ["It was already sent or couldn't be removed from the queue.", "该消息已发送，或无法从队列中移除。"],
    ["Allow/deny agent read access to specific URLs or domains.", "允许或拒绝智能体读取指定 URL 或域名。"],
    ["Configure global allowed and denied resource permissions.", "配置全局允许和拒绝的资源权限。"],
    ["Thank you! Your feedback has been submitted successfully.", "感谢您的反馈！您的反馈已成功提交。"],
    ["Type / and select plan to have the agent generate a plan.", "输入 / 并选择 plan 让智能体生成计划。"],
    ["Your session has expired. Please log back in to continue.", "会话已过期，请重新登录后继续。"],
    ["No matching project folders. Apply to use the custom URI.", "没有匹配的项目文件夹。点击“应用”以使用自定义 URI。"],
    ["Your sign-in needs an update. Sign in again to use Voice.", "登录状态需要更新。请重新登录以使用语音功能。"],
    ["Agent can scroll on browser pages to access more content.", "智能体可以滚动浏览器页面以访问更多内容。"],
    ["A comma-separated list like repo-a, repo-b, or * for all.", "使用逗号分隔的列表，例如 repo-a、repo-b，或使用 * 表示全部。"],
    ["Enable navigation suggestions that predict your next edit", "启用预测下一处编辑位置的导航建议"],
    ["Clone current workspace into a new independent workspace", "将当前工作区克隆到全新的独立工作区中"],
    ["Configure allowed and denied URLs for browser actuation.", "配置允许和拒绝浏览器执行操作的 URL。"],
    ["Configure link opening and built-in browser preferences.", "配置链接打开方式和内置浏览器偏好设置。"],
    ["Core tools and knowledge required to develop for Android", "开发 Android 应用所需的核心工具与知识"],
    ["Inline PDF preview is not available in this environment.", "当前环境下暂不支持内嵌 PDF 预览。"],
    ["Manage project folders, agent settings, and permissions.", "管理项目文件夹、智能体设置和权限。"],
    ["Save rule to always allow executing actions on this URL?", "保存规则以始终允许在此 URL 上执行操作？"],
    ["Scan the code to open this device in Remote Control, or ", "扫描二维码以在远程控制中打开此设备，或 "],
    ["Select a model using the model selector in the input box", "使用输入框中的模型选择器选择模型"],
    ["Type / and select plan to have the agent generate a plan", "输入 / 并选择 plan 让智能体生成计划"],
    ["Attackers might be trying to steal your information from", "攻击者可能正试图从以下网站窃取你的信息："],
    ["Trigger multiple response variants from the same prompt.", "使用同一提示词生成多个不同的回复。"],
    ["No project selected or project management not available.", "未选择项目，或项目管理不可用。"],
    ["Access and clone GitHub repositories in remote projects", "在远程项目中访问和克隆 GitHub 仓库"],
    ["Allow/deny agent command execution outside the sandbox.", "允许或拒绝智能体在沙盒之外执行命令。"],
    ["Automatically reproduce bugs, trace causes, test fixes.", "自动复现缺陷、追踪根本原因并测试修复方案。"],
    ["Draft documents, emails, and notes that sound like you.", "起草符合你语言风格的文档、电子邮件与备忘笔记。"],
    ["Include default customizations, such as default skills.", "包含默认自定义项，例如默认技能。"],
    ["Manage your plan, credentials, and general preferences.", "管理你的订阅计划、账号凭据与常规偏好设置。"],
    ["Scan the code to open this device in Remote Control, or", "扫描二维码以在远程控制中打开此设备，或"],
    ["This project overrides your global permission settings.", "此项目覆盖了您的全局权限设置。"],
    ["This subagent was killed and can no longer be messaged.", "此子智能体已终止，无法再向其发送消息。"],
    ["A comma-separated list like org-a, org-b, or * for all.", "使用逗号分隔的列表，例如 org-a、org-b，或使用 * 表示全部。"],
    ["Always Proceed - Trust the agent to do tasks end-to-end", "始终继续——信任智能体独立完成整个任务"],
    ["AI may make mistakes. Double-check all generated code.", "AI 可能会出错，请仔细核对生成的代码。"],
    ["Allow full browser script execution without prompting.", "允许完整的浏览器脚本执行而无需提示。"],
    ["Choose how much detail is shown during a conversation.", "选择对话过程中显示的详细程度。"],
    ["Configure the maximum width of the conversation panel.", "配置对话面板的最大宽度。"],
    ["for more information (this migration is experimental).", "了解更多信息（此迁移为实验性功能）。"],
    ["Sidebar after conversations are regrouped by workspace", "按工作区分组后的对话侧边栏"],
    ["URLs the agent can perform actions on via the browser.", "智能体可以通过浏览器执行操作的 URL。"],
    ["No rate card for this model; showing comparable rates.", "此模型没有费率表；当前显示的是可比费率。"],
    ["A few things to know, and a couple settings to review.", "请了解以下事项，并检查几项设置。"],
    ["Open Google Chrome on the machine running Antigravity.", "在运行 Antigravity 的电脑上打开 Google Chrome。"],
    ["There was an unexpected issue setting up your account.", "设置账号时出现意外问题。"],
    ["A Google Cloud project is required to use Antigravity.", "使用 Antigravity 需要 Google Cloud 项目。"],
    ["Choose between the Default and Project 4K experience.", "在默认体验与 Project 4K 体验之间选择。"],
    ["Configure default behaviors, skills, and MCP servers.", "配置默认行为、技能和 MCP 服务器。"],
    ["Curated collection of agent skills for science tasks.", "精选的科学任务智能体技能集。"],
    ["Deploy and host your apps, sites, and their backends.", "部署和托管应用、网站及其后端。"],
    ["Manage your conversations from the companion website.", "从配套网站管理您的对话。"],
    ["Modify permissions for file, terminal, and MCP tools.", "修改文件、终端和 MCP 工具的权限。"],
    ["This option is disabled while strict mode is enabled.", "启用严格模式时此选项已禁用。"],
    ["Failed to load your customizations. Please try again.", "加载自定义项失败，请重试。"],
    ["Discard changes (revert file to last committed state)", "放弃更改（将文件还原到上次提交的状态）"],
    ["Ask about your code or any topic, get clear answers.", "针对你的代码或任意话题提问，获取清晰解答。"],
    ["Configure external tools via Model Context Protocol.", "配置通过 Model Context Protocol 使用的外部工具。"],
    ["Keyboard shortcuts for quick navigation and control.", "用于快速导航与控制的键盘快捷键。"],
    ["Research, writing, and everyday tasks, without code.", "适用于研究、写作与日常任务（不含代码工具）。"],
    ["Save rule to always allow write access to this path?", "保存规则以始终允许写入此路径？"],
    ["The full developer experience with code and tooling.", "包含代码与开发工具的完整开发者体验。"],
    ["View archived in the sidebar (Display options menu).", "可在侧边栏（显示选项菜单）中查看已归档内容。"],
    ["Running processes are killed. This cannot be undone.", "运行中的进程将被终止。此操作无法撤销。"],
    ["Connect an account so the agent can run automations.", "连接账号，让智能体能够运行自动化任务。"],
    ["Install the server first to see the available tools.", "请先安装服务器，再查看可用工具。"],
    ["Create a new workflow file in the current workspace.", "在当前工作区中创建新的工作流文件。"],
    ["Run until the specified goal is completely finished.", "持续运行，直到指定目标完全完成。"],
    ["Configure hooks that run on agent lifecycle events.", "配置在智能体生命周期事件上运行的钩子。"],
    ["Exploring files, running commands, editing artifact", "正在探索文件、运行命令、编辑产物"],
    ["Modify permissions for 文件, terminal, and MCP tools.", "修改文件、终端和 MCP 工具的权限。"],
    ["Prompt for approval before running browser scripts.", "运行浏览器脚本前请求批准。"],
    ["Quickly add and update imports with a tab keypress.", "按下 Tab 键快速添加和更新导入。"],
    ["Requesting a one-time administrator (UAC) elevation", "正在请求一次性管理员 (UAC) 提权"],
    ["Save rule to always allow read access to this path?", "保存规则以始终允许读取此路径？"],
    ["Search for MCP servers to add to your configuration", "搜索要添加到配置中的 MCP 服务器"],
    ["Using the Antigravity Python SDK to build AI agents", "使用 Antigravity Python SDK 构建 AI 智能体"],
    ["Whether the agent asks you to review its documents.", "智能体是否请求您审核其生成的文档。"],
    ["You currently don't have any MCP Servers installed.", "您当前还没有安装任何 MCP 服务器。"],
    ["Custom models are only supported on Linux machines.", "自定义模型仅支持 Linux 计算机。"],
    ["Why are you opting out of auto-triggered Best-of-N?", "为什么要退出自动触发的 Best of N？"],
    ["? This will remove it from your MCP configuration.", "？这将把它从您的 MCP 配置中移除。"],
    ["Aborted due to condition callback returning false.", "由于条件回调返回 false，操作已中止。"],
    ["Allow sandboxed commands to make network requests.", "允许沙盒中的命令发起网络请求。"],
    ["Configure editor-specific behaviors and shortcuts.", "配置编辑器特有的行为和快捷键。"],
    ["Configure the default width of markdown artifacts.", "配置 Markdown 产物的默认宽度。"],
    ["Custom agents are not available in Best of N mode.", "Best of N 模式下暂不支持自定义智能体。"],
    ["GitHub API rate limit exceeded. Try again shortly.", "GitHub API 请求频率超出限制。请稍后重试。"],
    ["Save rule to always allow access to this resource?", "保存规则以始终允许访问此资源？"],
    ["URLs the agent can read or open in this workspace.", "智能体在此工作区中可读取或打开的 URL。"],
    ["What quota or feature is being incorrectly limited", "哪些配额或功能被错误地限制了"],
    ["Error: No artifact URI provided in URL parameters.", "错误：URL 参数中未提供产物 URI。"],
    ["Whether it never connects or is intermittent/flaky", "它是从未连接成功，还是连接间歇性不稳定"],
    ["Ask questions, report issues, and discuss features", "提问、报告问题并讨论功能"],
    ["Agent Decides - Assist the agent to complete tasks", "由智能体决定——协助智能体完成任务"],
    ["Create a project whose conversations run remotely.", "创建对话在远程运行的项目。"],
    ["Dev mode: Localhost server automatically detected", "开发模式：已自动检测到 Localhost 本地服务器"],
    ["Display and preserve intermediate thinking steps.", "显示并保留中间思考步骤。"],
    ["Hand off a feature and come back to working code.", "交付功能需求，稍后即可获得可运行的完整代码。"],
    ["New standalone conversation, outside of projects.", "新建独立对话，不属于任何项目。"],
    ["No keyboard shortcuts found matching your filter.", "未找到符合当前筛选条件的快捷键。"],
    ["Paths the agent can modify inside this workspace.", "智能体在此工作区中可修改的路径。"],
    ["Timed out waiting for the update to be installed.", "等待安装更新超时。"],
    ["Disabled. Open Details to finish setup or enable.", "已禁用。打开详情以完成设置或启用。"],
    ["Connect an account so the agent can use this app.", "连接账号，让智能体能够使用此应用。"],
    ["The agent was prevented from accessing some sites", "已阻止智能体访问某些网站"],
    ["For Antigravity Business consumption options, see", "有关 Antigravity Business 的用量选项，请参阅"],
    ["Choose where links open by default when clicked.", "选择点击链接时默认在哪里打开。"],
    ["Display and preserve intermediate thinking steps", "显示并保留中间思考步骤"],
    ["Files modified by the agent in this conversation", "智能体在此对话中修改的文件"],
    ["Import feature is not available in this context.", "当前上下文中无法使用导入功能。"],
    ["Require review for all browser script execution.", "所有浏览器脚本执行都需要审核。"],
    ["Run terminal commands with sandbox restrictions.", "在沙盒限制环境中运行终端命令。"],
    ["There may be agents or background tasks running.", "可能仍有智能体或后台任务正在运行。"],
    ["URLs the agent can actuate on in this workspace.", "智能体在此工作区中可执行操作的 URL。"],
    ["URLs the agent can actuate on using the browser.", "智能体可通过浏览器执行操作的 URL。"],
    ["Uses your local files and tools. Schedules only.", "使用本地文件和工具，仅支持定时运行。"],
    ["Keeps working in this folder. Nothing is copied.", "继续在此文件夹中工作，不会复制任何内容。"],
    ["Absolute path to the Chrome/Chromium executable", "Chrome 可执行文件的绝对路径"],
    ["Allow a one-time administrator (UAC) elevation?", "允许一次性管理员 (UAC) 提权？"],
    ["Allow running this command outside the sandbox?", "允许在沙盒外运行此命令？"],
    ["Are you sure you want to delete this hook card?", "确定要删除此钩子卡片吗？"],
    ["Commands the agent can run outside the sandbox.", "智能体可在沙盒外运行的命令。"],
    ["Configure allowed commands outside the sandbox.", "配置允许在沙盒外运行的命令。"],
    ["Curated collection of agent skills for science.", "为科学领域精心挑选的智能体技能集合。"],
    ["Disabled. Open the plugin page to finish setup.", "已禁用。打开插件页面以完成配置。"],
    ["Paths the agent can read inside this workspace.", "智能体在此工作区中可读取的路径。"],
    ["Project 4K interface without developer tooling.", "专为非开发工具场景设计的 Project 4K 极简界面。"],
    ["Save rule to always allow running this command?", "保存规则以始终允许运行此命令？"],
    ["Select light, dark, or inherit system settings.", "选择浅色、深色或继承系统设置。"],
    ["URLs the agent can read or open in the browser.", "智能体可以在浏览器中读取或打开的 URL。"],
    ["How this feature would help you and other users", "此功能将如何帮助你和其他用户"],
    ["Settings for conversations outside of projects.", "项目之外的对话设置。"],
    ["Whatever the voice-engine-addr flag serves you.", "使用由 voice-engine-addr 参数提供的语音引擎。"],
    ["Automations do not inherit Global Permissions.", "自动化任务不继承全局权限。"],
    ["Check availability, schedule events, and RSVP.", "查看空闲时间、安排活动并回复活动邀请。"],
    ["Configure allowed and denied URLs for reading.", "配置允许和拒绝读取的 URL。"],
    ["Continue conversation in the current workspace", "在当前工作区继续对话"],
    ["Controls permissions for remote conversations.", "控制远程对话的权限。"],
    ["Save rule to always allow using this MCP tool?", "保存规则以始终允许使用此 MCP 工具？"],
    ["Close split view and go to forked conversation", "关闭分屏视图并转到派生的对话"],
    ["Your changes were not saved. Please try again.", "更改未保存，请重试。"],
    ["This link wants to open an app on your device.", "此链接请求打开你设备上的应用。"],
    ["Encountered an error while running the plugin.", "运行插件时出错。"],
    ["Change VCS in General settings, under Advanced", "在“常规”设置的“高级”部分更改版本控制系统"],
    ["Show AI autocomplete suggestions in the editor", "在编辑器中显示 AI 自动补全建议"],
    ["? This removes it from your config directory.", "？这会将它从您的配置目录中移除。"],
    ["Any error messages seen when trying to log in", "尝试登录时看到的任何错误信息"],
    ["Are you sure you want to delete the workspace", "确定要删除工作区"],
    ["Are you sure you want to delete this handler?", "确定要删除此处理程序吗？"],
    ["Choose the experience that fits how you work.", "选择适合您工作方式的体验模式。"],
    ["This option is disabled by your organization.", "此选项已被您所在的组织禁用。"],
    ["This setting is managed by your organization.", "此设置由您所在的组织管理。"],
    ["to ask for content changes for legal reasons.", "申请出于法律原因的内容变更。"],
    ["Ask the agent to diagnose and fix this server", "让智能体诊断并修复此服务器"],
    ["Image rendering blocked (strict mode enabled)", "图片渲染已阻止（已启用严格模式）"],
    ["Too many requests, please try again in a bit!", "请求过于频繁，请稍后重试！"],
    ["Agent needs permission to execute JavaScript", "智能体需要权限才能执行 JavaScript"],
    ["Conversation copied as Markdown to clipboard", "对话已作为 Markdown 复制到剪贴板"],
    ["Please list the steps to reproduce the issue", "请列出复现此问题的步骤"],
    ["Preview is not available for this file type.", "此类文件暂不支持预览。"],
    ["Quickly add and update imports with Tab key.", "按下 Tab 键快速添加和更新导入。"],
    ["Search conversations (by name or Cascade ID)", "搜索对话（按名称或 Cascade ID）"],
    ["Stored and mounted in your cloud environment", "存储并挂载到你的云端环境中"],
    ["Microphone blocked in browser site settings.", "麦克风已在浏览器网站设置中被阻止。"],
    ["Select text in the artifact to add a comment", "选择产物中的文本以添加评论"],
    ["Some non-image binary content was truncated.", "部分非图像二进制内容已被截断。"],
    ["Here's how you and your agents work together", "了解你与智能体如何协作"],
    ["Collaborate with the agent to complete tasks", "与智能体协作完成任务"],
    ["% of the customization budget is available.", "% 的自定义预算可用。"],
    ["broadcast Go Live, Click to run live server", "广播 Go Live，点击运行实时服务器"],
    ["Configure the browser subagent. It requires", "配置浏览器子智能体。它需要"],
    ["Configure when follow-up messages are sent.", "配置何时发送后续消息。"],
    ["Connected Google Drive and GitHub resources", "已关联的 Google 云端硬盘与 GitHub 资源"],
    ["Manage fine-grained permissions for GitHub.", "管理针对 GitHub 的细粒度权限配置。"],
    ["No active terminals. Click + to create one.", "暂无活动终端。点击 + 创建一个。"],
    ["No customizations found for this workspace.", "此工作区没有找到自定义内容。"],
    ["Save rule to always allow reading this URL?", "保存规则以始终允许读取此 URL？"],
    ["to back up your data and run the migration.", "备份数据并运行迁移。"],
    ["Work with local agents from another device.", "从其他设备连接并使用本地智能体。"],
    ["Conversation is not open in this Hub window", "此对话未在当前主窗口中打开"],
    ["Are you sure you want to reload the window?", "确定要重新加载窗口吗？"],
    ["Google3 projects are deprecated. Learn more", "Google3 项目已弃用。了解详情"],
    ["Antigravity would like to use the browser.", "Antigravity 想要使用浏览器。"],
    ["Confirmation required to execute this step", "执行此步骤需要确认"],
    ["Failed to inspect license for this project", "检查当前项目的许可证信息失败"],
    ["Failed to validate the saved GitHub token.", "验证已保存的 GitHub 令牌失败。"],
    ["Folder no longer exists or is unavailable.", "文件夹不再存在或不可用。"],
    ["Hook will trigger if any tool is executed.", "当执行任何工具时均会触发钩子。"],
    ["Input device for voice mode and dictation.", "语音模式和语音输入使用的设备。"],
    ["Search, upload, download, and share files.", "搜索、上传、下载和共享文件。"],
    ["Show suggestions when typing in the editor", "在编辑器中输入时显示建议"],
    ["Enable this plugin to manage its accounts.", "启用此插件以管理其账号。"],
    ["Failed to parse settings. Fix and restart.", "解析设置失败，请修复后重新启动。"],
    ["Refreshed credentials for all automations.", "已刷新所有自动化任务的凭据。"],
    ["Allow Tab to access .gitignore exclusions", "Tab 键访问 .gitignore 排除文件"],
    ["Ask anything, @ to mention, / for actions", "想问什么都可以，@ 引用，/ 执行动作"],
    ["Credential expired. Click to refresh TDAT", "凭据已过期。点击刷新 TDAT"],
    ["Interrupt the agent and send immediately.", "打断智能体并立即发送。"],
    ["projectManagementService is not available", "项目管理服务当前不可用"],
    ["Sign in to finish setting up this plugin.", "登录以完成此插件的配置。"],
    ["Type absolute path or navigate folders...", "输入绝对路径或浏览文件夹..."],
    ["No internet. Agent features may not work.", "没有网络连接，智能体功能可能无法使用。"],
    ["Missing a repository? Configure on GitHub", "缺少仓库？在 GitHub 上配置"],
    ["Type a voice variant name, such as rev27.", "输入语音变体名称，例如 rev27。"],
    ["Restores workspace and chat to this point", "将工作区和聊天恢复到此时的状态"],
    ["Finish onboarding to start using the IDE.", "完成入门设置后即可开始使用 IDE。"],
    ["Commands and files these agents can use.", "这些智能体可调用的命令与文件。"],
    ["Configure AI models and view your quota.", "配置 AI 模型并查看额度。"],
    ["Controls the actions the agent can take.", "控制智能体可以执行的操作。"],
    ["Enter a URL (e.g. http://localhost:8080)", "输入网址（例如 http://localhost:8080）"],
    ["Explore other marketplace customizations", "探索更多应用市场自定义内容"],
    ["Organization Allowed Domains (Read-Only)", "组织允许的域名（只读）"],
    ["Terminal commands the agent can execute.", "智能体可执行的终端命令。"],
    ["Attaching logs requires an email address", "附加日志需要提供电子邮件地址"],
    ["Creating projects for your conversations", "正在为你的对话创建项目"],
    ["A project with this name already exists.", "已存在同名项目。"],
    ["Only this conversation uses this preset.", "仅当前对话使用此预设。"],
    ["Block all browser JavaScript execution.", "阻止所有浏览器 JavaScript 执行。"],
    ["Cancel questionnaire and stop the agent", "取消问卷并停止智能体"],
    ["Explain and Fix in Current Conversation", "在当前对话中解释并修复"],
    ["Failed to upload HTML artifact to Drive", "上传 HTML 产物至云端硬盘失败"],
    ["GCP Project ID for enterprise features.", "适用于企业级功能的 GCP 项目 ID。"],
    ["Local permissions have higher priority.", "本地权限优先级更高。"],
    ["Manually customize individual settings.", "手动自定义各项设置。"],
    ["Rules help guide the behavior of Agent.", "规则用于指导智能体的行为。"],
    ["Security agent decides if commands run.", "由安全智能体决定是否运行命令。"],
    ["Paste the code shown after you sign in.", "粘贴登录后显示的代码。"],
    ["Files and resources in cloud workspaces", "云工作区中的文件与资源"],
    ["The remote shared a link for this push.", "远程端为此次推送提供了链接。"],
    ["Plan carefully before executing a task.", "执行任务前先仔细规划。"],
    ["Allow/deny specific terminal commands.", "允许或拒绝指定终端命令。"],
    ["Google Drive integration not available", "Google 云端硬盘集成不可用"],
    ["No (tell the agent what to do instead)", "否（告诉智能体改做什么）"],
    ["Organization MCP Allowlist (Read-Only)", "组织 MCP 允许列表（只读）"],
    ["Run all commands without restrictions.", "不受限制地运行所有命令。"],
    ["Use theme to be imported with settings", "随设置导入时使用的主题"],
    ["Choose where terminal sessions appear.", "选择终端会话的显示位置。"],
    ["Each plugin can be managed on its own.", "每个插件都可以单独管理。"],
    ["Microphone blocked in system settings.", "麦克风已在系统设置中被阻止。"],
    ["No content available for this resource", "此资源没有可用内容"],
    ["A group with this name already exists.", "已存在同名分组。"],
    ["Pricing is based on public API pricing", "定价以公开 API 价格为基础"],
    ["Trust the agent to do tasks end-to-end", "信任智能体独立完成整个任务"],
    ["Automatically decide if commands run.", "自动判断是否运行命令。"],
    ["example: source ~/.jetski_shell_setup", "示例：source ~/.jetski_shell_setup"],
    ["Include Jetski Default Customizations", "包含 Jetski 默认自定义项"],
    ["Manage your notification preferences.", "管理您的通知偏好设置。"],
    ["Open the agent panel on window reload", "窗口重新加载时打开智能体面板"],
    ["Outside of folders file access policy", "文件夹外访问策略"],
    ["Read, edit, and export presentations.", "阅读、编辑和导出演示文稿。"],
    ["Read, write, and format spreadsheets.", "读取、写入电子表格并设置格式。"],
    ["Select where to open the conversation", "选择在哪里打开对话"],
    ["Set the rules, define the boundaries.", "设定规则，划定边界。"],
    ["Share your referral link with friends", "与好友分享你的推荐链接"],
    ["Drag to resize, double-click to reset", "拖动以调整大小，双击以重置"],
    ["What should the agent do on each run?", "每次运行时智能体应该做什么？"],
    ["Add them to allow future interactions", "将其加入允许列表，以便以后进行交互"],
    ["Couldn't delete your data. Try again.", "无法删除数据，请重试。"],
    ["Couldn't load Google Drive link title", "无法加载 Google 云端硬盘链接标题"],
    ["New models have been enabled for you!", "已为你启用新模型！"],
    ["Failed to create CitC clone workspace", "创建 CitC 克隆工作区失败"],
    ["The current trigger rate is too high.", "当前触发频率过高。"],
    ["Invoke a browser agent for web tasks.", "调用浏览器智能体处理网页任务。"],
    ["AI Credits Used to Generate Response", "已使用 AI 积分生成回复"],
    ["Allow executing actions on this URL?", "允许在此 URL 上执行操作？"],
    ["Configure allowed terminal commands.", "配置允许的终端命令。"],
    ["Did restarting the desktop app help?", "重启桌面应用是否有助于解决问题？"],
    ["Manage your model quota and credits.", "管理您的模型额度与积分。"],
    ["Scan the code to open this device in", "扫描二维码以在远程控制中打开此设备"],
    ["There are no customizations enabled.", "没有启用任何自定义项。"],
    ["No customizations match your search.", "没有与搜索条件匹配的自定义项。"],
    ["Manage project folders and settings.", "管理项目文件夹和设置。"],
    ["Authenticated via Enterprise Gateway", "已通过企业网关身份验证"],
    ["(tell the agent what to do instead)", "（告诉智能体改做什么）"],
    ["Are you sure you want to delete the", "确定要删除"],
    ["Browser Javascript Execution Policy", "浏览器 JavaScript 执行策略"],
    ["Browser JavaScript Execution Policy", "浏览器 JavaScript 执行策略"],
    ["By using this app, you agree to its", "使用本应用即表示你同意其"],
    ["Describe the bug you encountered...", "描述您遇到的错误..."],
    ["Downloading the Antigravity binary…", "正在下载 Antigravity 程序…"],
    ["Enter command (e.g., git, blaze)...", "输入命令（例如 git、blaze）..."],
    ["Loading workspace customizations...", "正在加载工作区自定义项..."],
    ["Manage and delete your data anytime", "随时管理并删除你的数据"],
    ["Queue until after the current turn.", "排队直到当前轮次结束后发送。"],
    ["Set how fast Tab suggestions appear", "设置 Tab 建议的显示速度"],
    ["Simulate running on a different OS.", "模拟在不同的操作系统上运行。"],
    ["Couldn't mark conversations as read", "无法将对话标记为已读"],
    ["Chief of Staff voice mode is active", "统筹助手语音模式已开启"],
    ["Keep All Chat Edits in this Session", "保留此会话中的所有聊天编辑"],
    ["Chief of Staff voice message failed", "统筹助手语音消息发送失败"],
    ["Importing project from AI Studio...", "正在从 AI Studio 导入项目..."],
    ["all commands without restrictions.", "无限制运行所有命令。"],
    ["Build with Antigravity IDE Plugins", "使用 Antigravity IDE 插件构建"],
    ["to have the agent generate a plan.", "让智能体生成计划。"],
    ["Search for files in the project...", "在项目中搜索文件..."],
    ["Design, creative, and media tools.", "设计、创意和媒体工具。"],
    ["Remove from history (Shift+Delete)", "从历史记录中移除 (Shift+Delete)"],
    ["Finish signing in in your browser.", "请在浏览器中完成登录。"],
    ["Drag to select a region to comment", "拖动选择要评论的区域"],
    ["Fetched network requests for page.", "已获取页面的网络请求。"],
    ["Unable to resolve audio source URL", "无法解析音频源 URL"],
    ["File Tree Component is not loaded.", "文件树组件尚未加载。"],
    ["Sends after agent finishes working", "在智能体完成工作后发送"],
    ["Enter Google Cloud Project Details", "输入 Google Cloud 项目详情"],
    ["Failed to load shared conversation", "加载共享对话失败"],
    ["Assist the agent to complete tasks", "协助智能体完成任务"],
    ["Create a new global workflow file.", "创建新的全局工作流文件。"],
    ["扫描二维码以在此设备上打开 Remote Control, or ", "扫描二维码以在远程控制中打开此设备，或 "],
    ["all commands without restrictions", "无限制运行所有命令"],
    ["Click to learn more about sources", "点击了解更多关于来源的信息"],
    ["Configure GitHub access policies.", "配置 GitHub 访问策略。"],
    ["Failed to Generate Commit Message", "生成提交说明失败"],
    ["Initializing virtual environments", "正在初始化虚拟环境"],
    ["No plugin loads from this folder.", "此文件夹中未加载任何插件。"],
    ["Open Agent panel on window reload", "窗口重新加载时打开智能体面板"],
    ["Productivity & Project Management", "效率与项目管理"],
    ["Telemetry is disabled in Settings", "遥测功能已在设置中禁用"],
    ["The agent always asks for review.", "智能体始终请求审核。"],
    ["to have the agent generate a plan", "让智能体生成计划"],
    ["Use full Git clones for Best of N", "为 Best of N 使用完整 Git 克隆"],
    ["Use full VCS clones for Best of N", "为 Best of N 使用完整 VCS 克隆"],
    ["Why did you choose this response?", "您为什么选择此回复？"],
    ["Docs, Sheets, Slides, and folders", "文档、表格、幻灯片和文件夹"],
    ["Fetched network request for page.", "已获取页面的网络请求。"],
    ["This chat's environment is paused", "此对话的环境已暂停"],
    ["Sidecar feature is not available.", "Sidecar 功能不可用。"],
    ["Pairs (arm order may be shuffled)", "配对（分组顺序可能会打乱）"],
    ["Discover helpful skills & plugins", "发现有用的技能与插件"],
    ["Chief of Staff voice mode stopped", "统筹助手语音模式已停止"],
    ["扫描二维码以此设备上打开 Remote Control, or ", "扫描二维码以在远程控制中打开此设备，或 "],
    ["扫描二维码以在此设备上打开 Remote Control, or", "扫描二维码以在远程控制中打开此设备，或"],
    ["Allow write access to this path?", "允许写入此路径？"],
    ["Ask before sensitive operations.", "执行敏感操作前先询问。"],
    ["Connecting to language server...", "正在连接语言服务..."],
    ["Daily conversation limit reached", "已达到每日会话上限"],
    ["Every command requires approval.", "每条命令都需要审核。"],
    ["Folders these agents can access.", "这些智能体可访问的文件夹。"],
    ["How loud Antigravity's voice is.", "调整 Antigravity 语音的音量。"],
    ["Manage Antigravity app settings.", "管理 Antigravity 应用设置。"],
    ["Mark This Conversation as Unread", "将此对话标为未读"],
    ["Select one of the three options.", "选择以下三个选项之一。"],
    ["Set the speed of tab suggestions", "设置 Tab 建议的显示速度"],
    ["This command ran in the sandbox.", "此命令已在沙盒中运行。"],
    ["Toggle Between Light/Dark Themes", "切换浅色或深色主题"],
    ["Taking longer than usual to load", "加载时间比平时更长"],
    ["Sign in with a different account", "使用其他账号登录"],
    ["For example: Morning bug summary", "例如：早间缺陷汇总"],
    ["The branch was pushed to GitLab.", "分支已推送到 GitLab。"],
    ["The change was pushed to Gerrit.", "变更已推送到 Gerrit。"],
    ["What is missing in your workflow", "你的工作流中缺少什么"],
    ["Use Google Cloud project instead", "改用 Google Cloud 项目"],
    ["Importing shared conversation...", "正在导入共享对话..."],
    ["Fork conversation in this folder", "在此文件夹中派生对话"],
    ["Max tokens until compaction info", "触发压缩前的最大 Token 数信息"],
    ["Interview me to align on a plan.", "通过提问与我就计划达成一致。"],
    ["? This action cannot be undone.", "？此操作无法撤销。"],
    ["扫描二维码以此设备上打开 Remote Control, or", "扫描二维码以在远程控制中打开此设备，或"],
    ["Agent Non-Workspace File Access", "智能体访问工作区外文件"],
    ["Allow read access to this path?", "允许读取此路径？"],
    ["Are you sure you want to delete", "确定要删除"],
    ["Enter file or directory path...", "输入文件或目录路径..."],
    ["Error loading Browser recording", "加载浏览器录制内容时出错"],
    ["Folder has more than 1000 files", "文件夹包含超过 1000 个文件"],
    ["No quota information available.", "暂无可用的配额信息。"],
    ["Open search in external browser", "在外部浏览器中打开搜索"],
    ["Search by name or Cascade ID...", "按名称或 Cascade ID 搜索..."],
    ["Set the volume of agent sounds.", "设置智能体提示音的音量。"],
    ["Split Conversation Horizontally", "水平拆分对话"],
    ["Terminal Command Auto Execution", "终端命令自动执行"],
    ["User cancelled agent execution.", "用户已取消智能体执行。"],
    ["Welcome to the new Antigravity!", "欢迎使用新版 Antigravity！"],
    ["Open the page in system browser", "在系统浏览器中打开页面"],
    ["Continue with different account", "使用其他账号继续"],
    ["This bundle has no plugins yet.", "此插件包中还没有插件。"],
    ["Select or enter a workspace URI", "选择或输入工作区 URI"],
    ["Failed to create remote project", "创建远程项目失败"],
    ["Prompt to run when triggered...", "输入触发时要运行的提示词..."],
    ["Best of N mode is not available", "Best of N 模式不可用"],
    ["Reset all shortcuts to defaults", "将所有快捷键恢复为默认值"],
    ["Dismiss IWA installation banner", "关闭 IWA 安装提示"],
    ["Add screenshot to conversation", "添加屏幕截图到会话"],
    ["Allow access to this resource?", "允许访问此资源？"],
    ["Are you sure you want to quit?", "确定要退出吗？"],
    ["Attach a screenshot (optional)", "附上截图（可选）"],
    ["Attach Antigravity server logs", "附上 Antigravity 服务端日志"],
    ["Attach Antigravity Server Logs", "附上 Antigravity 服务端日志"],
    ["Build with one agent or a team", "单智能体或多智能体团队协同构建"],
    ["Enable notifications for Agent", "为智能体启用通知"],
    ["Enable Notifications for Agent", "启用智能体系统通知"],
    ["Getting started with a Project", "开始使用项目"],
    ["Mark This Conversation as Read", "将此对话标为已读"],
    ["Refresh quota and credits data", "刷新额度和积分数据"],
    ["Terminal & Tooling Permissions", "终端与工具权限"],
    ["The full developer experience.", "面向开发者的完整全功能体验。"],
    ["Toggle Maximize Auxiliary Pane", "切换最大化辅助窗格"],
    ["Your connection is not private", "你的连接不是私密连接"],
    ["Auto-assignment not configured", "未配置自动分配"],
    ["Delete All Remote Agents Data?", "删除所有远程智能体数据？"],
    ["Create a Plugin with the Agent", "使用智能体创建插件"],
    ["Explore the plugin marketplace", "浏览插件市场"],
    ["Could not create Cog workspace", "无法创建 Cog 工作区"],
    ["Failed to delete side question", "删除副问题失败"],
    ["Sending transcribed message...", "正在发送转录后的消息..."],
    ["Setup script ran successfully.", "设置脚本运行成功。"],
    ["Screenshot must be under 10 MB", "截图必须小于 10 MB"],
    ["Connect your account to browse", "连接账号以浏览"],
    ["Apps connected to your account", "已连接到你账号的应用"],
    ["Failed to start Best of N mode", "启动 Best of N 模式失败"],
    ["To use the agent, please login", "请登录以使用智能体"],
    ["Enable tab in gitignored files", "在 Git 忽略的文件中启用 Tab"],
    ["Dismiss artifact update notice", "关闭产物更新通知"],
    ["Show the welcome screen again.", "重新显示欢迎界面。"],
    ["Agent always asks for review.", "智能体始终请求审核。"],
    ["Agent terminated due to error", "智能体因错误而终止"],
    ["Browser Actuation Permissions", "浏览器操作权限"],
    ["e.g. \"My Custom Gemini Model\"", "例如“我的自定义 Gemini 模型”"],
    ["Enable Sandbox Mode (Preview)", "启用沙盒模式（预览）"],
    ["Failed to delete conversation", "删除对话失败"],
    ["Failed to rename conversation", "重命名对话失败"],
    ["Managed by Enterprise Gateway", "由企业网关托管"],
    ["New Conversation in Workspace", "在工作区中新建对话"],
    ["Requires manual confirmation.", "需要手动确认。"],
    ["Review plans and walkthroughs", "审查计划与演练讲解"],
    ["Run in your current workspace", "在当前工作区中运行"],
    ["See more in Build with Google", "查看“使用 Google 构建”中的更多内容"],
    ["Split Conversation Vertically", "垂直拆分对话"],
    ["The voice used in Voice mode.", "语音模式使用的声音。"],
    ["Undo changes up to this point", "撤销到此处的更改"],
    ["Workspace URI query parameter", "工作区 URI 查询参数"],
    ["Click to view or edit comment", "点击查看或编辑评论"],
    ["Delete All Remote Agents Data", "删除所有远程智能体数据"],
    ["Enable the plugin to sign in.", "启用此插件后即可登录。"],
    ["Keeps your checkout untouched", "保持当前检出状态不变"],
    ["Failed to start side question", "启动副问题失败"],
    ["Failed to revert conversation", "恢复对话失败"],
    ["Set at least one scope filter", "至少设置一个范围筛选条件"],
    ["Too many environments running", "运行中的环境过多"],
    ["Active Tasks & Conversations:", "活跃任务与对话："],
    ["Boolean AND, OR, and negation", "布尔与、或及取反"],
    ["Failed to refresh credentials", "刷新凭据失败"],
    ["e.g., main or refs/heads/main", "例如 main 或 refs/heads/main"],
    ["Create a Fig shared workspace", "创建 Fig 共享工作区"],
    ["Address CLs needing attention", "处理需要关注的更改列表"],
    ["Allow List Terminal Commands", "终端命令允许列表"],
    ["Auto-Expand Changes Overview", "自动展开更改概览"],
    ["Baseline model quota reached", "已达基础模型额度上限"],
    ["Better instruction following", "指令遵循更准确"],
    ["Download the Antigravity IDE", "下载 Antigravity IDE"],
    ["Enter tool name or server...", "输入工具名称或服务器..."],
    ["Failed to send side question", "发送副问题失败"],
    ["Failed to start conversation", "启动对话失败"],
    ["Loading available plugins...", "正在加载可用插件..."],
    ["Manage application settings.", "管理应用设置。"],
    ["Only stored on your machine.", "仅存储在你的本地计算机上。"],
    ["Previous match (Shift+Enter)", "上一个匹配项 (Shift+Enter)"],
    ["Restart Main Language Server", "重启主语言服务"],
    ["Resume it to load this file.", "恢复该会话以加载此文件。"],
    ["Select Model to Send Message", "选择用于发送消息的模型"],
    ["Select Previous Conversation", "选择上一个对话"],
    ["Share Conversation (Preview)", "分享对话（预览）"],
    ["Sidebar grouped by workspace", "侧边栏已按工作区分组"],
    ["Steps to reproduce the issue", "重现此问题的步骤"],
    ["The other model hallucinated", "另一个模型出现了幻觉"],
    ["This page is going away soon", "此页面即将停用"],
    ["View archived in the sidebar", "在侧边栏查看已归档内容"],
    ["Couldn't edit queued message", "无法编辑排队中的消息"],
    ["No compatible devices found.", "未找到兼容的设备。"],
    ["No matching resources found.", "未找到匹配的资源。"],
    ["Loading installed plugins...", "正在加载已安装的插件..."],
    ["Provide Google Cloud Project", "提供 Google Cloud 项目"],
    ["Nothing is running right now", "当前没有正在运行的内容"],
    ["Error while editing notebook", "编辑笔记本时出错"],
    ["Error while reading notebook", "读取笔记本时出错"],
    ["Could not load the app view:", "无法加载应用视图："],
    ["Open extracted DOM in editor", "在编辑器中打开提取的 DOM"],
    ["Loading Browser recording...", "正在加载浏览器录制内容..."],
    ["Dismiss service announcement", "关闭服务公告"],
    ["GitHub Personal Access Token", "GitHub 个人访问令牌"],
    ["managed by your organization", "由你的组织管理"],
    ["Keep Chat Edits in this File", "保留此文件中的聊天编辑"],
    ["Undo Chat Edits in this File", "撤销此文件中的聊天编辑"],
    ["Refresh Custom Agent Configs", "刷新自定义智能体配置"],
    ["Workspace folder suggestions", "工作区文件夹建议"],
    ["Reset post-onboarding state.", "重置入门后的状态。"],
    ["Welcome to Cider with Jetski", "欢迎使用 Cider with Jetski"],
    ["Review pending conversations", "审核待处理的对话"],
    ["Allow running this command?", "允许运行此命令？"],
    ["Automatic Check for Updates", "自动检查更新"],
    ["Clearer writing & artifacts", "表述与产物更清晰"],
    ["Confirm Browser Interaction", "确认浏览器交互"],
    ["Context and Quota Indicator", "上下文与配额指示器"],
    ["Deny List Terminal Commands", "终端命令拒绝列表"],
    ["Enter avatar URL (optional)", "输入头像 URL（可选）"],
    ["Explore the new Antigravity", "探索新版 Antigravity"],
    ["Extension (Antigravity IDE)", "扩展 (Antigravity IDE)"],
    ["Failed to fork conversation", "创建分支对话失败"],
    ["Failed to stop conversation", "停止对话失败"],
    ["Gemini 4 Argon Weekly Limit", "Gemini 4 Argon 周额度"],
    ["Generate CitC Workspace VCS", "生成 CitC 工作区 VCS"],
    ["Max Tokens Until Compaction", "触发压缩的最大 Token 数"],
    ["New Conversation in Project", "在项目中新建对话"],
    ["Paths the agent can modify.", "智能体可修改的路径。"],
    ["Read, draft, and edit docs.", "阅读、起草和编辑文档。"],
    ["Show Remote Control QR code", "显示远程控制二维码"],
    ["Skills Configuration Error:", "技能配置错误："],
    ["Terms of Service & Data Use", "服务条款与数据使用"],
    ["Toggle Environment Selector", "切换环境选择器"],
    ["Windows Subsystem for Linux", "适用于 Linux 的 Windows 子系统"],
    ["Clear cookies and site data", "清除 Cookie 和网站数据"],
    ["Enter authorization code...", "输入授权码..."],
    ["Finalizing transcription...", "正在完成转录..."],
    ["Image preview not available", "图片预览不可用"],
    ["Daily environment time used", "每日环境使用时间已用尽"],
    ["This may take a few minutes", "这可能需要几分钟"],
    ["Use Regular Expression (.*)", "使用正则表达式 (.*)"],
    ["Search for conversations...", "搜索对话..."],
    ["Failed to create workspace.", "创建工作区失败。"],
    ["Configure Worktree Branches", "配置工作树分支"],
    ["Reset Post-Onboarding Setup", "重置入门后的设置"],
    ["Generate personalized rules", "生成个性化规则"],
    ["Open Command Center Default", "打开默认命令中心"],
    ["Administrator access (UAC)", "管理员权限 (UAC)"],
    ["Agent Auto-Fix Lint Errors", "智能体自动修复 Lint 错误"],
    ["Allow using this MCP tool?", "允许使用此 MCP 工具？"],
    ["Browser tools (browser_.*)", "浏览器工具 (browser_.*)"],
    ["Click to copy full command", "点击复制完整命令"],
    ["Cloud Hosting & Deployment", "云托管与部署"],
    ["Copy conversation markdown", "复制对话 Markdown"],
    ["Copy Conversation Markdown", "复制对话的 Markdown 内容"],
    ["Copy full URL to clipboard", "复制完整 URL 到剪贴板"],
    ["Don't show this for 2 days", "2 天内不再显示"],
    ["No automations configured.", "尚未配置任何自动化。"],
    ["No conversations available", "暂无可用对话"],
    ["Open Trajectory Debug View", "打开执行轨迹调试视图"],
    ["Open with External Browser", "使用外部浏览器打开"],
    ["Search MCP servers by name", "按名称搜索 MCP 服务器"],
    ["Sidebar grouped by project", "侧边栏已按项目分组"],
    ["This site can’t be reached", "无法访问此网站"],
    ["Toggle Maximize Side Panel", "切换最大化侧边栏面板"],
    ["Uploading to Google Drive…", "正在上传到 Google 云端硬盘…"],
    ["Continue with Google Cloud", "使用 Google Cloud 继续"],
    ["Having trouble signing in?", "登录遇到问题？"],
    ["No matching plugins found.", "未找到匹配的插件。"],
    ["Conversation limit reached", "已达到对话数量上限"],
    ["Model Summarization Failed", "模型摘要生成失败"],
    ["Join the Google Chat space", "加入 Google Chat 空间"],
    ["Work in an ABFS workspace.", "在 ABFS 工作区中工作。"],
    ["Workspace URI to switch to", "要切换到的工作区 URI"],
    ["Resize side question panel", "调整侧边问题面板大小"],
    ["Workspace mismatch actions", "工作区不匹配时的操作"],
    ["Search for content to open", "搜索要打开的内容"],
    ["Create New Global Workflow", "创建新的全局工作流"],
    ["Reset to default shortcuts", "将快捷键恢复为默认值"],
    ["Core AI Systems is hiring!", "Core AI Systems 正在招聘！"],
    ["Your This Computer setting", "您在“此电脑”中的设置"],
    ["Antigravity Starter Quota", "Antigravity 起始配额"],
    ["Archive this conversation", "归档此对话"],
    ["Archive This Conversation", "归档此对话"],
    ["Browser User Profile Path", "浏览器用户资料路径"],
    ["Build With Google Plugins", "使用 Google 插件构建"],
    ["Built with Google Plugins", "使用 Google 插件构建"],
    ["Enable AI Credit Overages", "启用 AI 积分超额使用"],
    ["Enter bot name (optional)", "输入机器人名称（可选）"],
    ["Failed to create terminal", "创建终端失败"],
    ["Five Hour Limit Remaining", "剩余 5 小时限额"],
    ["Local Windows environment", "本地 Windows 环境"],
    ["MCP Authentication Error:", "MCP 身份验证错误："],
    ["Open Conversation History", "打开对话历史"],
    ["Other (write your answer)", "其他（输入您的回答）"],
    ["Paths the agent can read.", "智能体可读取的路径。"],
    ["Project validation failed", "项目验证失败"],
    ["Project-Specific Settings", "项目专属设置"],
    ["Refresh gcert Credentials", "刷新 gcert 凭据"],
    ["Search conversations with", "点击左上角的"],
    ["Select Python Interpreter", "选择 Python 解释器"],
    ["Skills and Rules Settings", "技能与规则设置"],
    ["Something else (optional)", "其他原因（可选）"],
    ["Sync JJ Worktrees to Head", "将 JJ 工作树同步到最新提交"],
    ["Toggle Agent (Ctrl+Alt+B)", "切换智能体 (Ctrl+Alt+B)"],
    ["Loading customizations...", "正在加载自定义项..."],
    ["Agent Hooks Configuration", "智能体钩子配置"],
    ["Enable Recommended Skills", "启用推荐技能"],
    ["No files or folders found", "未找到文件或文件夹"],
    ["Open in full conversation", "在完整对话中打开"],
    ["Failed to load some diffs", "部分差异加载失败"],
    ["Connecting to terminal...", "正在连接终端..."],
    ["Failed to get annotations", "获取批注失败"],
    ["Failed to create worktree", "创建工作树失败"],
    ["Link copied to clipboard.", "链接已复制到剪贴板。"],
    ["Artifact updated by agent", "产物已由智能体更新"],
    ["Couldn't switch accounts:", "无法切换账号："],
    ["Error fetching MCP prompt", "获取 MCP 提示词失败"],
    ["Open Folder (Interactive)", "打开文件夹（交互式）"],
    ["Work in a CitC workspace.", "在 CitC 工作区中工作。"],
    ["What counts as a document", "哪些内容算作文档"],
    ["Any relevant information", "任何相关信息"],
    ["Commands Outside Sandbox", "沙盒外命令执行"],
    ["Complete Onboarding Step", "完成引导步骤"],
    ["Conversation unavailable", "对话不可用"],
    ["Current sidebar grouping", "当前侧边栏分组方式"],
    ["Default Cog Branch / Ref", "默认 Cog 分支 / 引用"],
    ["Search Recent Workspaces", "搜索最近的工作区"],
    ["Updated sidebar grouping", "已更新侧边栏分组方式"],
    ["Notification Preferences", "通知偏好设置"],
    ["Open in external browser", "在外部浏览器中打开"],
    ["Open in Built-in Browser", "在内置浏览器中打开"],
    ["Discard unstaged changes", "放弃未暂存的更改"],
    ["Search customizations...", "搜索自定义项..."],
    ["Select Next Conversation", "选择下一个对话"],
    ["Rename This Conversation", "重命名此对话"],
    ["Include unstaged changes", "包含未暂存的更改"],
    ["MCP Configuration Error:", "MCP 配置错误："],
    ["Editor-Specific Settings", "编辑器专属设置"],
    ["Enable Shell Integration", "启用 Shell 集成"],
    ["Import AI Studio Project", "导入 AI Studio 项目"],
    ["Launching the browser...", "正在启动浏览器..."],
    ["No MCP servers installed", "未安装 MCP 服务器"],
    ["Open Conversation Picker", "打开对话选择器"],
    ["Project name. E.g. Tasks", "项目名称，例如 Tasks"],
    ["Workspace Command Access", "工作区命令访问"],
    ["Your Plan: Google AI Pro", "你的套餐：Google AI Pro"],
    ["Design, Creative & Media", "设计、创意与媒体"],
    ["Failed to load resources", "加载资源失败"],
    ["Business Account Sign In", "商务账号登录"],
    ["Could not create project", "无法创建项目"],
    ["Fork in Shared Workspace", "在共享工作区中派生"],
    ["Loading conversations...", "正在加载对话..."],
    ["Loading Notebook View...", "正在加载笔记本视图..."],
    ["Failed to render diagram", "渲染图表失败"],
    ["Resolving permissions...", "正在解析权限..."],
    ["No token data available.", "没有可用的 Token 数据。"],
    ["Uploaded to Google Drive", "已上传到 Google 云端硬盘"],
    ["Error rendering playback", "渲染回放时出错"],
    ["View could not be opened", "无法打开视图"],
    ["CEL Expression Reference", "CEL 表达式参考"],
    ["Remote Control Instances", "远程控制实例"],
    ["view full search results", "查看完整搜索结果"],
    ["Antigravity Tab Settings", "Antigravity 标签页设置"],
    ["Duplicate workspace name", "工作区名称重复"],
    ["Failed to resolve folder", "无法定位文件夹"],
    ["Enable Tab Sounds (Beta)", "启用 Tab 音效（测试版）"],
    ["Work in a Cog workspace.", "在 Cog 工作区中工作。"],
    ["Show Conversation Picker", "显示对话选择器"],
    ["Advanced Command Access", "高级命令访问"],
    ["Agent execution failed.", "智能体执行失败。"],
    ["Allow reading this URL?", "允许读取此 URL？"],
    ["Automatic update checks", "自动检查更新"],
    ["Back to Scheduled Tasks", "返回定时任务"],
    ["Browser Actuation Rules", "浏览器操作规则"],
    ["Copy error to clipboard", "将错误复制到剪贴板"],
    ["Customize Global Skills", "自定义全局技能"],
    ["Deny setting up browser", "拒绝设置浏览器"],
    ["Edit Conversation Title", "编辑对话标题"],
    ["Enable Demo Mode (Beta)", "启用演示模式（测试版）"],
    ["Enable Sounds for Agent", "启用智能体提示音"],
    ["Enable Terminal Sandbox", "启用终端沙盒"],
    ["Insufficient AI Credits", "AI 积分不足"],
    ["Markdown Artifact Width", "Markdown 产物宽度"],
    ["Marketplace Gallery URL", "插件市场列表 URL"],
    ["New Conversation Button", "新会话按钮"],
    ["Open Keyboard Shortcuts", "打开键盘快捷键"],
    ["Open System Preferences", "打开系统设置"],
    ["Open Workspace Selector", "打开工作区选择器"],
    ["Plugin Operation Error:", "插件操作错误："],
    ["Powered by Gemini Live.", "由 Gemini Live 提供支持。"],
    ["Previous Side Panel Tab", "上一个侧边栏标签页"],
    ["Queued Message Delivery", "排队消息发送"],
    ["Search conversations...", "搜索对话..."],
    ["Standalone Conversation", "独立对话"],
    ["Toggle Project Selector", "切换项目选择器"],
    ["Unpin This Conversation", "取消固定此对话"],
    ["Create a project first.", "请先创建项目。"],
    ["More cloud environments", "更多云端环境"],
    ["Conversation Unarchived", "对话已取消归档"],
    ["Open in Antigravity IDE", "在 Antigravity IDE 中打开"],
    ["Optional boolean filter", "可选布尔筛选条件"],
    ["Failed to load comments", "加载评论失败"],
    ["Authentication Required", "需要身份验证"],
    ["Close Tabs to the Right", "关闭右侧标签页"],
    ["Show or Hide Extensions", "显示或隐藏扩展"],
    ["UI view does not exist.", "界面视图不存在。"],
    ["No extensions available", "没有可用扩展"],
    ["Use Advanced SSO Config", "使用高级 SSO 配置"],
    ["Google Cloud Project ID", "Google Cloud 项目 ID"],
    ["Search file contents...", "搜索文件内容..."],
    ["Workspace setup warning", "工作区设置警告"],
    ["Log in to use the agent", "登录以使用智能体"],
    ["No resources added yet.", "尚未添加资源。"],
    ["Show Whitespace Changes", "显示空白字符更改"],
    ["Hide Whitespace Changes", "隐藏空白字符更改"],
    ["Refresh all credentials", "刷新所有凭据"],
    ["Create a new rule file.", "创建新规则文件。"],
    ["This page isn’t working", "此页面无法正常运行"],
    ["Amend and Upload Failed", "修订并上传失败"],
    ["Updates to your sidebar", "侧边栏更新"],
    ["Announcements and tips", "公告和提示"],
    ["Antigravity - Settings", "Antigravity - 设置"],
    ["Artifact Review Policy", "产物审核策略"],
    ["Auto-Open Edited Files", "自动打开已编辑文件"],
    ["Background Task Output", "后台任务输出"],
    ["Better solution & code", "方案与代码质量更好"],
    ["Cancel Sending Message", "取消发送消息"],
    ["Copy the trajectory ID", "复制轨迹 ID"],
    ["Default Cog Repository", "默认 Cog 仓库"],
    ["Default Customizations", "默认自定义项"],
    ["Edit permission target", "编辑权限目标"],
    ["Highlight After Accept", "接受后高亮"],
    ["Loading MCP servers...", "正在加载 MCP 服务器..."],
    ["Loading token usage...", "正在加载 Token 用量..."],
    ["Marketplace Search URL", "插件市场列表 URL"],
    ["Model Context Protocol", "模型上下文协议 (MCP)"],
    ["More thorough research", "调研更全面深入"],
    ["Move Conversation Down", "下移对话"],
    ["My Custom Gemini Model", "我的自定义 Gemini 模型"],
    ["No conversations found", "未找到对话"],
    ["No more older messages", "没有更早的消息了"],
    ["Open Browser (Preview)", "打开浏览器 (预览)"],
    ["Open in Remote Control", "在远程控制中打开"],
    ["Opening URL in Browser", "正在浏览器中打开 URL"],
    ["Pick at most 2 reasons", "最多选择 2 个原因"],
    ["quota and credits data", "额度和积分数据"],
    ["Search across files...", "跨文件搜索..."],
    ["Show Selection Actions", "显示选择操作"],
    ["Toggle Developer Tools", "切换开发者工具"],
    ["Toggle Voice Recording", "切换语音录制"],
    ["Weekly Limit Remaining", "剩余周额度"],
    ["Delete all recordings?", "删除所有录音？"],
    ["Authentication expired", "身份验证已过期"],
    ["Attach terminal output", "附加终端输出"],
    ["Plugin update required", "需要更新插件"],
    ["Work in a New Worktree", "在新工作树中工作"],
    ["Waiting for user input", "正在等待用户输入"],
    ["This chat is archived.", "此对话已归档。"],
    ["Open side-by-side view", "打开并排视图"],
    ["When something happens", "发生事件时"],
    ["Full output written to", "完整输出已写入"],
    ["No resources available", "没有可用资源"],
    ["Remote agents are busy", "远程智能体正忙"],
    ["Close Tabs to the Left", "关闭左侧标签页"],
    ["Side Pane UI Available", "侧边面板界面可用"],
    ["This cannot be undone.", "此操作无法撤销。"],
    ["Search for commands...", "搜索命令..."],
    ["Duplicate project name", "项目名称重复"],
    ["Upload to Google Drive", "上传到 Google Drive"],
    ["Failed to save project", "保存项目失败"],
    ["Copy this subtree JSON", "复制此子树的 JSON"],
    ["Conversation Telemetry", "对话遥测"],
    ["Previous side question", "上一个侧边问题"],
    ["Minimize side question", "最小化侧边问题"],
    ["Use regular expression", "使用正则表达式"],
    ["Refresh customizations", "刷新自定义项"],
    ["Model selector loading", "正在加载模型选择器"],
    ["Show Browser Allowlist", "显示浏览器允许列表"],
    ["Sync and Upload Failed", "同步并上传失败"],
    ["Playback speed (< / >)", "播放速度（< / >）"],
    ["Sent to Chief of Staff", "已发送给统筹助手"],
    ["Custom flag to turn on", "要启用的自定义标志"],
    ["Actuation Permissions", "操作权限"],
    ["Allow in Conversation", "在本次对话中允许"],
    ["At mention code block", "@ 引用代码块"],
    ["At Mention Code Block", "@ 引用代码块"],
    ["Auto-Execution Policy", "自动执行策略"],
    ["Claude and GPT models", "Claude 和 GPT 模型"],
    ["Claude and GPT Models", "Claude 和 GPT 模型"],
    ["Confirm Window Reload", "确认重新加载窗口"],
    ["Conversation Archived", "对话已归档"],
    ["Copy Config File Path", "复制配置文件路径"],
    ["Default Workspace VCS", "默认工作区 VCS"],
    ["Enable Remote Control", "启用远程控制"],
    ["Experimental features", "实验性功能"],
    ["Experimental Features", "实验性功能"],
    ["File path breadcrumbs", "文件路径导航面包屑"],
    ["Installed MCP Servers", "已安装的 MCP 服务器"],
    ["Model quota exhausted", "模型额度已耗尽"],
    ["More feedback options", "更多反馈选项"],
    ["Notification Settings", "通知设置"],
    ["Open project settings", "打开项目设置"],
    ["Opened URL in Browser", "已在浏览器中打开 URL"],
    ["Pin this conversation", "固定此对话"],
    ["Pin This Conversation", "固定此对话"],
    ["Previous Aux Pane Tab", "上一个辅助窗格标签页"],
    ["Regroup Google3 Chats", "重新对 Google3 聊天分组"],
    ["Run in a new worktree", "在新的 Worktree 中运行"],
    ["Sandbox Allow Network", "允许沙盒访问网络"],
    ["Search automations...", "搜索自动化..."],
    ["Start Voice Recording", "开始语音录制"],
    ["Suggestions in Editor", "编辑器内联建议"],
    ["Terminal: Add to Chat", "终端：添加到对话"],
    ["Toggle Auxiliary Pane", "切换辅助面板"],
    ["Toggle Model Selector", "切换模型选择器"],
    ["Toggle Overview Panel", "切换概览面板"],
    ["Workspace File Access", "工作区文件访问"],
    ["View site information", "查看网站信息"],
    ["Cookies and site data", "Cookie 和网站数据"],
    ["Open Image in New Tab", "在新标签页中打开图片"],
    ["Embedding Limitations", "嵌入限制"],
    ["Reset All to Defaults", "全部恢复默认值"],
    ["Save audio recordings", "保存录音"],
    ["Set up authentication", "设置身份验证"],
    ["Other sign-in options", "其他登录方式"],
    ["Verification required", "需要验证"],
    ["Complete verification", "完成验证"],
    ["No plugins available.", "没有可用的插件。"],
    ["Enter project name...", "输入项目名称..."],
    ["Fork in New Workspace", "在新工作区中派生"],
    ["No previous worktrees", "没有以前的工作树"],
    ["No environments found", "未找到环境"],
    ["Runs on this computer", "在此电脑上运行"],
    ["Binary file not shown", "不显示二进制文件"],
    ["Open in Notebook View", "在笔记本视图中打开"],
    ["No browser pages open", "没有打开的浏览器页面"],
    ["Failed to fetch diffs", "获取差异失败"],
    ["Failed to render math", "渲染数学公式失败"],
    ["Target text in PDF...", "在 PDF 中查找文本..."],
    ["Something went wrong!", "出现问题！"],
    ["Pull request creation", "创建拉取请求"],
    ["Choose a Subscription", "选择订阅"],
    ["Fallback Summary Used", "已使用备用摘要"],
    ["View network requests", "查看网络请求"],
    ["Match Whole Word (ab)", "全词匹配 (ab)"],
    ["What's in this bundle", "此插件包包含的内容"],
    ["Loading trajectory...", "正在加载执行轨迹..."],
    ["Prohibited Use Policy", "禁止使用政策"],
    ["Google Privacy Policy", "Google 隐私权政策"],
    ["troubleshooting guide", "故障排除指南"],
    ["No folders added yet.", "尚未添加文件夹。"],
    ["Google3 Configuration", "Google3 配置"],
    ["Trajectory Debug View", "轨迹调试视图"],
    ["Copy raw string value", "复制原始字符串值"],
    ["Send Terminal to Chat", "将终端发送到聊天"],
    ["Refresh custom agents", "刷新自定义智能体"],
    ["Customizations source", "自定义项来源"],
    ["Reason for opting out", "选择退出的原因"],
    ["Select Default Branch", "选择默认分支"],
    ["Resize terminal panes", "调整终端窗格大小"],
    ["Chief of Staff canvas", "统筹助手画布"],
    ["Delete ABFS Workspace", "删除 ABFS 工作区"],
    ["[Dev] GCP Project ID", "[开发] GCP 项目 ID"],
    ["Advanced File Access", "高级文件访问"],
    ["Agent Auto-Fix Lints", "智能体自动修复 Lint 错误"],
    ["Archive conversation", "归档对话"],
    ["Archive Conversation", "归档对话"],
    ["Cancel questionnaire", "取消问卷"],
    ["Collapse All Folders", "折叠所有文件夹"],
    ["Command Setup Script", "命令初始化脚本"],
    ["Comment on Selection", "评论选中内容"],
    ["Conversation History", "对话历史"],
    ["Copy Conversation ID", "复制对话 ID"],
    ["Create Cloud Project", "创建云端项目"],
    ["Custom Context Menus", "自定义右键菜单"],
    ["Customizations views", "自定义视图"],
    ["Dismiss notification", "关闭通知"],
    ["Download Diagnostics", "下载诊断信息"],
    ["Enable Browser Tools", "启用浏览器工具"],
    ["Enable Notifications", "启用通知"],
    ["Enter device name...", "输入设备名称…"],
    ["Enter URL pattern...", "输入 URL 匹配模式..."],
    ["Equalize Split Panes", "均分拆分窗格"],
    ["Error Loading Models", "加载模型出错"],
    ["Find in Conversation", "在对话中查找"],
    ["Go Explorer: Refresh", "Go 资源管理器: 刷新"],
    ["Marketplace Item URL", "插件市场单项 URL"],
    ["Move Conversation Up", "上移对话"],
    ["Network Access Rules", "网络访问规则"],
    ["No conversations yet", "暂无对话"],
    ["No updates available", "当前已是最新版本"],
    ["Open Agent on Reload", "重新加载时打开智能体"],
    ["Open Command Palette", "打开命令面板"],
    ["Open Editor Settings", "打开编辑器设置"],
    ["Open in Preview Pane", "在预览窗格中打开"],
    ["Other Customizations", "其他自定义项"],
    ["Pinned Conversations", "已固定对话"],
    ["Remote Control Issue", "远程控制问题"],
    ["Restore Conversation", "恢复对话"],
    ["Search all convos...", "搜索全部对话..."],
    ["Search Conversations", "搜索对话"],
    ["Search workspaces...", "搜索工作区…"],
    ["Stop Voice Recording", "停止语音录制"],
    ["Tab Gitignore Access", "Tab 键访问 .gitignore 排除文件"],
    ["Untracked (Unstaged)", "未跟踪（未暂存）"],
    ["Workspace + Worktree", "工作区与工作树"],
    ["Workspace Web Access", "工作区网页访问"],
    ["Yes, allow this time", "是，仅允许本次"],
    ["Open Link in New Tab", "在新标签页中打开链接"],
    ["Embedded web preview", "嵌入式网页预览"],
    ["Settings Unavailable", "设置不可用"],
    ["Continue with Google", "使用 Google 账号继续"],
    ["No Plugins Available", "没有可用的插件"],
    ["MCP Servers Disabled", "MCP 服务器已禁用"],
    ["Browse MCP resources", "浏览 MCP 资源"],
    ["Loading worktrees...", "正在加载工作树..."],
    ["Capture Console Logs", "捕获控制台日志"],
    ["Failed to stop agent", "停止智能体失败"],
    ["Delete Side Question", "删除副问题"],
    ["Blocked, needs input", "已阻止，需要输入"],
    ["Open Antigravity IDE", "打开 Antigravity IDE"],
    ["Where should it run?", "应该在哪里运行？"],
    ["No changes to review", "没有需要审查的更改"],
    ["Creating terminal...", "正在创建终端..."],
    ["Standalone Terminals", "独立终端"],
    ["Failed to load image", "加载图片失败"],
    ["Unsandboxed commands", "沙盒外命令"],
    ["Something went wrong", "出现问题"],
    ["Select another model", "选择其他模型"],
    ["Select Billing Model", "选择计费方式"],
    ["Setup script failed.", "设置脚本运行失败。"],
    ["View network request", "查看网络请求"],
    ["Knowledge Generation", "知识生成"],
    ["Paste a code instead", "改为粘贴代码"],
    ["Switch IDE Workspace", "切换 IDE 工作区"],
    ["Harness per Response", "每个回复的执行框架"],
    ["Software Engineering", "软件工程"],
    ["Voice engine address", "语音引擎地址"],
    ["Antigravity Settings", "Antigravity 设置"],
    ["Create a JJ worktree", "创建 JJ 工作树"],
    ["Active Browser pages", "活动的浏览器页面"],
    ["Refresh skills paths", "刷新技能路径"],
    ["Copy section content", "复制章节内容"],
    ["Add Context to Agent", "向智能体添加上下文"],
    ["View or edit comment", "查看或编辑评论"],
    ["Available workspaces", "可用工作区"],
    ["Show or Hide Plugins", "显示或隐藏插件"],
    ["Open Chat with Agent", "打开与智能体的聊天"],
    ["Quick Settings Panel", "快捷设置面板"],
    ["ABFS mount directory", "ABFS 挂载目录"],
    ["Advanced Web Access", "高级网页访问"],
    ["Agent security mode", "智能体安全模式"],
    ["App update required", "需要更新应用程序"],
    ["CitC Workspace Type", "CitC 工作区类型"],
    ["Conversation picker", "对话选择器"],
    ["Custom Agent Error:", "自定义智能体错误："],
    ["Delete Conversation", "删除对话"],
    ["Extension (VS Code)", "扩展 (VS Code)"],
    ["Failed to read file", "读取文件失败"],
    ["Follow the guide at", "请按照以下指南"],
    ["Load older messages", "加载更早的消息"],
    ["Loading Antigravity", "正在加载 Antigravity"],
    ["Model quota reached", "模型额度已达上限"],
    ["Modern Web Guidance", "现代 Web 开发指南"],
    ["Network Permissions", "网络权限"],
    ["Next Side Panel Tab", "下一个侧边栏标签页"],
    ["No active terminals", "无活动终端"],
    ["No background tasks", "无后台任务"],
    ["No Models Available", "暂无可用模型"],
    ["Open in Code Search", "在代码搜索中打开"],
    ["Open in Preview Tab", "在预览标签页中打开"],
    ["Open Project Picker", "打开项目选择器"],
    ["Open System Browser", "在系统浏览器中打开"],
    ["Other Conversations", "其他对话"],
    ["Parent Conversation", "父对话"],
    ["Permission Settings", "权限设置"],
    ["Pinned Conversation", "已固定对话"],
    ["Plugins in Featured", "精选插件"],
    ["Remote Control link", "远程控制链接"],
    ["Rename Conversation", "重命名对话"],
    ["Revert file changes", "还原文件更改"],
    ["Search shortcuts...", "搜索快捷键..."],
    ["Use Global Settings", "使用全局设置"],
    ["Write and edit docs", "编写与编辑文档"],
    ["Certificate details", "证书详情"],
    ["No recent downloads", "没有最近的下载"],
    ["Select your license", "选择许可证"],
    ["Enable Sandbox Mode", "启用沙盒模式"],
    ["Filter resources...", "筛选资源..."],
    ["Search Google Drive", "搜索 Google 云端硬盘"],
    ["Currently installed", "当前已安装"],
    ["No skills available", "没有可用技能"],
    ["No project selected", "未选择项目"],
    ["No workspaces open.", "没有打开的工作区。"],
    ["No projects created", "尚未创建项目"],
    ["Loading subagent...", "正在加载子智能体..."],
    ["No events recorded.", "没有事件记录。"],
    ["When should it run?", "应该何时运行？"],
    ["Preview unavailable", "预览不可用"],
    ["Unable to load PDF:", "无法加载 PDF："],
    ["No matching results", "没有匹配的结果"],
    ["GitHub Repositories", "GitHub 仓库"],
    ["Loading licenses...", "正在加载许可证..."],
    ["Upload Debug Bundle", "上传调试包"],
    ["Error while editing", "编辑时出错"],
    ["Error while viewing", "查看时出错"],
    ["Select an option...", "选择一个选项..."],
    ["Code Change Summary", "代码更改摘要"],
    ["Snooze for 24 Hours", "稍后提醒 24 小时"],
    ["Number of responses", "回复数量"],
    ["Reload this window.", "重新加载此窗口。"],
    ["Google One Referral", "Google One 推荐计划"],
    ["Get More AI Credits", "获取更多 AI 积分"],
    ["Copied to clipboard", "已复制到剪贴板"],
    ["Uploading to Drive…", "正在上传到 Google Drive…"],
    ["Connect to Cloudtop", "连接到 Cloudtop"],
    ["Create New Workflow", "创建新工作流"],
    ["Open Issue Reporter", "打开问题报告工具"],
    ["Upload Chain Failed", "上传链失败"],
    ["ABFS workspace name", "ABFS 工作区名称"],
    ["Citc workspace name", "CitC 工作区名称"],
    ["Add inline comment", "添加行内批注"],
    ["Add Scheduled Task", "添加定时任务"],
    ["Agent Conversation", "智能体对话"],
    ["Agent Host Address", "智能体主机地址"],
    ["Alphabetical (A-Z)", "按字母顺序 (A-Z)"],
    ["Analyzing Task Log", "正在分析任务日志"],
    ["Any error messages", "任何错误信息"],
    ["Autocomplete Speed", "补全速度"],
    ["Best of N Settings", "Best of N 设置"],
    ["Build new features", "构建全新功能"],
    ["Chrome Binary Path", "Chrome 可执行文件路径"],
    ["Clear search (Esc)", "清除搜索 (Esc)"],
    ["Close Terminal Tab", "关闭终端标签页"],
    ["Conversation Steps", "对话步骤"],
    ["Conversation Width", "对话宽度"],
    ["Copy trajectory ID", "复制轨迹 ID"],
    ["Create New Project", "创建新项目"],
    ["Create with Prompt", "通过提示词创建"],
    ["Creating a Project", "正在创建项目"],
    ["Delete Permanently", "永久删除"],
    ["Expand All Folders", "展开所有文件夹"],
    ["Getting scripts...", "正在获取脚本…"],
    ["GitHub Permissions", "GitHub 权限"],
    ["global permissions", "全局权限"],
    ["Global permissions", "全局权限"],
    ["Global Permissions", "全局权限"],
    ["Go Forward in Pane", "在窗格中前进"],
    ["Group By Workspace", "按工作区分组"],
    ["Insert in terminal", "插入到终端"],
    ["Insert in Terminal", "插入到终端"],
    ["Keyboard shortcuts", "键盘快捷键"],
    ["Keyboard Shortcuts", "键盘快捷键"],
    ["Marketplace notice", "插件市场说明"],
    ["MCP Install Error:", "MCP 安装错误："],
    ["MCP Restart Error:", "MCP 重启错误："],
    ["Mute Voice Speaker", "将语音扬声器静音"],
    ["New Scheduled Task", "新建定时任务"],
    ["Next match (Enter)", "下一个匹配项 (Enter)"],
    ["No answer provided", "未提供回答"],
    ["Open in New Window", "在新窗口中打开"],
    ["Outside of Project", "项目外"],
    ["Permission Details", "权限详情"],
    ["Plan Review Policy", "计划审核策略"],
    ["Previous Worktrees", "以前的工作树"],
    ["Proceed in Sandbox", "在沙盒中继续"],
    ["Project + Worktree", "项目与工作树"],
    ["Screen Reader Mode", "屏幕阅读器模式"],
    ["Search projects...", "搜索项目..."],
    ["Select Environment", "选择环境"],
    ["Sort Conversations", "排序对话"],
    ["Steps to Reproduce", "重现步骤"],
    ["Stop All Subagents", "停止全部子智能体"],
    ["Toggle File Viewer", "切换文件查看器"],
    ["Undo to this point", "撤销到此处"],
    ["Unpin Conversation", "取消固定对话"],
    ["Verbose agent chat", "详细智能体聊天"],
    ["Verbose Agent Chat", "详细智能体聊天"],
    ["Workspace Creation", "工作区创建"],
    ["Workspace Settings", "工作区设置"],
    ["Permanently delete", "永久删除"],
    ["Open in Side Panel", "在侧边面板中打开"],
    ["Copy Image Address", "复制图片地址"],
    ["Terminal Placement", "终端位置"],
    ["Remote Agents Data", "远程智能体数据"],
    ["Account connected.", "账号已连接。"],
    ["Loading plugins...", "正在加载插件..."],
    ["Configured servers", "已配置的服务器"],
    ["New Remote Project", "新建远程项目"],
    ["Capture Screenshot", "截取屏幕"],
    ["Stop Side Question", "停止副问题"],
    ["What should it do?", "它应该做什么？"],
    ["No events recorded", "没有事件记录"],
    ["Execution Identity", "执行身份"],
    ["File Diff Comments", "文件差异评论"],
    ["Write a comment...", "输入评论..."],
    ["Working Directory:", "工作目录："],
    ["Failed to continue", "继续操作失败"],
    ["Rendering playback", "正在渲染回放"],
    ["Playback available", "回放可用"],
    ["Terms and Privacy:", "条款与隐私："],
    ["Customize Sections", "自定义分区"],
    ["Click to view more", "点击查看更多"],
    ["Stream and control", "流式传输与控制"],
    ["Migrate with Agent", "使用智能体迁移"],
    ["Click to Open Docs", "点击打开文档"],
    ["e.g., chromium/src", "例如 chromium/src"],
    ["Enterprise Gateway", "企业网关"],
    ["Open settings menu", "打开设置菜单"],
    ["Copy email address", "复制电子邮件地址"],
    ["Configure Branches", "配置分支"],
    ["Available licenses", "可用许可证"],
    ["Signed-in accounts", "已登录的账号"],
    ["Open Browser Setup", "打开浏览器设置"],
    ["Conversation turns", "对话轮次"],
    ["Next side question", "下一个侧边问题"],
    ["Close skills panel", "关闭技能面板"],
    ["Open Fig Workspace", "打开 Fig 工作区"],
    ["Add to Chat/Quote", "添加到聊天/引用"],
    ["Advanced Settings", "高级设置"],
    ["Analyzed Task Log", "已分析任务日志"],
    ["Archive / Restore", "归档 / 恢复"],
    ["Automatic updates", "自动检查更新"],
    ["Automatic Updates", "自动检查更新"],
    ["Build With Google", "使用 Google 构建"],
    ["Cancel Generation", "取消生成"],
    ["Check for Updates", "检查更新"],
    ["Continue Response", "继续回复"],
    ["Copy Project Name", "复制项目名称"],
    ["Copy sign-in link", "复制登录链接"],
    ["Copy to clipboard", "复制到剪贴板"],
    ["Delete MCP Server", "删除 MCP 服务器"],
    ["Download Location", "下载位置"],
    ["Edit Custom Model", "编辑自定义模型"],
    ["Expected behavior", "预期行为"],
    ["Extension (Cider)", "扩展 (Cider)"],
    ["File Access Rules", "文件访问规则"],
    ["Fork Conversation", "创建分支对话"],
    ["Global Permission", "全局权限"],
    ["Local Permissions", "本地权限"],
    ["Move to New Group", "移至新分组"],
    ["Next Aux Pane Tab", "下一个辅助窗格标签页"],
    ["No agents running", "没有正在运行的代理"],
    ["No Model Selected", "未选择模型"],
    ["No projects found", "未找到项目"],
    ["Open Commit Graph", "打开提交历史图"],
    ["Open Conversation", "打开对话"],
    ["Open in Side Pane", "在侧边窗格中打开"],
    ["Permission preset", "权限预设"],
    ["Permission Preset", "权限预设"],
    ["Previous Pane Tab", "上一个面板标签页"],
    ["Previous question", "上一题"],
    ["Proceed with Plan", "按计划继续"],
    ["Record voice memo", "录制语音备忘"],
    ["Remove from Group", "从分组中移除"],
    ["Remove from Split", "从拆分视图中移除"],
    ["Remove From Split", "从拆分视图中移除"],
    ["Reopen Closed Tab", "重新打开已关闭的标签页"],
    ["Research anything", "研究与调研"],
    ["Select one of the", "选择以下"],
    ["Selection Actions", "选择操作"],
    ["Setup Jetski Chat", "配置 Jetski 聊天"],
    ["Sort Conversation", "排序对话"],
    ["Terminal Commands", "终端命令"],
    ["Toggle Side Panel", "切换侧边栏面板"],
    ["Copy Link Address", "复制链接地址"],
    ["Sign in required.", "需要登录。"],
    ["No sign-in needed", "无需登录"],
    ["Context Providers", "上下文提供程序"],
    ["Search connectors", "搜索连接器"],
    ["Managed by plugin", "由插件管理"],
    ["Conversation name", "对话名称"],
    ["Current workspace", "当前工作区"],
    ["Archive Workspace", "归档工作区"],
    ["No matching files", "没有匹配的文件"],
    ["New Side Question", "新建副问题"],
    ["Loading events...", "正在加载事件..."],
    ["Artifact Comments", "产物评论"],
    ["Browser downloads", "浏览器下载"],
    ["Failed to proceed", "无法继续"],
    ["Loading models...", "正在加载模型..."],
    ["Suggested plugin:", "推荐插件："],
    ["Read URL rejected", "读取 URL 的请求被拒绝"],
    ["No instances yet.", "暂无实例。"],
    ["Click to copy URL", "点击复制 URL"],
    ["Unmount workspace", "卸载工作区"],
    ["Remount workspace", "重新挂载工作区"],
    ["View Stacked Diff", "查看上下排列的差异"],
    ["Search Extensions", "搜索扩展"],
    ["2x playback speed", "2 倍播放速度"],
    ["Google Extensions", "Google 扩展"],
    ["This Conversation", "当前对话"],
    ["Add Custom Model", "添加自定义模型"],
    ["Auth and Billing", "身份验证与账单"],
    ["Background Tasks", "后台任务"],
    ["Best of N Models", "Best of N 模型"],
    ["Browser CDP Port", "浏览器 CDP 端口"],
    ["Built-in Browser", "内置浏览器"],
    ["External Browser", "外部浏览器"],
    ["Browsing History", "浏览历史记录"],
    ["Browser Subagent", "浏览器子智能体"],
    ["Cancel All Tasks", "取消全部任务"],
    ["Commit succeeded", "提交成功"],
    ["Create a Project", "创建项目"],
    ["Enable Demo Mode", "启用演示模式"],
    ["Enable Telemetry", "启用遥测"],
    ["Failed to Commit", "提交失败"],
    ["File Permissions", "文件权限"],
    ["General Feedback", "一般反馈"],
    ["Group By Project", "按项目分组"],
    ["in the top left.", "可搜索对话。"],
    ["Installed Skills", "已安装技能"],
    ["Keep In Menu Bar", "保留在菜单栏"],
    ["Mark All as Read", "全部标为已读"],
    ["Marketing Emails", "营销邮件"],
    ["New conversation", "新建对话"],
    ["New Conversation", "新建对话"],
    ["New Terminal Tab", "新建终端标签页"],
    ["No conversations", "暂无对话"],
    ["Open File Search", "打开文件搜索"],
    ["Open Preferences", "打开偏好设置"],
    ["Pin conversation", "固定对话"],
    ["Pin Conversation", "固定对话"],
    ["Project Detected", "检测到项目"],
    ["Project Settings", "项目设置"],
    ["Provide Feedback", "提供反馈"],
    ["Purchase Credits", "购买积分"],
    ["Replace With New", "替换为新对话"],
    ["Scroll to bottom", "滚动到底部"],
    ["Scroll to Bottom", "滚动到底部"],
    ["Search shortcuts", "搜索快捷键"],
    ["Send Immediately", "立即发送"],
    ["Sign-in required", "需要登录"],
    ["Start Voice mode", "启动语音模式"],
    ["Terms of Service", "服务条款"],
    ["to be installed.", "已安装。"],
    ["Toggle file diff", "切换文件差异视图"],
    ["Tool permissions", "工具权限"],
    ["Tool Permissions", "工具权限"],
    ["Update Available", "有可用更新"],
    ["Vetted (Preview)", "安全审核（预览）"],
    ["Interface Layout", "界面布局"],
    ["Remove from list", "从列表中移除"],
    ["Reset to Default", "恢复默认值"],
    ["Sign in required", "需要登录"],
    ["Loading hooks...", "正在加载钩子..."],
    ["See more results", "查看更多结果"],
    ["Select workspace", "选择工作区"],
    ["Nothing said yet", "还没有内容"],
    ["Conversation Log", "对话日志"],
    ["Screen Recording", "屏幕录制"],
    ["No instructions.", "没有指令。"],
    ["Admin escalation", "管理员提权"],
    ["Loading media...", "正在加载媒体..."],
    ["Close Other Tabs", "关闭其他标签页"],
    ["Document Answers", "文档答案"],
    ["New Agent Script", "新建智能体脚本"],
    ["Unknown Notebook", "未知笔记本"],
    ["Default (Mendel)", "默认（Mendel）"],
    ["Project Required", "需要项目"],
    ["License Required", "需要许可证"],
    ["Delete workspace", "删除工作区"],
    ["Go to Definition", "转到定义"],
    ["Copy description", "复制描述"],
    ["Copy schema JSON", "复制架构 JSON"],
    ["Confirm dismiss?", "确认关闭？"],
    ["Close Logs Modal", "关闭日志窗口"],
    ["Cancel recording", "取消录制"],
    ["Match whole word", "全字匹配"],
    ["Clone Repository", "克隆仓库"],
    ["Generate Project", "生成项目"],
    ["Reset Onboarding", "重置入门设置"],
    ["New CLs Uploaded", "已上传多个新的更改列表"],
    ["ABFS branch name", "ABFS 分支名称"],
    [", or copy link.", "，或复制链接。"],
    ["1 agent running", "1 个代理正在运行"],
    ["Actual behavior", "实际行为"],
    ["Actuation Rules", "操作规则"],
    ["Add MCP Servers", "添加 MCP 服务器"],
    ["Allowed Domains", "允许的域名"],
    ["Amend succeeded", "修改提交成功"],
    ["and select plan", "并选择 plan"],
    ["Archive project", "归档项目"],
    ["Autonomous Mode", "自主模式"],
    ["Background Task", "后台任务"],
    ["Code with Agent", "与智能体协作编码"],
    ["Command Palette", "命令面板"],
    ["Copy debug info", "复制调试信息"],
    ["Delete Terminal", "删除终端"],
    ["Developer Tools", "开发工具"],
    ["Display Options", "显示选项"],
    ["Editor Settings", "编辑器设置"],
    ["Failed to Amend", "修改提交失败"],
    ["Faster response", "响应速度更快"],
    ["Feature Request", "功能请求"],
    ["Five Hour Limit", "5 小时限额"],
    ["Fold code block", "折叠代码块"],
    ["For help, visit", "如需帮助，请访问"],
    ["GitHub Policies", "GitHub 策略"],
    ["global settings", "全局设置"],
    ["Go Back in Pane", "在窗格中后退"],
    ["Import success:", "导入成功："],
    ["Layout Controls", "布局控制"],
    ["Message history", "消息历史"],
    ["Missing Folders", "缺失文件夹"],
    ["No file changes", "无文件更改"],
    ["Open MCP Config", "打开 MCP 配置"],
    ["Package Outline", "包大纲"],
    ["Project deleted", "项目已删除"],
    ["Project Folders", "项目文件夹"],
    ["Project General", "项目常规"],
    ["Project options", "项目选项"],
    ["Queued Messages", "排队消息"],
    ["Quote Selection", "引用选中内容"],
    ["Remove Shortcut", "移除快捷键"],
    ["Scheduled Tasks", "定时任务"],
    ["Search files...", "搜索文件..."],
    ["Search Projects", "搜索项目"],
    ["Search tasks...", "搜索任务..."],
    ["Security Preset", "安全预设"],
    ["Thought Process", "思考过程"],
    ["to be installed", "已安装"],
    ["Toggle Terminal", "切换终端"],
    ["Tool Permission", "工具权限"],
    ["Open in New Tab", "在新标签页中打开"],
    ["Cancel download", "取消下载"],
    ["Paste auth code", "粘贴授权码"],
    ["Sign-in failed:", "登录失败："],
    ["Restart sign-in", "重新开始登录"],
    ["Action required", "需要操作"],
    ["Remove resource", "移除资源"],
    ["Unauthenticated", "未完成身份验证"],
    ["Loading apps...", "正在加载应用..."],
    ["Remote Projects", "远程项目"],
    ["Conversation ID", "对话 ID"],
    ["Select Worktree", "选择工作树"],
    ["Filter files...", "筛选文件..."],
    ["Find References", "查找引用"],
    ["Empty directory", "空目录"],
    ["Needs attention", "需要关注"],
    ["Change schedule", "更改计划"],
    ["Loading logs...", "正在加载日志..."],
    ["Browser actions", "浏览器操作"],
    ["Show in Sidebar", "在侧边栏中显示"],
    ["Remote branches", "远程分支"],
    ["Section header:", "章节标题："],
    ["Session Summary", "会话摘要"],
    ["Needs reconnect", "需要重新连接"],
    ["Match Case (Aa)", "区分大小写 (Aa)"],
    ["Start it again.", "重新启动它。"],
    ["Search branches", "搜索分支"],
    ["Text attachment", "文本附件"],
    ["List resources:", "列出资源："],
    ["Enable Overages", "启用超额用量"],
    ["Invite a Friend", "邀请好友"],
    ["Open in Preview", "在预览中打开"],
    ["Export Artifact", "导出产物"],
    ["View Split Diff", "查看并排的差异"],
    ["About embedding", "关于嵌入"],
    ["Plugin metadata", "插件元数据"],
    ["Edit task title", "编辑任务标题"],
    ["Remind me later", "稍后提醒我"],
    ["Create New Rule", "创建新规则"],
    ["New CL Uploaded", "已上传新的更改列表"],
    [", or copy link", "，或复制链接"],
    ["Add automation", "添加自动化"],
    ["Add MCP Server", "添加 MCP 服务器"],
    ["Added (Staged)", "已添加（已暂存）"],
    ["Agent Behavior", "智能体行为"],
    ["Agent response", "智能体回复"],
    ["Always Proceed", "始终继续"],
    ["Auto (Preview)", "自动（预览）"],
    ["Auto Execution", "自动执行"],
    ["Branch Changes", "分支更改"],
    ["Chief of Staff", "统筹助手"],
    ["Copy File Name", "复制文件名"],
    ["Copy File Path", "复制文件路径"],
    ["Create Project", "创建项目"],
    ["Customizations", "自定义"],
    ["Delete comment", "删除评论"],
    ["Delete Handler", "删除处理程序"],
    ["Delete Project", "删除项目"],
    ["Download files", "下载文件"],
    ["Failed to Push", "推送失败"],
    ["Go to Projects", "前往项目"],
    ["Import failed:", "导入失败："],
    ["Inherit Global", "继承全局设置"],
    ["Inline Actions", "内联操作"],
    ["inline comment", "行内批注"],
    ["Input required", "需要输入"],
    ["Local Checkout", "本地检出"],
    ["Mark as Unread", "标记为未读"],
    ["Merge Conflict", "合并冲突"],
    ["Missing Folder", "缺失文件夹"],
    ["Models & Usage", "模型与用量"],
    ["Modified Files", "已修改的文件"],
    ["Mute Voice Mic", "将语音麦克风静音"],
    ["No MCP Servers", "没有 MCP 服务器"],
    ["Not in Project", "未在项目中"],
    ["Open Launchpad", "打开启动台"],
    ["Open window...", "打开窗口..."],
    ["Open Workspace", "打开工作区"],
    ["Opened browser", "已打开浏览器"],
    ["Proceeded with", "已执行"],
    ["Project picker", "项目选择器"],
    ["Push succeeded", "推送成功"],
    ["Refresh skills", "刷新技能"],
    ["Remote Control", "远程控制"],
    ["Request Review", "请求审核"],
    ["Require Review", "需要审核"],
    ["Reset zoom (0)", "重置缩放 (0)"],
    ["Review Changes", "审核更改"],
    ["Select Project", "选择项目"],
    ["Setup required", "需要配置"],
    ["Show in folder", "在文件夹中显示"],
    ["Skills & Rules", "技能与规则"],
    ["Split Terminal", "拆分终端"],
    ["Staged Changes", "已暂存的更改"],
    ["Stop execution", "停止执行"],
    ["System default", "系统默认"],
    ["Toggle Sidebar", "切换侧边栏"],
    ["Typeahead menu", "自动补全菜单"],
    ["Unstage change", "取消暂存更改"],
    ["View Changelog", "查看更新日志"],
    ["Back to safety", "返回安全页面"],
    ["Previous match", "上一个匹配项"],
    ["Not configured", "未配置"],
    ["Go to Accounts", "前往账号"],
    ["All Workspaces", "所有工作区"],
    ["Filter rows...", "筛选行..."],
    ["File not found", "未找到文件"],
    ["Side Questions", "副问题"],
    ["Subagent ended", "子智能体已结束"],
    ["Stop Recording", "停止录制"],
    ["Task not found", "未找到任务"],
    ["Submit comment", "提交评论"],
    ["Tool arguments", "工具参数"],
    ["Open allowlist", "打开允许列表"],
    ["Connect GitHub", "连接 GitHub"],
    ["Issue creation", "创建问题"],
    ["Select License", "选择许可证"],
    ["Invalid embed:", "无效的嵌入内容："],
    ["Error Details:", "错误详情："],
    ["Trajectory ID:", "执行轨迹 ID："],
    ["Sign in needed", "需要登录"],
    ["Close (Escape)", "关闭 (Escape)"],
    ["Proceed Anyway", "仍然继续"],
    ["Create a token", "创建令牌"],
    ["Read resource:", "读取资源："],
    ["Files to edit:", "要编辑的文件："],
    ["Run visibility", "运行记录可见性"],
    ["Knowledge Work", "知识工作"],
    ["Manage License", "管理许可证"],
    ["Signing Out...", "正在退出登录..."],
    ["Command Center", "命令中心"],
    ["Collapse Diffs", "折叠差异"],
    ["Close Settings", "关闭设置"],
    ["Delete command", "删除命令"],
    ["Plugin details", "插件详情"],
    ["Model URL info", "模型 URL 信息"],
    ["Context window", "上下文窗口"],
    ["Search results", "搜索结果"],
    ["GoB Repository", "GoB 仓库"],
    ["Workspace Name", "工作区名称"],
    ["Access grants", "访问授权"],
    ["Agent Decides", "由智能体决定"],
    ["Agent options", "智能体选项"],
    ["All tools (*)", "所有工具 (*)"],
    ["Allow options", "允许选项"],
    ["Archived Only", "仅显示已归档"],
    ["Back to Agent", "返回智能体"],
    ["Chat Settings", "聊天设置"],
    ["CitC Settings", "CitC 设置"],
    ["Context Menus", "上下文菜单"],
    ["Conversations", "对话"],
    ["Custom Agents", "自定义智能体"],
    ["Customization", "自定义项"],
    ["Debug and fix", "调试与修复"],
    ["Default Light", "默认浅色"],
    ["Delete plugin", "删除插件"],
    ["Edit Shortcut", "编辑快捷键"],
    ["Enter to Send", "按 Enter 发送"],
    ["Every weekday", "每个工作日"],
    ["Feedback Type", "反馈类型"],
    ["File explorer", "文件浏览器"],
    ["Files Changed", "已更改的文件"],
    ["Gemini Models", "Gemini 模型"],
    ["Give Feedback", "提供反馈"],
    ["Good response", "好评"],
    ["Inherits from", "继承自"],
    ["Inline Widget", "内联组件"],
    ["Invalid Media", "无效的媒体文件"],
    ["Link Settings", "链接设置"],
    ["Manage Skills", "管理技能"],
    ["Maximize Pane", "最大化窗格"],
    ["Message input", "消息输入框"],
    ["Model Credits", "模型积分"],
    ["Move to Group", "移至分组"],
    ["New Workspace", "新建工作区"],
    ["Next Pane Tab", "下一个面板标签页"],
    ["Next question", "下一题"],
    ["Notifications", "通知"],
    ["Open in Cider", "在 Cider 中打开"],
    ["Open Links In", "打开链接的方式"],
    ["Open Settings", "打开设置"],
    ["Open Terminal", "打开终端"],
    ["Page contents", "页面内容"],
    ["Prevent Sleep", "阻止计算机睡眠"],
    ["Project Agent", "项目智能体"],
    ["Reload Window", "重新加载窗口"],
    ["Review Policy", "审核策略"],
    ["Select branch", "选择分支"],
    ["Send Feedback", "发送反馈"],
    ["Stop Subagent", "停止子智能体"],
    ["Tab to Import", "按下 Tab 导入"],
    ["Table options", "表格选项"],
    ["This Computer", "此电脑"],
    ["Toggle Editor", "切换编辑器"],
    ["UI Extensions", "界面扩展"],
    ["Previous Page", "上一页"],
    ["Accessibility", "无障碍"],
    ["United States", "美国"],
    ["Pay As You Go", "按量付费"],
    ["Not Signed In", "未登录"],
    ["Sign in again", "重新登录"],
    ["Needs re-auth", "需要重新验证"],
    ["Not connected", "未连接"],
    ["Add Hook Card", "添加钩子卡片"],
    ["New hook name", "新钩子名称"],
    ["Active Skills", "已启用的技能"],
    ["Runs remotely", "远程运行"],
    ["Download File", "下载文件"],
    ["Side Question", "副问题"],
    ["Not scheduled", "未安排"],
    ["On a schedule", "按计划"],
    ["Recent Events", "最近事件"],
    ["Export as PDF", "导出为 PDF"],
    ["File Comments", "文件评论"],
    ["Kill Terminal", "终止终端"],
    ["Render failed", "渲染失败"],
    ["Unknown error", "未知错误"],
    ["Pull Requests", "拉取请求"],
    ["Workflow runs", "工作流运行"],
    ["Choose Region", "选择区域"],
    ["Other License", "其他许可证"],
    ["Still running", "仍在运行"],
    ["Press keys...", "请按下快捷键..."],
    ["Not available", "不可用"],
    ["Image Answers", "图片答案"],
    ["Cleared Count", "已清除数量"],
    ["Only Archived", "仅已归档"],
    ["Context usage", "上下文使用量"],
    ["CEL Reference", "CEL 参考"],
    ["Organizations", "组织"],
    ["Target Tools:", "目标工具："],
    ["Host Endpoint", "主机端点"],
    ["documentation", "文档"],
    ["Dismiss error", "关闭错误提示"],
    ["Copy thinking", "复制思考内容"],
    ["Billing model", "计费模式"],
    ["Create plugin", "创建插件"],
    ["Sidecar error", "Sidecar 错误"],
    ["Media actions", "媒体操作"],
    ["View comments", "查看评论"],
    ["Close Sidebar", "关闭侧边栏"],
    ["Refresh rules", "刷新规则"],
    ["New Fig Share", "新建 Fig 共享"],
    ["Add Shortcut", "添加快捷键"],
    ["AI Shortcuts", "AI 快捷方式"],
    ["Always Allow", "始终允许"],
    ["App Settings", "应用设置"],
    ["Bad response", "差评"],
    ["Browser Task", "浏览器任务"],
    ["Chime volume", "提示音音量"],
    ["Close Folder", "关闭文件夹"],
    ["Confirm Quit", "确认退出"],
    ["Confirm Undo", "确认撤销"],
    ["Conversation", "对话"],
    ["Copy Command", "复制命令"],
    ["Copy Content", "复制内容"],
    ["Custom Order", "自定义顺序"],
    ["Default Dark", "默认深色"],
    ["Delete Skill", "删除技能"],
    ["Disable Task", "禁用任务"],
    ["Edit comment", "编辑评论"],
    ["Execute URLs", "允许操作的网址"],
    ["Find in Pane", "在面板中查找"],
    ["Full machine", "整机访问模式"],
    ["Full Machine", "整机访问模式"],
    ["Instructions", "指令"],
    ["Last Updated", "最近更新"],
    ["Manage Hooks", "管理钩子"],
    ["Mark as Read", "标记为已读"],
    ["More actions", "更多操作"],
    ["More options", "更多选项"],
    ["More Plugins", "更多插件"],
    ["Multi-select", "多选"],
    ["New Worktree", "新建工作树"],
    ["No subagents", "无子智能体"],
    ["Open Preview", "打开预览"],
    ["or copy link", "或复制链接"],
    ["Overview tab", "概览标签页"],
    ["Recent Files", "最近文件"],
    ["Record Audio", "录制音频"],
    ["Rename Group", "重命名分组"],
    ["Restart Task", "重启任务"],
    ["Select Model", "选择模型"],
    ["Send message", "发送消息"],
    ["Show details", "显示详情"],
    ["Stage change", "暂存更改"],
    ["Terminal tab", "终端标签页"],
    ["Toggle Agent", "切换智能体"],
    ["Undo To Here", "撤销到此处"],
    ["User message", "用户消息"],
    ["Voice volume", "语音音量"],
    ["Weekly Limit", "周额度"],
    ["Zoom out (-)", "缩小 (-)"],
    ["Clear Search", "清除搜索"],
    ["Download PDF", "下载 PDF"],
    ["Subscription", "订阅"],
    ["Stop Editing", "停止编辑"],
    ["Authenticate", "身份验证"],
    ["Upload Files", "上传文件"],
    ["Browse rules", "浏览规则"],
    ["Replace with", "替换为"],
    ["Project Name", "项目名称"],
    ["Copy Message", "复制消息"],
    ["Mention Page", "提及页面"],
    ["Switch Roles", "切换角色"],
    ["Change model", "更改模型"],
    ["Repeat every", "重复间隔"],
    ["No documents", "没有文档"],
    ["New Terminal", "新建终端"],
    ["Add Terminal", "添加终端"],
    ["Denied Sites", "已拒绝的网站"],
    ["Path copied!", "路径已复制！"],
    ["Drag to move", "拖动以移动"],
    ["Access rules", "访问规则"],
    ["Accounts tab", "账号标签页"],
    ["Sent Message", "已发送消息"],
    ["Use Existing", "使用现有项"],
    ["Repositories", "代码仓库"],
    ["Fork warning", "派生警告"],
    ["Bottom Panel", "底部面板"],
    ["Voice engine", "语音引擎"],
    ["Tab Settings", "标签页设置"],
    ["See Activity", "查看活动记录"],
    ["Collapse All", "全部折叠"],
    ["Expand Diffs", "展开差异"],
    ["Viewing Diff", "正在查看差异"],
    ["Fuzzy search", "模糊搜索"],
    ["Search flags", "搜索标志"],
    ["Remove audio", "移除音频"],
    ["Back to home", "返回首页"],
    ["Select Agent", "选择智能体"],
    ["Clear filter", "清除筛选条件"],
    ["Show More...", "显示更多..."],
    ["Yes, install", "是，安装"],
    ["Report Issue", "报告问题"],
    ["Branch / Ref", "分支 / 引用"],
    ["Limited time", "限时提供"],
    ["Accept Step", "接受此步骤"],
    ["Add context", "添加上下文"],
    ["Add Handler", "添加处理程序"],
    ["Add to Chat", "添加到对话"],
    ["Agent Edits", "智能体编辑"],
    ["App version", "应用版本"],
    ["Application", "应用"],
    ["Automations", "自动化"],
    ["breadcrumbs", "路径导航"],
    ["Cancel step", "取消此步骤"],
    ["Cancel Task", "取消任务"],
    ["Chat Layout", "聊天布局"],
    ["Code Search", "代码搜索"],
    ["Copy prompt", "复制提示词"],
    ["Custom View", "自定义视图"],
    ["Danger Zone", "危险操作"],
    ["Decorations", "标记"],
    ["Delete Hook", "删除钩子"],
    ["Delete Task", "删除任务"],
    ["Description", "描述"],
    ["Device Name", "设备名称"],
    ["Enable Task", "启用任务"],
    ["Environment", "环境"],
    ["File Access", "文件访问"],
    ["File Picker", "文件选择器"],
    ["File Viewer", "文件查看器"],
    ["File Writes", "文件写入"],
    ["Focus Input", "聚焦输入框"],
    ["Full access", "完整访问权限"],
    ["Get Started", "开始使用"],
    ["In Progress", "进行中"],
    ["Jetski Chat", "Jetski 聊天"],
    ["Last 7 days", "最近 7 天"],
    ["Last Prompt", "上次提示词"],
    ["Light Theme", "浅色主题"],
    ["Marketplace", "插件市场"],
    ["MCP Servers", "MCP 服务器"],
    ["Model Quota", "模型额度"],
    ["Modified in", "已在"],
    ["New Project", "新建项目"],
    ["No Subtitle", "无副标题"],
    ["Only Unread", "仅显示未读"],
    ["Open Folder", "打开文件夹"],
    ["or join the", "或加入"],
    ["Permissions", "权限"],
    ["Quick Start", "快速开始"],
    ["Recommended", "推荐"],
    ["Reject Step", "拒绝此步骤"],
    ["Setting up…", "正在配置…"],
    ["Split Right", "向右拆分"],
    ["Strict Mode", "严格模式"],
    ["Suggestions", "建议"],
    ["Tab to Jump", "按下 Tab 跳转"],
    ["Thinking...", "思考中..."],
    ["Token Usage", "Token 使用量"],
    ["Unavailable", "不可用"],
    ["Write Files", "写入文件"],
    ["Zoom in (+)", "放大 (+)"],
    ["Open in Tab", "在标签页中打开"],
    ["Close (Esc)", "关闭 (Esc)"],
    ["Web Preview", "网页预览"],
    ["Valid until", "有效期至"],
    ["Open Search", "打开搜索"],
    ["Connections", "连接"],
    ["Log back in", "重新登录"],
    ["Empty table", "空表"],
    ["Voice speed", "语速"],
    ["Open in Hub", "在主窗口中打开"],
    ["No runs yet", "尚无运行记录"],
    ["Tool Output", "工具输出"],
    ["Close Panel", "关闭面板"],
    ["Read access", "读取权限"],
    ["Uncommitted", "未提交"],
    ["Project ID:", "项目 ID："],
    ["Get API key", "获取 API 密钥"],
    ["Page title:", "页面标题："],
    ["User Intent", "用户意图"],
    ["Remote only", "仅远程"],
    ["Definition:", "定义："],
    ["Copy output", "复制输出"],
    ["Address bar", "地址栏"],
    ["Dismiss Tip", "关闭提示"],
    ["Start voice", "开始语音"],
    ["No branches", "没有分支"],
    ["No shortcut", "无快捷键"],
    ["+ Add Hook", "+ 添加钩子"],
    ["Add Folder", "添加文件夹"],
    ["Allow once", "允许一次"],
    ["Always Ask", "始终询问"],
    ["and select", "并选择"],
    ["Appearance", "外观"],
    ["Automation", "自动化"],
    ["Avatar URL", "头像 URL"],
    ["Background", "背景色"],
    ["Bug Report", "错误报告"],
    ["chat space", "聊天群组"],
    ["CitC Clone", "CitC 克隆"],
    ["Compacting", "正在压缩上下文"],
    ["Copy Image", "复制图片"],
    ["Copy value", "复制值"],
    ["Dark Theme", "深色主题"],
    ["Date Added", "添加日期"],
    ["Deprecated", "已弃用"],
    ["Edit Model", "编辑模型"],
    ["Voice mode", "语音模式"],
    ["Microphone", "麦克风"],
    ["Loading...", "正在加载..."],
    ["Yes, allow", "是，允许"],
    ["UI Actions", "界面操作"],
    ["Models Tab", "模型标签页"],
    ["Setting up", "正在配置"],
    ["View Usage", "查看用量"],
    ["View plans", "查看套餐"],
    ["Legal Help", "法律帮助"],
    ["Select All", "全选"],
    ["New Window", "新建窗口"],
    ["Split Down", "向下拆分"],
    ["Review tab", "审核标签页"],
    ["Permission", "权限"],
    ["File Reads", "文件读取"],
    ["Foreground", "前景色"],
    ["Go Forward", "前进"],
    ["Learn more", "了解更多"],
    ["Navigation", "导航"],
    ["No Project", "无项目"],
    ["Quick Open", "快速打开"],
    ["Read Files", "读取文件"],
    ["Reset Zoom", "重置缩放"],
    ["Tab Import", "按下 Tab 导入"],
    ["Turbo mode", "极速模式"],
    ["View Debug", "查看调试信息"],
    ["Working...", "正在工作..."],
    ["Workspaces", "工作区"],
    ["Your Plan:", "您的套餐："],
    ["Every hour", "每小时"],
    ["Every week", "每周"],
    ["Full Error", "完整错误信息"],
    ["Thumbnails", "缩略图"],
    ["Next match", "下一个匹配项"],
    ["Chat Input", "聊天输入"],
    ["Recordings", "录音"],
    ["Disconnect", "断开连接"],
    ["Repository", "代码仓库"],
    ["Connectors", "连接器"],
    ["Group name", "分组名称"],
    ["Send reply", "发送回复"],
    ["Switch mic", "切换麦克风"],
    ["No uploads", "没有上传内容"],
    ["No results", "没有结果"],
    ["Image URL:", "图片 URL："],
    ["Local only", "仅本地"],
    ["WIF Config", "WIF 配置"],
    ["Create New", "新建"],
    ["Conditions", "条件"],
    ["To update:", "更新方法："],
    ["Side Panel", "侧边面板"],
    ["Settings -", "设置 -"],
    ["Expand All", "全部展开"],
    ["Go to Test", "转到测试"],
    ["First page", "第一页"],
    ["Reload app", "重新加载应用"],
    ["Match case", "区分大小写"],
    ["Extensions", "扩展"],
    ["Actuation", "操作"],
    ["Add Model", "添加模型"],
    ["Artifacts", "产物列表"],
    ["Automatic", "自动"],
    ["Close Tab", "关闭标签页"],
    ["Completed", "已完成"],
    ["Configure", "配置"],
    ["copy link", "复制链接"],
    ["Copy path", "复制路径"],
    ["Customize", "自定义"],
    ["Developer", "开发者"],
    ["Every day", "每天"],
    ["Execution", "执行"],
    ["Full Logs", "完整日志"],
    ["How often", "重复频率"],
    ["Installed", "已安装"],
    ["Knowledge", "知识库"],
    ["Launchpad", "启动台"],
    ["MCP Tools", "MCP 工具"],
    ["New Group", "新建分组"],
    ["Read URLs", "读取 URL"],
    ["regrouped", "重新分组"],
    ["Remaining", "剩余"],
    ["Sandboxed", "沙盒化"],
    ["Scheduled", "定时运行"],
    ["Searching", "正在搜索"],
    ["See Plans", "查看套餐"],
    ["Selection", "选择"],
    ["Shortcuts", "快捷键"],
    ["Subagents", "子智能体"],
    ["Subtitles", "副标题"],
    ["Tab Speed", "Tab 补全速度"],
    ["Terminals", "终端"],
    ["Try Again", "重试"],
    ["View Diff", "查看差异"],
    ["View Logs", "查看日志"],
    ["Workflows", "工作流"],
    ["Workspace", "工作区"],
    ["Downloads", "下载列表"],
    ["Not Found", "未找到"],
    ["Issued to", "颁发给"],
    ["Issued by", "颁发者"],
    ["Next Page", "下一页"],
    ["Connected", "已连接"],
    ["Untracked", "未跟踪"],
    ["Open File", "打开文件"],
    ["Task Logs", "任务日志"],
    ["Triggered", "已触发"],
    ["Empty log", "空日志"],
    ["Documents", "文档"],
    ["Open Diff", "打开差异"],
    ["Keep Open", "保持打开"],
    ["Full View", "完整视图"],
    ["Open link", "打开链接"],
    ["Location:", "位置："],
    ["Used for:", "用于："],
    ["Alt text:", "替代文本："],
    ["Error ID:", "错误 ID："],
    ["Agent ID:", "智能体 ID："],
    ["Step Type", "步骤类型"],
    ["Last Used", "上次使用"],
    ["Valid CEL", "有效的 CEL"],
    ["View Page", "查看页面"],
    ["Your Plan", "你的套餐"],
    ["Resources", "资源"],
    ["Show Less", "收起"],
    ["Last page", "最后一页"],
    ["End voice", "结束语音"],
    ["More info", "更多信息"],
    ["Changelog", "更新日志"],
    ["[MODIFY]", "[修改]"],
    ["Advanced", "高级"],
    ["Archived", "已归档"],
    ["Bot Name", "机器人名称"],
    ["Built In", "内置"],
    ["Business", "商务"],
    ["Commands", "命令"],
    ["Comments", "评论"],
    ["Continue", "继续"],
    ["Contrast", "对比度"],
    ["Disabled", "已禁用"],
    ["Download", "下载"],
    ["Explored", "已探索"],
    ["Featured", "精选"],
    ["Feedback", "反馈"],
    ["Group By", "分组方式"],
    ["Maximize", "最大化"],
    ["Mentions", "提及"],
    ["Minimize", "最小化"],
    ["Modified", "已修改"],
    ["Nickname", "昵称"],
    ["Open App", "打开应用"],
    ["Open IDE", "打开 IDE"],
    ["Open URL", "打开 URL"],
    ["Overview", "概览"],
    ["Planning", "规划"],
    ["Previous", "上一步"],
    ["Projects", "项目"],
    ["Searched", "已搜索"],
    ["searches", "搜索"],
    ["See less", "收起"],
    ["See more", "查看更多"],
    ["Settings", "设置"],
    ["Show all", "显示全部"],
    ["Sign Out", "退出登录"],
    ["Starting", "正在启动"],
    ["Terminal", "终端"],
    ["Thinking", "思考中"],
    ["tokens (", "Token ("],
    ["Untitled", "未命名"],
    ["Validate", "验证"],
    ["Worktree", "工作树"],
    ["Zoom Out", "缩小"],
    ["Security", "安全"],
    ["Fit Mode", "适应模式"],
    ["Accounts", "账号"],
    ["Send Now", "立即发送"],
    ["Schedule", "计划"],
    ["Next run", "下次运行"],
    ["Last run", "上次运行"],
    ["All runs", "所有运行记录"],
    ["Artifact", "产物"],
    ["License:", "许可证："],
    ["Protocol", "协议"],
    ["Excluded", "已排除"],
    ["Timeout:", "超时："],
    ["Command:", "命令："],
    ["Matcher:", "匹配条件："],
    ["Domains:", "域名："],
    ["Details:", "详情："],
    ["Payload:", "数据："],
    ["Auto Pin", "自动固定"],
    ["No links", "没有链接"],
    ["Optional", "可选"],
    ["Voice on", "语音已开启"],
    ["Account", "账户"],
    ["Actions", "操作"],
    ["Add MCP", "添加 MCP"],
    ["Archive", "归档"],
    ["Blocked", "已阻止"],
    ["Browser", "浏览器"],
    ["Change…", "更改…"],
    ["Confirm", "确认"],
    ["Connect", "连接"],
    ["Context", "上下文"],
    ["Decline", "拒绝"],
    ["Default", "默认"],
    ["Deleted", "已删除"],
    ["Discard", "放弃"],
    ["Dismiss", "忽略"],
    ["Display", "显示"],
    ["Enabled", "已启用"],
    ["Folders", "文件夹"],
    ["General", "常规"],
    ["Go Back", "后退"],
    ["History", "历史"],
    ["Install", "安装"],
    ["Loading", "正在加载"],
    ["New Tab", "新建标签页"],
    ["Not set", "未设置"],
    ["Pending", "等待中"],
    ["Plugin:", "插件："],
    ["Plugins", "插件"],
    ["Preview", "预览"],
    ["Proceed", "继续"],
    ["Profile", "配置文件"],
    ["Project", "项目"],
    ["Refresh", "刷新"],
    ["Release", "松开"],
    ["Renamed", "已重命名"],
    ["Restore", "恢复"],
    ["Running", "运行中"],
    ["Science", "科学"],
    ["Sidebar", "侧边栏"],
    ["Skipped", "已跳过"],
    ["Sort By", "排序方式"],
    ["Sources", "来源"],
    ["Stopped", "已停止"],
    ["Trigger", "触发条件"],
    ["Updater", "更新程序"],
    ["Upgrade", "升级"],
    ["Verbose", "详细"],
    ["Version", "版本"],
    ["Working", "正在工作"],
    ["Zoom In", "放大"],
    ["Forward", "前进"],
    ["Members", "成员"],
    ["Options", "选项"],
    ["Website", "网站"],
    ["Bundles", "插件包"],
    ["Runs as", "运行身份"],
    ["Uploads", "上传内容"],
    ["Scopes:", "权限范围："],
    ["Add All", "全部添加"],
    ["Offline", "离线"],
    ["Helpers", "辅助函数"],
    ["Machine", "计算机"],
    ["Details", "详情"],
    ["Sign In", "登录"],
    ["Changes", "更改"],
    ["Suggest", "建议"],
    ["Accent", "强调色"],
    ["Accept", "接受"],
    ["Agents", "智能体"],
    ["Cancel", "取消"],
    ["Change", "更改"],
    ["Commit", "提交"],
    ["Copied", "已复制"],
    ["Create", "创建"],
    ["Custom", "自定义"],
    ["Delete", "删除"],
    ["Edited", "已编辑"],
    ["Editor", "编辑器"],
    ["Errors", "错误"],
    ["Export", "导出"],
    ["Filter", "筛选"],
    ["Folder", "文件夹"],
    ["Global", "全局"],
    ["Inline", "内联"],
    ["Log in", "登录"],
    ["Manage", "管理"],
    ["Medium", "中"],
    ["Models", "模型"],
    ["Narrow", "窄"],
    ["Notice", "提示"],
    ["Output", "输出"],
    ["Picker", "选择器"],
    ["Pinned", "已固定"],
    ["Preset", "预设"],
    ["Prompt", "提示词"],
    ["Recent", "最近使用"],
    ["Reject", "拒绝"],
    ["Reload", "重新加载"],
    ["Remote", "远程"],
    ["Remove", "移除"],
    ["Rename", "重命名"],
    ["Review", "审核"],
    ["Search", "搜索"],
    ["Skills", "技能"],
    ["Snooze", "稍后提醒"],
    ["Source", "来源"],
    ["Status", "状态"],
    ["Strict", "严格"],
    ["Strong", "严格"],
    ["Submit", "提交"],
    ["System", "系统"],
    ["Value:", "当前值："],
    ["Viewer", "查看器"],
    ["Volume", "音量"],
    ["Window", "窗口"],
    ["Branch", "分支"],
    ["Author", "作者"],
    ["Europe", "欧洲"],
    ["Themes", "主题"],
    ["Hourly", "每小时"],
    ["Weekly", "每周"],
    ["Events", "事件"],
    ["Title:", "标题："],
    ["Issues", "问题"],
    ["Got it", "知道了"],
    ["Online", "在线"],
    ["Uptime", "运行时长"],
    ["Set up", "设置"],
    ["Fields", "字段"],
    ["Target", "目标"],
    ["Saved!", "已保存！"],
    ["After", "分组后"],
    ["Agent", "智能体"],
    ["Allow", "允许"],
    ["Amend", "修改提交"],
    ["Apply", "应用"],
    ["Block", "阻止"],
    ["Clear", "清除"],
    ["Close", "关闭"],
    ["Email", "邮箱"],
    ["Error", "错误"],
    ["files", "文件"],
    ["Go to", "转到"],
    ["Hooks", "钩子"],
    ["Light", "浅色"],
    ["Local", "本地"],
    ["Media", "媒体"],
    ["menu)", "菜单)"],
    ["Model", "模型"],
    ["Queue", "排队"],
    ["Quota", "额度"],
    ["Quote", "引用"],
    ["Ready", "就绪"],
    ["Reset", "重置"],
    ["Retry", "重试"],
    ["Rules", "规则"],
    ["Setup", "配置"],
    ["Sound", "声音"],
    ["Start", "开始"],
    ["Theme", "主题"],
    ["Turbo", "极速"],
    ["Usage", "用量"],
    ["Visit", "访问"],
    ["Voice", "语音"],
    ["Owner", "所有者"],
    ["Paste", "粘贴"],
    ["Daily", "每天"],
    ["Scope", "范围"],
    ["Goals", "目标"],
    ["Links", "链接"],
    ["Where", "位置"],
    ["Unpin", "取消固定"],
    ["Cloud", "云端"],
    ["Debug", "调试"],
    [", or", "，或"],
    ["Auto", "自动"],
    ["Back", "返回"],
    ["Chat", "对话"],
    ["Copy", "复制"],
    ["Dark", "深色"],
    ["Deny", "拒绝"],
    ["Done", "完成"],
    ["Edit", "编辑"],
    ["Fast", "快"],
    ["File", "文件"],
    ["Fill", "铺满"],
    ["Font", "字体"],
    ["Help", "帮助"],
    ["High", "高"],
    ["Hold", "按住"],
    ["Idle", "空闲"],
    ["Labs", "实验室"],
    ["Logs", "日志"],
    ["More", "更多"],
    ["Name", "名称"],
    ["Next", "下一步"],
    ["None", "无"],
    ["Open", "打开"],
    ["Pane", "窗格"],
    ["Plan", "套餐"],
    ["Push", "推送"],
    ["Quit", "退出"],
    ["Read", "读取"],
    ["Skip", "跳过"],
    ["Slow", "慢"],
    ["Stop", "停止"],
    ["Time", "时间"],
    ["Tool", "工具"],
    ["Type", "类型"],
    ["Undo", "撤销"],
    ["View", "查看"],
    ["Wide", "宽"],
    ["Seek", "跳转进度"],
    ["Save", "保存"],
    ["Task", "任务"],
    ["When", "时间"],
    ["Docs", "文档"],
    ["Fork", "派生"],
    ["Zoom", "缩放"],
    ["Find", "查找"],
    ["Add", "添加"],
    ["App", "应用"],
    ["Low", "低"],
    ["New", "新建"],
    ["now", "刚刚"],
    ["Now", "当前"],
    ["Off", "关闭"],
    ["Pin", "固定"],
    ["Ran", "已运行"],
    ["Run", "运行"],
    ["Use", "使用"],
    ["Cut", "剪切"],
    ["at", "于"],
    ["No", "否"],
    ["On", "开启"],
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

  // 仅格式化已确认模板中完整的日期字段，不改写路径、名称等用户数据。
  const englishMonths = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const englishDateRegex = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/;
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

    // 只翻译示例前缀，保留多行占位符中的 Shell 命令。
    [/^(\s*)example:(\r?\n)source ~\/\.jetski_shell_setup(\s*)$/i, (_m, before, newline, after) => `${before}示例：${newline}source ~/.jetski_shell_setup${after}`],

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

    // 模型可用性与公告提示（模型名原样保留，只格式化完整的日期字段）
    [/^([\w .-]+?) is now available on paid Pro and Ultra plans\. Third-party model access will no longer be available on your current plan starting on (.+?)\.$/gi, (_m, model, date) => `${model} 已面向付费 Pro 与 Ultra 套餐开放。自 ${localizeEnglishDates(date)} 起，您当前使用的套餐将不再提供第三方模型访问。`],
    [/^([\w .-]+?) is currently available to Ultra and paid Pro plan subscribers\.$/gi, (_m, model) => `${model} 目前仅向 Ultra 及付费 Pro 套餐订阅用户开放。`],
    [/^GPT-OSS will be removed from Antigravity on (.+?)\.$/gi, (_m, date) => `GPT-OSS 将于 ${localizeEnglishDates(date)} 从 Antigravity 中移除。`],
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
      const custom = customTranslations.get(whole.toLowerCase());
      if (custom !== undefined) return custom ? value.replace(whole, () => custom) : value;
    }
    if (englishLabels && englishLabelsPreset.has(value.trim().toLowerCase())) return value;
    // 项目名称属于数据；完整删除模板须先于通用词条处理。
    // 观察器重处理译文时，也不能改写名称中的英文。
    if (/^永久删除项目“[\s\S]*”及其中的 \d+ 个活跃对话。$/.test(value.trim())) return value;
    const deletion = value.trim().match(/^Permanently delete ([\s\S]+) including (\d+) active conversations?\.$/);
    if (deletion) return value.replace(value.trim(), () => `永久删除项目“${deletion[1]}”及其中的 ${deletion[2]} 个活跃对话。`);
    const permission = translatePermission(value);
    if (permission !== null) return permission;
    const trimmed = value.trim();

    // 文件夹路径和产品名称是变量，先处理已确认的完整控件模板。
    if (/^(?:无法定位文件夹：[\s\S]*|请在 .+ 面板中登录。|登录后即可使用 .+！)$/.test(trimmed)) return value;
    const folderFailure = trimmed.match(/^Failed to resolve folder: ([\s\S]+)$/);
    if (folderFailure) return value.replace(trimmed, () => '无法定位文件夹：' + folderFailure[1]);
    const panelSignIn = trimmed.match(/^Sign in from the ([^\r\n]{1,100}) panel\.$/);
    if (panelSignIn) return value.replace(trimmed, () => `请在 ${panelSignIn[1]} 面板中登录。`);
    const productSignIn = trimmed.match(/^Sign in to use ([^\r\n]{1,100})!$/);
    if (productSignIn) return value.replace(trimmed, () => `登录后即可使用 ${productSignIn[1]}！`);

    // 项目摘要中的数量由应用生成；只匹配已确认的完整模板。
    const conversationCounts = trimmed.match(/^(\d+) (active|archived) conversations?(?: and (\d+) archived conversations?)?$/);
    if (conversationCounts && !(conversationCounts[2] === 'archived' && conversationCounts[3])) {
      let result = `${conversationCounts[1]} 个${conversationCounts[2] === 'active' ? '活跃' : '已归档'}对话`;
      if (conversationCounts[3]) result += `和 ${conversationCounts[3]} 个已归档对话`;
      return value.replace(trimmed, () => result);
    }

    // 排队消息的悬浮提示由运行时快捷键和说明组成，按键本身必须保留。
    const deliveryShortcut = trimmed.match(/^(Enter|Alt\+Enter|⏎|⌥⏎) (Queues after the turn|Sends immediately)$/);
    if (deliveryShortcut) {
      const description = deliveryShortcut[2] === 'Queues after the turn' ? '当前轮次结束后排队发送' : '立即发送';
      return value.replace(trimmed, () => `${deliveryShortcut[1]} ${description}`);
    }
    const emptyPromptShortcut = trimmed.match(/^(Alt\+Enter|⌥⏎) On empty prompt, sends next in queue$/);
    if (emptyPromptShortcut) {
      return value.replace(trimmed, () => `${emptyPromptShortcut[1]} 提示词为空时发送队列中的下一条消息`);
    }

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
      // 删除按钮文案不能作为子串处理，否则会改写无法识别的项目删除提示。
      if (source.length > 15 && source !== 'Permanently delete') {
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

    return next;
  }

  // 仅用于应用生成的 aria-label 模板。名称、路径、URL 和账号均原样保留，
  // 并在命中后立即返回，避免通用短语或数量规则再次改写变量。
  const dynamicAriaLabels = [
    [/^Playback speed (\d+(?:\.\d+)?)x$/, (_m, n) => `播放速度：${n}x`, '播放速度：'],
    [/^Zoom (\d+(?:\.\d+)?)%, reset to fit$/, (_m, n) => `缩放：${n}%，重置为适应窗口`, '缩放：'],
    [/^Open ([\s\S]+) skill$/, (_m, name) => `打开技能：${name}`, '打开技能：'],
    [/^([\s\S]+)\. View site information$/, (_m, site) => `查看网站信息：${site}`, '查看网站信息：'],
    [/^([\s\S]+) download progress$/, (_m, name) => `下载进度：${name}`, '下载进度：'],
    [/^Show ([\s\S]+) in folder$/, (_m, name) => `在文件夹中显示：${name}`, '在文件夹中显示：'],
    [/^Remove ([\s\S]+) from list$/, (_m, name) => `从列表中移除：${name}`, '从列表中移除：'],
    [/^Stop (\d+) selected$/, (_m, count) => `停止所选的 ${count} 项`, '停止所选的 '],
    [/^Recording shortcut for ([\s\S]+)\. Press keys to bind, Enter to save, Escape to cancel\.$/, (_m, name) => `正在为 ${name} 录制快捷键。按下按键绑定，按 Enter 保存，按 Escape 取消。`, '正在为 '],
    [/^Remove shortcut ([\s\S]+?) for ([\s\S]+)$/, (_m, key, action) => `移除快捷键 ${key}：${matchExactPhrase(action) ?? action}`, '移除快捷键 '],
    [/^Add shortcut for ([\s\S]+)$/, (_m, action) => `添加快捷键：${matchExactPhrase(action) ?? action}`, '添加快捷键：'],
    [/^Shortcut ([\s\S]+?) for ([\s\S]+)$/, (_m, key, action) => `快捷键 ${key}：${matchExactPhrase(action) ?? action}`, '快捷键 '],
    [/^Reset ([\s\S]+) to default$/, (_m, name) => `恢复默认设置：${name}`, '恢复默认设置：'],
    [/^Toggle ([\s\S]+)$/, (_m, name) => `切换：${name}`, '切换：'],
    [/^([\s\S]+), voice (\d+) of (\d+)$/, (_m, name, n, total) => `语音：${name}（${n} / ${total}）`, '语音：'],
    [/^Auth code for ([\s\S]+)$/, (_m, name) => `授权码：${name}`, '授权码：'],
    [/^Authorization code for ([\s\S]+)$/, (_m, name) => `授权代码：${name}`, '授权代码：'],
    [/^Make ([\s\S]+) the default ([\s\S]+) account$/, (_m, name, provider) => `设为默认账号：${name}（${provider}）`, '设为默认账号：'],
    [/^Label for ([\s\S]+)$/, (_m, name) => `标签：${name}`, '标签：'],
    [/^Sign in to ([\s\S]+) on this computer$/, (_m, name) => `在此电脑上登录：${name}`, '在此电脑上登录：'],
    [/^Sign in to ([\s\S]+) remotely$/, (_m, name) => `远程登录：${name}`, '远程登录：'],
    [/^More for ([\s\S]+)$/, (_m, name) => `更多操作：${name}`, '更多操作：'],
    [/^Edit ([\s\S]+) name$/, (_m, name) => `编辑名称：${name}`, '编辑名称：'],
    [/^Version ([\s\S]+)$/, (_m, version) => `版本：${version}`, '版本：'],
    [/^(\d+) lines added, (\d+) lines removed$/, (_m, added, removed) => `新增 ${added} 行，删除 ${removed} 行`, '新增 '],
    [/^Go to slide (\d+)$/, (_m, n) => `转到幻灯片 ${n}`, '转到幻灯片 '],
    [/^Opens external link: ([\s\S]+)$/, (_m, url) => `打开外部链接：${url}`, '打开外部链接：'],
    [/^View Diff for ([\s\S]+)$/, (_m, name) => `查看差异：${name}`, '查看差异：'],
    [/^Open URL in system browser: ([\s\S]+)$/, (_m, url) => `在系统浏览器中打开网址：${url}`, '在系统浏览器中打开网址：'],
    [/^Cost summary: ([\s\S]+)$/, (_m, cost) => `费用摘要：${cost}`, '费用摘要：'],
    [/^\+(\d+) more$/, (_m, count) => `还有 ${count} 项`, '还有 '],
    [/^Edit comment: ([\s\S]+)$/, (_m, comment) => `编辑评论：${comment}`, '编辑评论：'],
    [/^Fix with Agent: ([\s\S]+)$/, (_m, name) => `使用智能体修复：${name}`, '使用智能体修复：'],
    [/^More actions for ([\s\S]+)$/, (_m, name) => `更多操作：${name}`, '更多操作：'],
    [/^Account this MCP server uses: ([\s\S]+)$/, (_m, name) => `此 MCP 服务器使用的账号：${name}`, '此 MCP 服务器使用的账号：'],
    [/^(Enable|Disable) ([\s\S]+) tool for ([\s\S]+)$/, (_m, action, tool, owner) => `${action === 'Enable' ? '启用' : '停用'}工具：${tool}（${owner}）`, '启用工具：'],
    [/^Where the agent runs, current: ([\s\S]+)$/, (_m, name) => `智能体运行位置：${name}`, '智能体运行位置：'],
    [/^Select project, current: ([\s\S]+)$/, (_m, name) => `选择项目，当前：${matchExactPhrase(name) ?? name}`, '选择项目，当前：'],
    [/^Remove context from ([\s\S]+)$/, (_m, name) => `移除上下文：${name}`, '移除上下文：'],
    [/^Question (\d+) of (\d+)$/, (_m, n, total) => `问题 ${n} / ${total}`, '问题 '],
    [/^Select harnesses, current: ([\s\S]+)$/, (_m, name) => `选择执行框架，当前：${name}`, '选择执行框架，当前：'],
    [/^Run ([\s\S]+) now$/, (_m, name) => `立即运行：${name}`, '立即运行：'],
    [/^Filter skills and rules: ([\s\S]+)$/, (_m, query) => `筛选技能和规则：${query}`, '筛选技能和规则：'],
    [/^Plugins in ([\s\S]+)$/, (_m, name) => `插件所在位置：${name}`, '插件所在位置：'],
    [/^Switch environment \(([\s\S]+)\)$/, (_m, name) => `切换环境：${name}`, '切换环境：'],
    [/^Go to turn (\d+) of (\d+)$/, (_m, n, total) => `转到第 ${n} / ${total} 轮`, '转到第 '],
    [/^Turn (\d+) of (\d+)$/, (_m, n, total) => `第 ${n} / ${total} 轮`, '第 '],
    [/^Open Subagent: ([\s\S]+)$/, (_m, name) => `打开子智能体：${name}`, '打开子智能体：'],
    [/^([\s\S]+)\. Switch mic$/, (_m, name) => `切换麦克风：${name}`, '切换麦克风：'],
    [/^([\s\S]+)\. Show in ([\s\S]+)$/, (_m, name, location) => `显示来源：${name}（${location}）`, '显示来源：'],
    [/^([\s\S]+) CEL values$/, (_m, name) => `CEL 值：${name}`, 'CEL 值：'],
    [/^Scroll to: ([\s\S]+) on page (\d+)$/, (_m, name, n) => `滚动到第 ${n} 页：${name}`, '滚动到第 '],
    [/^Page (\d+) failed to load$/, (_m, n) => `第 ${n} 页加载失败`, '第 '],
    [/^Go to page (\d+)$/, (_m, n) => `转到第 ${n} 页`, '转到第 '],
    [/^Sign in to ([\s\S]+)$/, (_m, name) => `登录：${name}`, '登录：'],
    [/^Install ([\s\S]+)$/, (_m, name) => `安装：${name}`, '安装：'],
    [/^Reconnect ([\s\S]+)$/, (_m, name) => `重新连接：${name}`, '重新连接：'],
    [/^Disconnect ([\s\S]+)$/, (_m, name) => `断开连接：${name}`, '断开连接：'],
    [/^Connect ([\s\S]+)$/, (_m, name) => `连接：${name}`, '连接：'],
    [/^Open ([\s\S]+)$/, (_m, name) => `打开：${name}`, '打开：'],
    [/^View ([\s\S]+)$/, (_m, name) => `查看：${name}`, '查看：'],
    [/^Close ([\s\S]+)$/, (_m, name) => `关闭：${name}`, '关闭：'],
    [/^Cancel ([\s\S]+)$/, (_m, name) => `取消：${name}`, '取消：'],
    [/^Stop ([\s\S]+)$/, (_m, name) => `停止：${name}`, '停止：'],
    [/^Remove ([\s\S]+)$/, (_m, name) => `移除：${name}`, '移除：'],
    [/^Delete ([\s\S]+)$/, (_m, name) => `删除：${name}`, '删除：'],
    [/^Enable ([\s\S]+)$/, (_m, name) => `启用：${name}`, '启用：'],
    [/^Restart ([\s\S]+)$/, (_m, name) => `重新启动：${name}`, '重新启动：'],
    [/^Add ([\s\S]+)$/, (_m, name) => `添加：${name}`, '添加：'],
  ];

  function translateAriaLabel(value) {
    if (!value || !/[A-Za-z]/.test(value)) return null;
    const text = value.trim();
    if (text.startsWith('停用工具：')) return value;
    if (dynamicAriaLabels.some(([, , prefix]) => text.startsWith(prefix))) return value;
    // 完整静态词条优先，避免把“Open File”等控件的后半段误当成变量。
    if (matchExactPhrase(text)) return null;
    for (const [pattern, render] of dynamicAriaLabels) {
      const match = text.match(pattern);
      if (match) return value.replace(text, () => render(...match));
    }
    return null;
  }

  // 项目删除说明由普通文本和两个 strong 节点组成；只接受已确认的结构。
  function projectDeletionParts(element) {
    if (!element || element.tagName !== 'SPAN' || !element.childNodes) return null;
    const nodes = Array.from(element.childNodes);
    let index = 0;
    const prefix = nodes[index++];
    if (prefix?.nodeType !== Node.TEXT_NODE || !/^(?:Permanently delete|永久删除)$/.test((prefix.nodeValue || '').trim())) return null;
    if (nodes[index]?.nodeType === Node.TEXT_NODE && !(nodes[index].nodeValue || '').trim()) index++;
    const name = nodes[index++];
    if (name?.nodeType !== Node.ELEMENT_NODE || name.tagName !== 'STRONG') return null;
    let join = null;
    if (nodes[index]?.nodeType === Node.TEXT_NODE && /^(?:including|包含)$/.test((nodes[index].nodeValue || '').trim())) {
      join = nodes[index++];
      const count = nodes[index++];
      if (count?.nodeType !== Node.ELEMENT_NODE || count.tagName !== 'STRONG') return null;
    }
    const punctuation = nodes[index++];
    if (punctuation?.nodeType !== Node.TEXT_NODE || !/^[.。]$/.test((punctuation.nodeValue || '').trim()) || index !== nodes.length) return null;
    return { name, join, punctuation };
  }

  // 自动化管理说明中的 strong 是用户命名的自动化，不得翻译。
  function automationManagedParts(element) {
    if (!element || element.tagName !== 'SPAN' || !element.childNodes) return null;
    const nodes = Array.from(element.childNodes).filter((node) =>
      node.nodeType !== Node.TEXT_NODE || (node.nodeValue || '').trim());
    if (nodes.length !== 5) return null;
    const [prefix, kind, join, name, suffix] = nodes;
    if (prefix?.nodeType !== Node.TEXT_NODE || !/^(?:This|此)$/.test((prefix.nodeValue || '').trim())) return null;
    if (kind?.nodeType !== Node.TEXT_NODE || !/^(?:project|workspace|项目|工作区)$/i.test((kind.nodeValue || '').trim())) return null;
    if (join?.nodeType !== Node.TEXT_NODE || !/^(?:is managed by the|由自动化“)$/.test((join.nodeValue || '').trim())) return null;
    if (name?.nodeType !== Node.ELEMENT_NODE || name.tagName !== 'STRONG') return null;
    if (suffix?.nodeType !== Node.TEXT_NODE || !/^(?:automation and can only be deleted by deleting that automation\.|”管理，只能通过删除该自动化来删除此(?:项目|工作区)。)$/.test((suffix.nodeValue || '').trim())) return null;
    return { prefix, kind, join, name, suffix };
  }

  const protectedCustomizationNameSelector = [
    '[data-testid="workspace-customizations-view"] span[data-tooltip-id].text-sm.font-medium.truncate',
    '[data-testid="workspace-customizations-view"] .group.flex.items-start.justify-between span.font-medium.truncate',
  ].join(', ');

  function restoreProtectedCustomizationNames() {
    for (const element of document.querySelectorAll(protectedCustomizationNameSelector)) {
      restoreTrackedNode(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) restoreTrackedNode(node);
    }
  }

  function isProtectedMentionLabel(element) {
    const label = element?.closest?.('[data-testid="menu-option-label"]');
    return !!label?.closest?.('[data-mention-menu]') &&
      !label.closest?.('[data-testid="menu-category-row"]');
  }

  function shouldSkipSubtree(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;

    // 删除说明中的项目名称是用户数据，即使与词条同名也不能翻译。
    const strong = element.closest('strong');
    if (strong && (projectDeletionParts(strong.parentElement)?.name === strong ||
        automationManagedParts(strong.parentElement)?.name === strong)) return true;

    // 设置页和自定义项页的列表名称均为用户数据，描述和按钮仍可翻译。
    if (element.closest(protectedCustomizationNameSelector)) return true;

    // 斜杠命令、技能、文件等建议项的标签是实际名称；保留分类标题的翻译。
    if (isProtectedMentionLabel(element)) return true;

    // 跳过代码与编辑区（textarea 放到下方输入区规则中，保留自身 placeholder/aria-label 翻译）
    if (element.closest('script, style, code, pre, .xterm, .monaco-editor, [data-agy-hans-ui]')) {
      return true;
    }

    // 这些界面节点显示用户自定义名称或资源，而不是固定控件文案。
    if (element.closest('[data-testid="file-title-name"], [data-testid="branch-pill-label"], [data-testid="branch-repo-label"], [data-testid="automation-name"], [data-testid="webview-download-filename"], [data-testid="side-question-tab-header-name"], [data-testid="subagent-tab-header-title"], [data-testid="project-selector-item"] span[title], [data-testid="branch-option"] span[title], [data-testid="project-selector-github-repo-item"], [data-testid="resource-link"]')) {
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

    // 自定义项列表的名称可以恰好与常见按钮同名；描述及操作仍需翻译。
    if (element.matches?.('span[data-tooltip-id].text-sm.font-medium.truncate') &&
        element.closest('[data-testid="workspace-customizations-view"]')) return true;

    if (node.nodeType === Node.TEXT_NODE) {
      const project = element.closest('[data-testid="project-header"][data-project-label], [data-testid="project-selector-item"][data-project-name]');
      const projectName = project?.getAttribute?.('data-project-label') ?? project?.getAttribute?.('data-project-name');
      if (projectName != null && (node.nodeValue || '').trim() === projectName.trim()) return true;
    }

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
    // 仅匹配 IDE 的全局 Antigravity 设置标签，避免改写普通文件标签。
    '.tabs-container .tab[data-resource-name="global"][aria-label="Antigravity Settings"]',
    '.tabs-container .tab[data-resource-name="global"][aria-label="Antigravity 设置"]',
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
      // 项目类型由应用单独渲染，不包含用户填写的项目名。
      match: /^(?:A\s+|已存在同名)(?:project|workspace|项目|工作区)(?:\s+with this name already exists\.|。)$/i,
      nodes: new Map([
        ['A', '已存在同名'], ['project', '项目'], ['workspace', '工作区'],
        ['with this name already exists.', '。'],
      ]),
    },
    {
      // 链接仍由应用管理，仅改写周围文本和标点。
      match: /^(?:For Antigravity Business consumption options, see|有关 Antigravity Business 的用量选项，请参阅)\s*(?:documentation|文档)[.。]$/,
      nodes: new Map([
        ['For Antigravity Business consumption options, see', '有关 Antigravity Business 的用量选项，请参阅'],
        ['.', '。'],
      ]),
    },
    {
      match: /^Open (?:Antigravity|Antigravity IDE) panel$/,
      nodes: new Map([['Open', '打开 '], ['panel', ' 面板']]),
    },
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
    const managed = automationManagedParts(element);
    if (managed) {
      const kind = /^(?:workspace|工作区)$/i.test((managed.kind.nodeValue || '').trim()) ? '工作区' : '项目';
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && !(node.nodeValue || '').trim() && node.nodeValue) writeText(node, '');
      }
      for (const [node, text] of [[managed.prefix, '此'], [managed.kind, kind], [managed.join, '由自动化“'], [managed.suffix, `”管理，只能通过删除该自动化来删除此${kind}。`]]) {
        if (node.nodeValue !== text) writeText(node, text);
        node.__zh_patched = true;
      }
      return true;
    }
    const deletion = projectDeletionParts(element);
    if (deletion) {
      if (deletion.join && (deletion.join.nodeValue || '').trim() === 'including') {
        writeText(deletion.join, ' 包含 ');
        deletion.join.__zh_patched = true;
      }
      if ((deletion.punctuation.nodeValue || '').trim() === '.') {
        writeText(deletion.punctuation, '。');
        deletion.punctuation.__zh_patched = true;
      }
      return true;
    }
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

  function translateScopedNavigation(element, value) {
    const text = value.trim();
    const match = text.match(/^(Next|Previous)(\s*\([←→]\))?$/);
    if (!match) return null;
    const testId = match[1] === 'Next' ? 'media-modal-next' : 'media-modal-previous';
    if (!element.closest?.(`[data-testid="${testId}"]`) && !element.closest?.('.carousel')) return null;
    const label = (match[1] === 'Next' ? '下一项' : '上一项') + (match[2] || '');
    return value.replace(text, () => label);
  }

  // 菜单搜索会把匹配片段拆成多个高亮节点；只重组已核对的内置命令说明。
  const slashMenuDescriptions = new Map([
    ['btw', 'Ask a quick question without interrupting the main conversation.'],
    ['goal', 'Run until the specified goal is completely finished.'],
    ['compact', 'Compact the conversation now (summarize history to free up the context window).'],
    ['schedule', 'Run an instruction on a recurring schedule or as a one-time timer.'],
    ['browser', 'Invoke a browser agent for web tasks.'],
    ['plan', 'Plan carefully before executing a task.'],
    ['grill-me', 'Interview me to align on a plan.'],
    ['teamwork', 'Invoke a team of agents to autonomously tackle large projects.'],
    ['learn', 'Reflect on recent successes or corrections to capture reusable skills or rules.'],
    ['boost', 'Invoke the Boost multi-agent orchestrator for complex tasks.'],
  ]);
  const translatedSlashDescriptions = new WeakMap();

  function originalMenuText(element) {
    const nodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    const current = nodes.map((node) => node.nodeValue || '').join('');
    const source = nodes.map((node) => {
      const record = originals.texts.get(node);
      return record && record.zh === node.nodeValue ? record.orig : (node.nodeValue || '');
    }).join('');
    return { nodes, current, source };
  }

  function translateKnownSlashDescription(element) {
    if (!element.matches?.('[data-testid="menu-option-description"]') ||
        !element.closest?.('[data-mention-menu]')) return false;
    const row = element.closest?.('[role="option"]');
    const label = row?.querySelector?.('[data-testid="menu-option-label"]');
    if (!label) return false;
    const command = originalMenuText(label).source.trim();
    const expected = slashMenuDescriptions.get(command);
    if (!expected) return false;
    const { nodes, current, source } = originalMenuText(element);
    if (!nodes.length) return false;
    const previous = translatedSlashDescriptions.get(element);
    if (previous?.command === command && previous.rendered === current) {
      for (const node of nodes) node.__zh_patched = true;
      return true;
    }
    const text = source.trim();
    const matches = text === expected ||
      (text.startsWith('…') && text.length >= 20 && expected.includes(text.slice(1)));
    const translated = matches ? phrases.get(expected) : null;
    if (!translated) {
      if (previous) for (const node of nodes) restoreTrackedNode(node);
      translatedSlashDescriptions.delete(element);
      return false;
    }
    const rendered = source.replace(text, () => translated);
    nodes.forEach((node, index) => {
      const value = index === 0 ? rendered : '';
      if (node.nodeValue !== value) writeText(node, value);
      node.__zh_patched = true;
    });
    translatedSlashDescriptions.set(element, { command, rendered });
    return true;
  }

  function translateElement(element) {
    if (shouldSkip(element)) return;
    if (!isInAntigravityContainer(element)) return;
    translateComposedElement(element);
    translateKnownSlashDescription(element);
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = element.getAttribute?.(attr);
      if (!value) continue;
      const tracked = originals.attrs.get(element)?.get(attr);
      if (tracked && tracked.zh === value) continue;
      const translated = translateScopedNavigation(element, value) ??
        (attr === 'aria-label' ? translateAriaLabel(value) : null) ?? translate(value);
      if (translated !== value) writeAttr(element, attr, translated);
    }
  }

  // “Type” 在筛选/详情中表示类型，在计划提示里是“输入”。
  function translateTextValue(node) {
    const value = node.nodeValue || '';
    const tracked = originals.texts.get(node);
    if (tracked && tracked.zh === value) return value;
    if (value.trim() === 'Type' && node.parentElement?.closest('[data-testid="plan-command-fyi-alert"]')) {
      return value.replace('Type', '输入');
    }
    if (value.trim() === 'Next' && node.parentElement?.nextElementSibling?.matches('[data-testid="automation-next-run"]')) {
      return value.replace('Next', '下次');
    }
    const navigation = node.parentElement ? translateScopedNavigation(node.parentElement, value) : null;
    if (navigation !== null) return navigation;
    return translate(value);
  }

  function translateNode(root) {
    if (!root) return;
    if (shouldSkipSubtree(root)) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (shouldSkip(root)) return;
      if (!isInAntigravityContainer(root)) return;
      if (root.__zh_patched) return;
      const val = root.nodeValue || '';
      const translated = translateTextValue(root);
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
        const translated = translateTextValue(node);
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
      // 更新规则时恢复旧版误译的名称，再跳过这些节点。
      restoreProtectedCustomizationNames();
      const stale = document.createTreeWalker(document, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = stale.nextNode(); node; node = stale.nextNode()) node.__zh_patched = false;
    }
    translateNode(document);
  }

  function setLang(next, persist = true) {
    next = next === 'en' ? 'en' : 'zh';
    if (cancelled || next === lang) return;
    lang = next;
    if (persist) savePref(LANG_KEY, next);
    if (next === 'en') {
      flushScheduler?.cancel();
      restoreIdeNlsMessages();
      restoreOriginals();
      if (originalDocLang !== null) document.documentElement.lang = originalDocLang;
    } else {
      applyIdeNlsMessages();
      applyChinese(true);
    }
    updateToggleUI();
    broadcastPreferenceState();
  }

  // 开关「选项名保留英文」预设；中文状态下先还原再按新规则重译，英文状态下仅记录偏好
  function setEnglishLabels(next, persist = true) {
    next = !!next;
    if (cancelled || next === englishLabels) return;
    englishLabels = next;
    if (persist) savePref(ENGLISH_LABELS_KEY, next ? '1' : '0');
    if (lang === 'zh') {
      flushScheduler?.cancel();
      restoreOriginals();
      applyChinese(true);
    }
    updateToggleUI();
    broadcastPreferenceState();
  }

  // IDE 的智能体 iframe 与工作台属于不同来源，不能依赖跨来源 storage 事件。
  // 父窗口只响应本机 iframe 的状态请求；子页面只接受来自顶层窗口的状态。
  const preferencePeers = new Map();
  const preferenceRequest = 'antigravity-hans-preferences-request';
  const preferenceState = 'antigravity-hans-preferences-state';
  function sendPreferenceState(peer, origin) {
    try {
      if (peer.closed) { preferencePeers.delete(peer); return; }
      peer.postMessage({ type: preferenceState, lang, englishLabels }, origin);
    }
    catch (_e) { preferencePeers.delete(peer); }
  }
  function broadcastPreferenceState() {
    for (const [peer, origin] of preferencePeers) sendPreferenceState(peer, origin);
  }
  function startPreferenceSync() {
    let topWindow;
    try { topWindow = window.top; } catch (_e) { /* unavailable in restricted frames */ }
    const isFrame = !!topWindow && topWindow !== window;
    const isWorkbench = !isFrame && /\/(?:workbench|workbench-jetski-agent)\.html$/.test(window.location?.pathname || '');
    const isAgentFrame = isFrame && window.location?.protocol === 'http:' &&
      window.location?.hostname === '127.0.0.1' &&
      (window.location.pathname === '/' || window.location.pathname === '/settings-standalone');
    const onStorage = (e) => {
      if (e.key === LANG_KEY) setLang(e.newValue, false);
      else if (e.key === ENGLISH_LABELS_KEY) setEnglishLabels(e.newValue === '1', false);
    };
    const onMessage = (e) => {
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (isAgentFrame && e.source === topWindow &&
          (e.origin === 'vscode-file://vscode-app' || e.origin === 'null') && data.type === preferenceState &&
          (data.lang === 'en' || data.lang === 'zh') && typeof data.englishLabels === 'boolean') {
        setLang(data.lang, false);
        setEnglishLabels(data.englishLabels, false);
      } else if (isWorkbench && data.type === preferenceRequest && e.source &&
          /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(e.origin)) {
        for (const peer of preferencePeers.keys()) {
          try { if (peer.closed) preferencePeers.delete(peer); } catch (_e) { preferencePeers.delete(peer); }
        }
        if (preferencePeers.size < 100 || preferencePeers.has(e.source)) {
          preferencePeers.set(e.source, e.origin);
          sendPreferenceState(e.source, e.origin);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    let timer = null;
    if (isAgentFrame) {
      const requestState = () => {
        try { topWindow.postMessage({ type: preferenceRequest }, '*'); } catch (_e) { /* parent unavailable */ }
      };
      requestState();
      // 重发请求以覆盖父窗口稍后注入或重载的情况。
      timer = setInterval(requestState, 3000);
    }
    removePreferenceSync = () => {
      if (timer !== null) clearInterval(timer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
      preferencePeers.clear();
    };
  }

  // ===== 悬浮切换按钮（可拖动，位置与偏好经 savePref 持久化） =====
  // 单击：中英切换；双击或右键：打开选项菜单
  let toggleButton = null;
  let optionsMenu = null;
  let refreshMenu = null;

  function updateToggleUI() {
    refreshMenu?.();
    if (!toggleButton) return;
    // 按钮显示“点击后将切换到的语言”
    toggleButton.textContent = lang === 'zh' ? 'EN' : '中';
    const tip = (lang === 'zh' ? '单击切换为英文' : '单击切换为中文') + '；双击或右键打开选项（Antigravity-Hans）';
    toggleButton.title = tip;
    toggleButton.setAttribute('aria-label', tip);
  }

  function closeOptionsMenu() {
    optionsMenu?.remove();
    optionsMenu = null;
    refreshMenu = null;
  }

  function openOptionsMenu() {
    if (!toggleButton) return;
    if (optionsMenu) { closeOptionsMenu(); return; }
    const menu = document.createElement('div');
    menu.setAttribute('data-agy-hans-ui', '');
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed', zIndex: '2147483647', minWidth: '220px', maxWidth: '280px', padding: '6px',
      borderRadius: '10px', background: 'rgba(32,33,36,0.96)', color: '#e8eaed',
      border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      font: '13px/1.4 system-ui, -apple-system, sans-serif', userSelect: 'none',
    });
    menu.style.setProperty('-webkit-app-region', 'no-drag');

    const makeRow = (role, onSelect) => {
      const row = document.createElement('div');
      row.setAttribute('role', role);
      row.tabIndex = 0;
      Object.assign(row.style, { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', outline: 'none' });
      const mark = document.createElement('span');
      Object.assign(mark.style, { width: '16px', flex: '0 0 16px', textAlign: 'center' });
      const body = document.createElement('span');
      row.append(mark, body);
      const highlight = (on) => { row.style.background = on ? 'rgba(255,255,255,0.08)' : 'transparent'; };
      row.addEventListener('pointerenter', () => highlight(true));
      row.addEventListener('pointerleave', () => highlight(document.activeElement === row));
      row.addEventListener('focus', () => highlight(true));
      row.addEventListener('blur', () => highlight(false));
      row.addEventListener('click', (e) => { e.stopPropagation(); onSelect(); });
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } });
      return { row, mark, body };
    };
    const zh = makeRow('menuitemradio', () => setLang('zh'));
    zh.body.textContent = '中文';
    const en = makeRow('menuitemradio', () => setLang('en'));
    en.body.textContent = 'English';
    const divider = document.createElement('div');
    Object.assign(divider.style, { height: '1px', margin: '4px 6px', background: 'rgba(255,255,255,0.12)' });
    const labels = makeRow('menuitemcheckbox', () => setEnglishLabels(!englishLabels));
    const title = document.createElement('div');
    title.textContent = '选项名保留英文';
    const hint = document.createElement('div');
    hint.textContent = '权限模式、模型等级等保留英文，说明仍为中文（中文状态下生效）';
    Object.assign(hint.style, { fontSize: '11px', opacity: '0.65', marginTop: '2px' });
    labels.body.append(title, hint);
    menu.append(zh.row, en.row, divider, labels.row);

    refreshMenu = () => {
      zh.mark.textContent = lang === 'zh' ? '●' : '○';
      en.mark.textContent = lang === 'en' ? '●' : '○';
      zh.row.setAttribute('aria-checked', String(lang === 'zh'));
      en.row.setAttribute('aria-checked', String(lang === 'en'));
      labels.mark.textContent = englishLabels ? '☑' : '☐';
      labels.row.setAttribute('aria-checked', String(englishLabels));
    };
    refreshMenu();

    document.body.appendChild(menu);
    optionsMenu = menu;
    positionOptionsMenu();
    zh.row.focus?.({ preventScroll: true });
  }

  // 默认显示在按钮左上方，并限制在可见区域内；窗口缩放时重新定位
  function positionOptionsMenu() {
    if (!optionsMenu || !toggleButton) return;
    const b = toggleButton.getBoundingClientRect();
    const m = optionsMenu.getBoundingClientRect();
    let left = b.right - m.width;
    let top = b.top - m.height - 8;
    if (top < 4) top = b.bottom + 8;
    left = Math.max(4, Math.min(left, window.innerWidth - m.width - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - m.height - 4));
    optionsMenu.style.left = left + 'px';
    optionsMenu.style.top = top + 'px';
  }

  function mountToggleUI() {
    if (toggleButton || !document.body) return;
    if (/^data:/i.test(window.location.href)) return; // 启动闪屏页不放按钮
    try { if (window.top !== window) return; } catch (_e) { return; } // 仅顶层窗口

    const SIZE = 30;
    const DOUBLE_CLICK_MS = 250;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-agy-hans-ui', '');
    btn.setAttribute('aria-haspopup', 'menu');
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
    try { saved = JSON.parse(loadPref(POS_KEY) || 'null'); } catch (_e) { /* ignore */ }
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) placeAt(saved.left, saved.top);
    else placeAt(window.innerWidth - SIZE - 16, window.innerHeight - SIZE - 72);

    // 单击延迟到确认不是双击后再切换语言；第二次点击则打开选项菜单
    let tapTimer = null;
    const toggleLang = () => setLang(lang === 'zh' ? 'en' : 'zh');
    const onTap = () => {
      if (tapTimer !== null) {
        clearTimeout(tapTimer);
        tapTimer = null;
        openOptionsMenu();
        return;
      }
      tapTimer = setTimeout(() => { tapTimer = null; closeOptionsMenu(); toggleLang(); }, DOUBLE_CLICK_MS);
    };

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
      closeOptionsMenu();
      placeAt(e.clientX - drag.dx, e.clientY - drag.dy);
    };
    const onUp = (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      try { btn.releasePointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
      e.stopPropagation();
      if (moved) {
        savePref(POS_KEY, JSON.stringify({ left: parseFloat(btn.style.left), top: parseFloat(btn.style.top) }));
      } else {
        onTap();
      }
    };
    // 键盘（Enter / 空格）触发的 click 的 detail 为 0：立即切换；鼠标点击已在 pointerup 中处理
    const onClick = (e) => { e.stopPropagation(); if (e.detail === 0) toggleLang(); };
    // 右键或键盘菜单键：直接打开选项菜单
    const onContextMenu = (e) => { e.preventDefault(); e.stopPropagation(); openOptionsMenu(); };
    const onResize = () => { placeAt(parseFloat(btn.style.left), parseFloat(btn.style.top)); positionOptionsMenu(); };
    // 点击菜单和按钮以外的位置、按 Esc 时关闭菜单
    const onDocPointerDown = (e) => {
      if (optionsMenu && !optionsMenu.contains(e.target) && e.target !== btn) closeOptionsMenu();
    };
    const onKeyDown = (e) => { if (e.key === 'Escape' && optionsMenu) { closeOptionsMenu(); btn.focus?.(); } };

    btn.addEventListener('pointerenter', onEnter);
    btn.addEventListener('pointerleave', onLeave);
    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('click', onClick);
    btn.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);

    document.body.appendChild(btn);
    toggleButton = btn;
    updateToggleUI();
    removeToggleUI = () => {
      if (tapTimer !== null) clearTimeout(tapTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      closeOptionsMenu();
      btn.remove();
      toggleButton = null;
    };
  }

  function run() {
    if (cancelled) return;
    if (updating) restoreOriginals();
    if (lang === 'zh') {
      applyIdeNlsMessages();
      applyChinese(updating);
    }
    // 控制台可用：__antigravityZhSetLang('en') / __antigravityZhSetLang('zh')
    window.__antigravityZhSetLang = setLang;
    startPreferenceSync();

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
          const parent = target.parentElement;
          const description = parent?.closest?.('[data-testid="menu-option-description"]');
          if (description?.closest?.('[data-mention-menu]')) {
            description.__zh_patched = false;
            nodesToTranslate.push(description);
          } else if (parent && (projectDeletionParts(parent) || automationManagedParts(parent))) {
            parent.__zh_patched = false;
            nodesToTranslate.push(parent);
          } else {
            nodesToTranslate.push(target);
          }
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
          const description = mutation.target.nodeType === Node.ELEMENT_NODE &&
            mutation.target.closest?.('[data-testid="menu-option-description"]');
          if (description?.closest?.('[data-mention-menu]')) {
            description.__zh_patched = false;
            nodesToTranslate.push(description);
            continue;
          }
          if (mutation.target.nodeType === Node.ELEMENT_NODE &&
              (projectDeletionParts(mutation.target) || automationManagedParts(mutation.target))) {
            mutation.target.__zh_patched = false;
            nodesToTranslate.push(mutation.target);
          }
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
