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

// 工具步骤中的查询、URL、文件模式和工具名是变量，整体匹配后立即返回。
const activityPrefixes = [
  ['Read URL: ', '已读取 URL：'], ['Searched web: ', '已搜索网页：'],
  ['Searched for files: ', '已搜索文件：'], ['Invoked subagent: ', '已调用子智能体：'],
  ['Used MCP tool: ', '已使用 MCP 工具：'], ['Forked from ', '派生自 '],
];
function translateActivity(value) {
  const text = value.trim();
  if (/^(?:已读取 URL：|已搜索网页：|已搜索文件：|已调用子智能体：|已使用 MCP 工具：|派生自 )/.test(text) ||
    /^正在使用浏览器(?: · [\s\S]+)?（\d+ 秒）$/.test(text)) return value;
  for (const [prefix, translated] of activityPrefixes) {
    if (text.startsWith(prefix) && text.length > prefix.length) {
      return value.replace(text, () => translated + text.slice(prefix.length));
    }
  }
  const browser = text.match(/^Using browser(?: · ([\s\S]+))? \((\d+)s\)$/);
  if (browser) return value.replace(text, () => `正在使用浏览器${browser[1] ? ` · ${browser[1]}` : ''}（${browser[2]} 秒）`);
  const earlier = text.match(/^Show (\d+) earlier steps$/);
  if (earlier) return value.replace(text, () => `显示更早的 ${earlier[1]} 个步骤`);
  return null;
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
  [/(\d+)\s*agents running/g, '$1 个智能体正在运行'],
  [/^(\d+) tasks? running$/, '$1 个任务正在运行'],
  [/See all \((\d+)\)/g, '查看全部 ($1)'],
  [/^Send all \((\d+)\)$/g, '全部发送 ($1)'],
  [/Modified in (\d+)\s*(?:projects?|项目)/gi, '已在 $1 个项目中自定义'],
  [/^(\d+)\s*projects?$/i, '$1 个项目'],
  [/^No hosts in (~\/\.ssh\/config) yet$/, '$1 中还没有主机'],
  [/^Enter (\[user@\]host\[:port\]), or pick a host from your SSH config\.$/, '输入 $1，或从 SSH 配置中选择主机。'],
  [/^(~\/\.ssh\/config) \(default\)$/, '$1（默认）'],
  [/^(\d+) cookies?$/, '$1 个 Cookie'],
  [/^(\d+) hidden hosts?$/, '$1 台隐藏的主机'],
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
  [/^(\d+)h$/g, '$1小时'],
  [/^(\d+)m$/g, '$1分钟'],
  [/^(\d+)s$/g, '$1秒'],
  [/^Resets in ((?:\d+\s*[dhms]\b\s*)+)$/gi, (_m, dur) => `${formatShortDuration(dur)}后重置`],
  [/^(\d+(?:\.\d+)?)%\s*left$/i, '剩余 $1%'],
  // 额度面板的积分余额与「本组模型」提示都带变量：数字/逗号金额原样保留，
  // 模型名是产品名，只把列表分隔符换成中文顿号。
  [/^Available AI credits:\s*([\d,]+(?:\.\d+)?)$/i, '可用 AI 积分：$1'],
  [/^Models within this group: ([\s\S]+)$/i, (_m, list) => `本组包含的模型：${list.replace(/\s*,\s*/g, '、')}`],

  // 动态下拉与控件参数
  [/Toggle Agent(\s*\([^)]+\))?/g, '切换智能体$1'],
  [/^Toggle (.+)$/g, '切换 $1'],
  [/^(\d+)\s*mo$/gi, '$1 个月前'],
  [/^See (\d+) more$/g, '查看其余 $1 个'],
  [/^Install (.+)$/g, '安装 $1'],
  [/^More actions for (.+)$/g, '$1 的更多操作'],
  [/Select (Next|Previous) (Conversation|对话)/g, (_m, dir) => `选择${dir === 'Next' ? '下一个' : '上一个'}对话`],
  [/^Select model, current: (.+)$/g, (_m, name) => '选择模型，当前：' + name.replace(/\b(Extra High|High|Medium|Low)\b/g, (label) => (englishLabels ? label : (phrases.get(label) ?? label)))],
  [/^Select project, current: (.+)$/g, (_m, name) => '选择项目，当前：' + (matchExactPhrase(name) ?? name)],
  [/^Branch, current: (.+)$/g, (_m, branch) => '分支，当前：' + branch],
  [/^Agent permissions preset selector, current: (.+)$/g, (_m, name) => '智能体权限预设选择器，当前：' + (matchExactPhrase(name) ?? name)],
  [/^Inherits your (?:Global Permissions|全局权限) when working in these conversations\.$/g, '在这些对话中工作时继承您的全局权限。'],
  [/^(Rules|Skills): (\d+) tokens$/g, (_m, type, count) => `${type === 'Rules' ? '规则' : '技能'}：${count} 个 Token`],
  [/Your Plan:\s*(.+)/g, '你的套餐：$1'],
  [/Autocomplete Speed:\s*(.+)/g, '补全速度: $1'],
  [/Send feedback as (.+)/g, '以 $1 发送反馈'],
  [/\b(Gemini|GPT-OSS) ([^(]+?) \((Extra High|High|Medium|Low)\)/g, (_match, family, model, effort) => {
    if (englishLabels) return _match;
    const efforts = { 'Extra High': '极高', High: '高', Medium: '中', Low: '低' };
    return `${family} ${model.trim()} (${efforts[effort] ?? effort})`;
  }],
  [/^(Gemini [\w. -]+?)\s+(Extra High|High|Medium|Low)$/g, (_match, model, effort) => {
    if (englishLabels) return _match;
    const efforts = { 'Extra High': '极高', High: '高', Medium: '中', Low: '低' };
    return model.trim() + ' ' + (efforts[effort] ?? effort);
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
  [/\s*\bLeaving on ((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\./gi, (_m, date) => `将于 ${localizeEnglishDates(date)}下线。`],
  [/^([\w .-]+?) is currently available to Ultra and paid Pro plan subscribers\.$/gi, (_m, model) => `${model} 目前仅向 Ultra 及付费 Pro 套餐订阅用户开放。`],
  [/^([\w .-]+?) is currently available to Ultra plan subscribers\.$/gi, (_m, model) => `${model} 目前向 Ultra 套餐订阅用户开放。`],
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
  const activity = translateActivity(value);
  if (activity !== null) return activity;
  const trimmed = value.trim();

  // 文件夹路径、项目名、会话 ID 和产品名称是变量，先处理已确认的完整控件模板。
  if (/^(?:无法定位文件夹：[\s\S]*|请在 .+ 面板中登录。|登录后即可使用 .+！|项目：[\s\S]*|打开对话 [0-9a-f-]+|更新于 \d{1,2}:\d{2}(?:\s*[AP]M)?)$/i.test(trimmed)) return value;
  const folderFailure = trimmed.match(/^Failed to resolve folder: ([\s\S]+)$/);
  if (folderFailure) return value.replace(trimmed, () => '无法定位文件夹：' + folderFailure[1]);
  const panelSignIn = trimmed.match(/^Sign in from the ([^\r\n]{1,100}) panel\.$/);
  if (panelSignIn) return value.replace(trimmed, () => `请在 ${panelSignIn[1]} 面板中登录。`);
  const productSignIn = trimmed.match(/^Sign in to use ([^\r\n]{1,100})!$/);
  if (productSignIn) return value.replace(trimmed, () => `登录后即可使用 ${productSignIn[1]}！`);
  const projectLabel = trimmed.match(/^Project: ([^\r\n]+)$/);
  if (projectLabel) return value.replace(trimmed, () => `项目：${projectLabel[1]}`);
  const openConversation = trimmed.match(/^Open conversation ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (openConversation) return value.replace(trimmed, () => `打开对话 ${openConversation[1]}`);
  const updatedClock = trimmed.match(/^Updated (\d{1,2}:\d{2}(?:\s*[AP]M)?)$/);
  if (updatedClock) return value.replace(trimmed, () => `更新于 ${updatedClock[1]}`);

  // SSH 远程连接与浏览器站点 Cookie 提示含主机名、配置路径或域名，须完整匹配并保幂等。
  if (/^(?:已连接到 |正在连接到 |无法连接到 |SSH 配置：|SSH 配置 \(|已从最近使用中移除 |无法从最近使用中移除 |已删除 .+ 的 Cookie$|删除 .+ 的 Cookie$|无法删除 .+ 的 Cookie，请重试。$|没有匹配“[\s\S]+”的站点。$|.+ 中还没有主机，你可在上方输入。$)/.test(trimmed)) return value;
  const sshConnected = trimmed.match(/^Connected to ([^\r\n]+)$/);
  if (sshConnected) return value.replace(trimmed, () => `已连接到 ${sshConnected[1]}`);
  const sshConnecting = trimmed.match(/^Connecting to ([^\r\n]+)…$/);
  if (sshConnecting) return value.replace(trimmed, () => `正在连接到 ${sshConnecting[1]}…`);
  const sshConnectFailed = trimmed.match(/^Couldn't connect to ([^\r\n]+)$/);
  if (sshConnectFailed) return value.replace(trimmed, () => `无法连接到 ${sshConnectFailed[1]}`);
  const sshConfigTitle = trimmed.match(/^SSH Config \(([^\r\n]+)\)$/);
  if (sshConfigTitle) return value.replace(trimmed, () => `SSH 配置 (${sshConfigTitle[1]})`);
  const sshConfigLine = trimmed.match(/^SSH config: ([^\r\n]+)$/);
  if (sshConfigLine) {
    const configName = sshConfigLine[1] === '~/.ssh/config (default)' ? '~/.ssh/config（默认）' : sshConfigLine[1];
    return value.replace(trimmed, () => `SSH 配置：${configName}`);
  }
  const sshRemovedRecent = trimmed.match(/^Removed ([^\r\n]+) from Recent$/);
  if (sshRemovedRecent) return value.replace(trimmed, () => `已从最近使用中移除 ${sshRemovedRecent[1]}`);
  const sshRemoveRecentFailed = trimmed.match(/^Couldn't remove ([^\r\n]+) from Recent$/);
  if (sshRemoveRecentFailed) return value.replace(trimmed, () => `无法从最近使用中移除 ${sshRemoveRecentFailed[1]}`);
  const deletedCookies = trimmed.match(/^Deleted cookies for ([^\r\n]+)$/);
  if (deletedCookies) return value.replace(trimmed, () => `已删除 ${deletedCookies[1]} 的 Cookie`);
  const deleteCookies = trimmed.match(/^Delete cookies for ([^\r\n]+)$/);
  if (deleteCookies) return value.replace(trimmed, () => `删除 ${deleteCookies[1]} 的 Cookie`);
  const sshNoHostsInConfig = trimmed.match(/^No hosts in ([^\r\n]+) yet\. Type one above\.$/);
  if (sshNoHostsInConfig) return value.replace(trimmed, () => `${sshNoHostsInConfig[1]} 中还没有主机，你可在上方输入。`);
  const deleteCookiesFailed = trimmed.match(/^Couldn't delete cookies for ([^\r\n]+)\. Try again\.$/);
  if (deleteCookiesFailed) return value.replace(trimmed, () => `无法删除 ${deleteCookiesFailed[1]} 的 Cookie，请重试。`);
  const noCookieSiteMatch = trimmed.match(/^No sites match “([^\r\n]+)”\.$/);
  if (noCookieSiteMatch) return value.replace(trimmed, () => `没有匹配“${noCookieSiteMatch[1]}”的站点。`);

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
  const greetingBuild = trimmed.match(/^Hey ([\s\S]+?), what should we build today\?$/);
  if (greetingBuild) return value.replace(trimmed, () => `嗨，${greetingBuild[1]}，今天想构建什么？`);
  const greetingNext = trimmed.match(/^Good to see you, ([\s\S]+?)\. What's next\?$/);
  if (greetingNext) return value.replace(trimmed, () => `很高兴见到你，${greetingNext[1]}。接下来做什么？`);
  const greetingBack = trimmed.match(/^Welcome back, ([\s\S]+?)\. Where should we pick up\?$/);
  if (greetingBack) return value.replace(trimmed, () => `欢迎回来，${greetingBack[1]}。我们从哪里继续？`);
  if (/^(?:你好，[\s\S]+，今天想完成什么？|嗨，[\s\S]+，今天想构建什么？|很高兴见到你，[\s\S]+。接下来做什么？|欢迎回来，[\s\S]+。我们从哪里继续？)$/.test(trimmed)) return value;

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
  [/^([\s\S]+) — restore split view$/, (_m, status) => `恢复分屏视图：${translate(status)}`, '恢复分屏视图：'],
  [/^Playback speed (\d+(?:\.\d+)?)x$/, (_m, n) => `播放速度：${n}x`, '播放速度：'],
  [/^Zoom (\d+(?:\.\d+)?)%, reset to fit$/, (_m, n) => `缩放：${n}%，重置为适应窗口`, '缩放：'],
  [/^Open ([\s\S]+) skill$/, (_m, name) => `打开技能：${name}`, '打开技能：'],
  [/^([\s\S]+)\. View site information$/, (_m, site) => `查看网站信息：${site}`, '查看网站信息：'],
  [/^([\s\S]+) download progress$/, (_m, name) => `下载进度：${name}`, '下载进度：'],
  [/^Show ([\s\S]+) in folder$/, (_m, name) => `在文件夹中显示：${name}`, '在文件夹中显示：'],
  [/^Remove ([\s\S]+) from list$/, (_m, name) => `从列表中移除：${name}`, '从列表中移除：'],
  [/^Remove ([\s\S]+) from Recent$/, (_m, host) => `从最近使用中移除：${host}`, '从最近使用中移除：'],
  [/^Hide ([\s\S]+) from this list$/, (_m, host) => `从此列表中隐藏：${host}`, '从此列表中隐藏：'],
  [/^Show ([\s\S]+) in the list again$/, (_m, host) => `在列表中重新显示：${host}`, '在列表中重新显示：'],
  [/^Delete cookies for ([\s\S]+)$/, (_m, site) => `删除 Cookie：${site}`, '删除 Cookie：'],
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

// 折叠输入条使用同一个 span 显示占位文案或未发送草稿，用透明度 class 区分两者。
const floatingComposerDraftSelector = '[data-testid="aux-pane-floating-composer-trigger"] > span.opacity-90';

// 模型输出使用独立 Markdown 渲染根节点；不要把整个对话区域排除，否则步骤栏等界面也会漏译。
const protectedAgentContentSelector = [
  '[data-testid="agent-response"] [data-markdown-root]',
  '[data-bubble-side="agent"] [data-markdown-root]',
  '[data-testid="side-question-answer"] [data-markdown-root]',
  '[aria-label="Agent response"] [data-markdown-root]',
  '[aria-label="智能体回复"] [data-markdown-root]',
  '[data-testid="agent-response"] .cursor-edit.group.relative.text-secondary-foreground.pl-2',
].join(', ');

// Markdown 渲染器自身的固定控件与模型生成的链接、按钮区分开来。
const markdownControlSelector = [
  '[data-testid="markdown-table-menu"]',
  '[data-testid="markdown-table-copy-markdown"]',
  '[data-testid="markdown-table-width-toggle"]',
  '[data-testid="code-block-preview-toggle"]',
].join(', ');

function isProtectedAgentContent(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return !!element?.closest(protectedAgentContentSelector) && !element.closest(markdownControlSelector);
}

function shouldSkipSubtree(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) return false;

  if (isProtectedAgentContent(node)) return true;

  // 协调员欢迎语中的项目名由用户提供，即使与词条同名也不翻译。
  if (element.closest('[data-testid="coordinator-welcome"] strong')) return true;

  // 删除说明中的项目名称是用户数据，即使与词条同名也不能翻译。
  const strong = element.closest('strong');
  if (strong && (projectDeletionParts(strong.parentElement)?.name === strong ||
    automationManagedParts(strong.parentElement)?.name === strong)) return true;

  // 设置页和自定义项页的列表名称均为用户数据，描述和按钮仍可翻译。
  if (element.closest(protectedCustomizationNameSelector)) return true;

  // 斜杠命令、技能、文件等建议项的标签是实际名称；保留分类标题的翻译。
  if (isProtectedMentionLabel(element)) return true;

  // 跳过代码与编辑区（textarea 放到下方输入区规则中，保留自身 placeholder/aria-label 翻译）
  // Antigravity 的代码块与 Diff 行使用 .code-block/.code-line/.line-content 而非 <pre>/<code>，必须一并排除。
  if (element.closest('script, style, code, pre, .xterm, .monaco-editor, .code-block, .code-line, .line-content, .markdown-frontmatter, [data-testid="markdown-frontmatter"], [data-agy-hans-ui]')) {
    return true;
  }

  // 这些界面节点显示用户自定义名称、文件路径或资源，而不是固定控件文案。
  if (element.closest('[data-testid="file-title-name"], [data-testid="file-title-name"] + div:not([data-testid]), [data-testid="tab-file-tree-sidebar"] [role="treeitem"], [data-testid="branch-pill-label"], [data-testid="branch-repo-label"], [data-testid="automation-name"], [data-testid="webview-download-filename"], [data-testid="side-question-tab-header-name"], [data-testid="subagent-tab-header-title"], [data-testid="project-selector-item"] span[title], [data-testid="branch-option"] span[title], [data-testid="project-selector-github-repo-item"], [data-testid="resource-link"]')) {
    return true;
  }

  // 跳过输入框与文本域的正文/子节点，但允许元素自身属性（placeholder、aria-label）翻译
  if (node.nodeType === Node.TEXT_NODE) {
    if (element.closest(floatingComposerDraftSelector)) return true;
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
  if (element.closest('[data-testid="user-input-step"], [data-testid="side-question-followup-user"], [aria-label="User message"], [aria-label="用户消息"]')) {
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

  // 跳过侧边栏会话历史列表中的会话名称（保留行内操作按钮）；排除承载整个对话的 conversation-view 容器
  const historyItem = element.closest('[data-testid="conversation-row-sidebar"], [data-cascade-id]:not([data-testid="conversation-view"]), .past-conversations, .conversation-list, .history-list, .conversations-list, [data-testid="history-list"], [data-testid="past-conversations"], .conversation-item, .convo-item, .history-item, [class*="history-item"], [class*="convo-item"]');
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

// 主窗口用户文件与符号列表不参与汉化，防止项目名（如 Antigravity-Hans）命中图标类名导致文件名误翻
const mainWindowExcludedSelector = [
  '.explorer-folders-view',
  '.explorer-item',
  '.outline-pane',
  '.timeline-tree-view',
  '.scm-view .monaco-list',
  '.search-view .results',
].join(', ');

function isInAntigravityContainer(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) return false;

  // 主窗口白名单
  const isMainWindow = window.location.pathname.endsWith('workbench.html') ||
    window.location.href.indexOf('/workbench.html') >= 0 ||
    window.location.href.indexOf('\\workbench.html') >= 0;
  if (!isMainWindow) return true;
  if (element.closest(mainWindowExcludedSelector)) return false;

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

// React 将部分带变量（主机名、配置路径、域名、搜索词）的提示拆成纯文本兄弟节点，
// 仅改写固定前缀与后缀节点，并标记中间变量节点以避免被误译。
function translateSplitVariableText(element) {
  if (!element?.childNodes) return false;
  const len = element.childNodes.length;
  if (len !== 2 && len !== 3 && len !== 5) return false;
  const nodes = Array.from(element.childNodes);
  if (!nodes.every((node) => node.nodeType === Node.TEXT_NODE)) return false;

  // Diff 折叠行展开按钮：["+", count, " more", " ", "line"|"lines"]，避免把 " more" 单独翻成 "+15 更多 lines"。
  if (len === 5 && element.tagName === 'BUTTON' &&
      nodes[0].nodeValue === '+' && /^\d+$/.test((nodes[1].nodeValue || '').trim())) {
    const mid = nodes[2].nodeValue || '';
    const space = nodes[3].nodeValue || '';
    const unit = nodes[4].nodeValue || '';
    if (mid === ' more' && space === ' ' && /^lines?$/.test(unit)) {
      writeText(nodes[2], ' 行');
      writeText(nodes[3], '');
      writeText(nodes[4], '');
      for (const node of nodes) node.__zh_patched = true;
      return true;
    }
    if (mid === ' 行' && space === '' && unit === '') {
      for (const node of nodes) node.__zh_patched = true;
      return true;
    }
    return false;
  }

  if (len === 2 && element.closest?.('[data-testid="ssh-connect-error"]')) {
    const first = nodes[0].nodeValue || '';
    if (first === "Couldn't connect to ") {
      writeText(nodes[0], '无法连接到 ');
      nodes[0].__zh_patched = true;
      nodes[1].__zh_patched = true;
      return true;
    }
    if (first === '无法连接到 ') {
      nodes[0].__zh_patched = true;
      nodes[1].__zh_patched = true;
      return true;
    }
    return false;
  }

  if (len === 3) {
    const first = nodes[0].nodeValue || '';
    const last = nodes[2].nodeValue || '';
    const specs = [
      {
        match: () => element.closest?.('[data-testid="ssh-connect-dialog"]'),
        enFirst: 'No hosts in ',
        enLast: ' yet. Type one above.',
        zhFirst: '',
        zhLast: ' 中还没有主机，你可在上方输入。',
      },
      {
        match: () => element.matches?.('[data-testid="browser-site-data-delete-error"]'),
        enFirst: "Couldn't delete cookies for ",
        enLast: '. Try again.',
        zhFirst: '无法删除 ',
        zhLast: ' 的 Cookie，请重试。',
      },
      {
        match: () => element.matches?.('[data-testid="browser-site-data-no-match"]'),
        enFirst: 'No sites match “',
        enLast: '”.',
        zhFirst: '没有匹配“',
        zhLast: '”的站点。',
      },
    ];
    for (const spec of specs) {
      if (!spec.match()) continue;
      if (first === spec.enFirst && last === spec.enLast) {
        writeText(nodes[0], spec.zhFirst);
        writeText(nodes[2], spec.zhLast);
        for (const node of nodes) node.__zh_patched = true;
        return true;
      }
      if (first === spec.zhFirst && last === spec.zhLast) {
        for (const node of nodes) node.__zh_patched = true;
        return true;
      }
    }
  }
  return false;
}

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
  if (translateSplitVariableText(element)) return true;
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

// 协调员欢迎语逐词拆为 span；只改写已确认的固定文案，保留 strong 中的项目名。
const translatedCoordinatorParagraphs = new WeakMap();
const coordinatorIntro = ". I coordinate the work for this project. Ask me a question or hand me a task, and I'll answer directly or start workers that run in parallel.";
const coordinatorFollow = "You can follow the workers in the Dashboard, and I'll post an update when something finishes or needs you.";
function coordinatorOriginal(node) {
  const record = originals.texts.get(node);
  return record && record.zh === node.nodeValue ? record.orig : (node.nodeValue || '');
}
function rewriteCoordinatorNodes(nodes, value) {
  nodes.forEach((node, index) => {
    const next = index === 0 ? value : '';
    if (node.nodeValue !== next) writeText(node, next);
    node.__zh_patched = true;
  });
}
function restoreCoordinatorParagraph(paragraph) {
  const nodes = translatedCoordinatorParagraphs.get(paragraph);
  if (!nodes) return;
  for (const node of nodes) restoreTrackedNode(node);
  translatedCoordinatorParagraphs.delete(paragraph);
}
function translateCoordinatorWelcome(element) {
  if (!element.matches?.('[data-testid="coordinator-welcome"]')) return false;
  const paragraphs = element.querySelectorAll?.(':scope > p');
  if (!paragraphs || paragraphs.length !== 2) return false;
  let translated = false;
  const first = paragraphs[0];
  const names = first.querySelectorAll?.('strong');
  if (names?.length === 1) {
    const name = names[0];
    const nodes = originalMenuText(first).nodes;
    const firstName = nodes.findIndex((node) => name.contains(node));
    let lastName = firstName;
    while (lastName + 1 < nodes.length && name.contains(nodes[lastName + 1])) lastName++;
    const before = nodes.slice(0, firstName);
    const after = nodes.slice(lastName + 1);
    const matches = firstName > 0 && after.length &&
      before.map(coordinatorOriginal).join('') === 'Welcome to ' &&
      after.map(coordinatorOriginal).join('') === coordinatorIntro;
    if (matches) {
      rewriteCoordinatorNodes(before, '欢迎来到 ');
      rewriteCoordinatorNodes(after, '。我是本项目的协调员。你可以向我提问或交给我任务，我会直接回答，或启动并行工作的成员。');
      translatedCoordinatorParagraphs.set(first, [...before, ...after]);
      translated = true;
    } else restoreCoordinatorParagraph(first);
  } else restoreCoordinatorParagraph(first);
  const second = paragraphs[1];
  const nodes = originalMenuText(second).nodes;
  if (nodes.length && nodes.map(coordinatorOriginal).join('') === coordinatorFollow) {
    rewriteCoordinatorNodes(nodes, '你可以在控制面板中查看各成员的进展；有任务完成或需要你参与时，我会发布更新。');
    translatedCoordinatorParagraphs.set(second, nodes);
    translated = true;
  } else restoreCoordinatorParagraph(second);
  return translated;
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
  if (shouldSkip(element)) {
    if (isProtectedAgentContent(element)) restoreTrackedNode(element);
    return;
  }
  if (!isInAntigravityContainer(element)) return;
  // 若应用复用占位节点来展示草稿，先撤销仍留在节点上的占位译文。
  if (element.matches?.(floatingComposerDraftSelector)) {
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) restoreTrackedNode(child);
    }
    return;
  }
  translateComposedElement(element);
  translateCoordinatorWelcome(element);
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
  // 浮动输入条的占位和计数后缀都有明确的 DOM 上下文，避免翻译草稿或其他同名控件。
  if (value.trim() === 'Ask anything' && node.parentElement?.matches?.('[data-testid="aux-pane-floating-composer-trigger"] > span.opacity-60')) {
    return value.replace('Ask anything', '想问什么都可以');
  }
  if (/^Comments?$/.test(value.trim()) && node.parentElement?.closest?.('[data-testid="aux-pane-floating-composer-comment-badge"]')) {
    return value.replace(/Comments?/, '条评论');
  }
  if (value.trim() === 'Attached' && node.parentElement?.closest?.('[data-testid="aux-pane-floating-composer-attachment-badge"]')) {
    return value.replace('Attached', '个附件');
  }
  // 额度条里的数字与固定后缀是两个文本节点。React 刷新额度时只更新数字，
  // 因此仅翻译后缀，保持数字由应用管理，避免丢失百分号和说明（#47）。
  if (value.trim() === '% left') {
    const prev = node.previousSibling;
    const num = prev && prev.nodeType === Node.TEXT_NODE ? (prev.nodeValue || '').trim() : '';
    if (/^\d+(?:\.\d+)?$/.test(num)) {
      return value.replace('% left', '% 可用');
    }
  }
  if (value.trim() === 'Type' && node.parentElement?.closest('[data-testid="plan-command-fyi-alert"]')) {
    return value.replace('Type', '输入');
  }
  if (value.trim() === 'Next' && node.parentElement?.nextElementSibling?.matches('[data-testid="automation-next-run"]')) {
    return value.replace('Next', '下次');
  }
  // 模型选择器与选项行中的 “New” 徽标表示新模型/新功能，而非“新建”操作按钮。
  if (value.trim() === 'New' &&
    (node.parentElement?.closest('[data-testid="model-selector-panel"] .bg-secondary.rounded-full') ||
      node.parentElement?.closest('[role="menuitem"], [role="option"]'))) {
    return value.replace('New', '新');
  }
  if (value.trim() === 'Added' && node.parentElement?.closest('[data-testid="plugin-detail-added-badge"]')) {
    return value.replace('Added', '已添加');
  }
  const navigation = node.parentElement ? translateScopedNavigation(node.parentElement, value) : null;
  if (navigation !== null) return navigation;
  return translate(value);
}
