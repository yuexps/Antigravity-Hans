import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(new URL('../antigravity-hans-overlay.js', import.meta.url), 'utf8');
const context = { window: { addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' } }, document: { readyState: 'loading' } };
vm.createContext(context);
vm.runInContext(source.replace('  function run() {', '  globalThis.translateForTest = translate; globalThis.translateElementForTest = translateElement; globalThis.translateNodeForTest = translateNode; globalThis.isInAntigravityContainerForTest = isInAntigravityContainer; globalThis.createFlushSchedulerForTest = createFlushScheduler;\n  function run() {'), context);
const translate = context.translateForTest;

test('updated overlays replace their observer and use the requested fingerprint', () => {
  const fresh = { window: { addEventListener() {}, removeEventListener() {} }, document: { readyState: 'loading' } };
  vm.createContext(fresh);
  fresh.window.__antigravityZhPatchRequestedFingerprint = 'first';
  vm.runInContext(source, fresh);
  const previousCleanup = fresh.window.__antigravityZhPatchCleanup;
  fresh.window.__antigravityZhPatchRequestedFingerprint = 'second';
  vm.runInContext(source, fresh);
  assert.equal(fresh.window.__antigravityZhPatchFingerprint, 'second');
  assert.notEqual(fresh.window.__antigravityZhPatchCleanup, previousCleanup);
  const currentCleanup = fresh.window.__antigravityZhPatchCleanup;
  vm.runInContext(source, fresh);
  assert.equal(fresh.window.__antigravityZhPatchCleanup, currentCleanup, 'same version installed a duplicate observer');
});

test('permission targets survive both initial translation and observer reprocessing', () => {
  const targets = ['/workspace/10 files/30 minutes.txt', "rm -rf '/tmp/10 files'", 'https://example.test/10 files?q=30 minutes', "printf '$& $$ $` $\u0027'", "tool('10 files')\nnext command", '复制中文和10 files', 'Last 7 days', 'Last 7 天'];
  for (const target of targets) {
    const inputs = [
      `Requesting permission to running this command outside the sandbox ${target}`,
      `Requesting permission to read access to this path ${target}`,
      `Requesting permission to using this MCP tool ${target}`,
      `Requesting permission to run (unsandboxed) ${target}`,
      `Requesting permission to read ${target}`,
      `Agent needs permission to execute JavaScript on ${target}`,
      `Agent needs permission to act on ${target}`,
      `Yes, save rule for '${target}' in this conversation`,
      `Yes, save rule for '${target}' in this project`,
      `Yes, and always allow '${target}' in this conversation`,
      `Yes, and always allow '${target}' in this workspace`,
      `Conflicts with your configured Ask permission: ${target}`,
      `Requires manual confirmation: ${target}`,
      `Allow ${target}`,
    ];
    for (const input of inputs) {
      const result = translate(input);
      assert.ok(result.includes(target), `${input} -> ${result}`);
      assert.equal(translate(result), result, 'observer reprocessing changed an authorization target');
      assert.ok(!result.includes('在在'), 'scope prefix duplicated');
    }
  }
  assert.equal(translate('Requesting permission to running this command outside the sandbox echo ok'), '正在请求权限：在沙盒外运行此命令 echo ok');
  const unknown = 'Requesting permission to unknown new action /10 files';
  assert.equal(translate(unknown), unknown);
});

test('2.23.0 normal app controls and safety policies are localized', () => {
  for (const [input, expected] of [
    ['Code Search', '代码搜索'], ['Add to Chat', '添加到对话'], ['Chief of Staff', '统筹助手'],
    ['Manage Hooks', '管理钩子'], ['Sandbox Allow Network', '允许沙盒访问网络'],
    ['Agent always asks for review.', '智能体始终请求审核。'], ['Reject Step', '拒绝此步骤'],
    ['New Window', '新建窗口'], ['Select branch', '选择分支'],
    ['Vetted (Preview)', '安全审核（预览）'], ['Automatic Check for Updates', '自动检查更新'],
    ['Browser Actuation Permissions', '浏览器操作权限'], ['Terms of Service & Data Use', '服务条款与数据使用'],
    ['Allow read access to this path?', '允许读取此路径？'], ['Save rule to always allow running this command?', '保存规则以始终允许运行此命令？'],
    ['Explored, ran command', '已探索，已运行命令'], ['Explored, edited files', '已探索，已编辑文件'],
    ['Worked for 1h 20m', '已工作 1 小时 20 分钟'], ['Stopped after 45s', '工作 45 秒后停止'],
    ['Thinking for 3s', '已思考 3 秒'], ['3 files changed', '3 个文件已更改'],
  ]) assert.equal(translate(input), expected);
});

test('2.26.0 normal app settings and popovers are localized', () => {
  for (const [input, expected] of [
    ['Give Feedback', '提供反馈'],
    ['Open Editor Settings', '打开编辑器设置'],
    ['Inherit Global', '继承全局设置'],
    ['Strong', '严格'],
    ['Volume', '音量'],
    ['Notice', '提示'],
    ['Unavailable', '不可用'],
    ['View Usage', '查看用量'],
    ['View plans', '查看套餐'],
    ['Use Global Settings', '使用全局设置'],
    ['Search Projects', '搜索项目'],
    ['Other Customizations', '其他自定义项'],
    ['tokens (', 'Token ('],
    ['Inherits your Global Permissions when working in these conversations.', '在这些对话中工作时继承您的全局权限。'],
    ['Select project, current: No Project', '选择项目，当前：无项目'],
    ['Agent permissions preset selector, current: Default', '智能体权限预设选择器，当前：默认'],
    ['Select model, current: Gemini 3.8 Flash High', '选择模型，当前：Gemini 3.8 Flash 高'],
    ['Rules: 540 tokens', '规则：540 个 Token'],
    ['Skills: 170 tokens', '技能：170 个 Token'],
    ['Delete plugin', '删除插件'],
    ['Toggle Android CLI', '切换 Android CLI'],
    ['Windows Subsystem for Linux', '适用于 Linux 的 Windows 子系统'],
    ['5mo', '5 个月前'],
    ['See 6 more', '查看其余 6 个'],
    ['Install Google Docs', '安装 Google Docs'],
    ['More actions for Android CLI', 'Android CLI 的更多操作'],
  ]) assert.equal(translate(input), expected);
});

test('WSL provisioning translates status while preserving the distro name', () => {
  const name = 'Ubuntu 10 files';
  for (const input of [`Setting up WSL: ${name}`, `Installing into ${name}…`]) {
    const output = translate(input);
    assert.ok(output.includes(name));
    assert.equal(translate(output), output);
  }
  assert.equal(translate('Downloading the Antigravity binary…'), '正在下载 Antigravity 程序…');
});

test('recent-day filters translate fully and repair partially translated labels', () => {
  for (const input of ['Last 7 days', 'Last 7 天', 'Last 1 day', 'Last 30 days', ' Last 30 天 ']) {
    const count = input.match(/\d+/)[0];
    const expected = input.replace(input.trim(), `最近 ${count} 天`);
    const output = translate(input);
    assert.equal(output, expected);
    assert.equal(translate(output), output, 'observer reprocessing changed a translated time filter');
  }
  assert.equal(translate('Last Updated'), '最近更新');
  assert.equal(translate('Last Prompt'), '上次提示词');
});

test('attribute mutations inside skipped code/user content are not translated', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  let altered = false;
  const element = { nodeType: 1, closest(selector) { return selector.includes('script, style') ? this : null; }, getAttribute() { return 'Code Search'; }, setAttribute() { altered = true; } };
  context.translateElementForTest(element);
  assert.equal(altered, false);

  const attrs = new Map([['placeholder', '(tell the agent what to do instead)'], ['aria-label', 'Edit permission target']]);
  const textarea = {
    nodeType: 1,
    parentElement: { closest() { return null; } },
    closest() { return null; },
    getAttribute(name) { return attrs.get(name); },
    setAttribute(name, val) { attrs.set(name, val); },
  };
  context.translateElementForTest(textarea);
  assert.equal(attrs.get('placeholder'), '（告诉智能体改做什么）');
  assert.equal(attrs.get('aria-label'), '编辑权限目标');
});

test('split Also includes prompt is reordered while keeping links', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const textA = { nodeType: 3, nodeValue: 'Also includes ' };
  const link = { nodeType: 1 };
  const textB = { nodeType: 3, nodeValue: ' ' };
  const textC = { nodeType: 3, nodeValue: 'when working ' };
  const textD = { nodeType: 3, nodeValue: 'in these conversations' };
  const textE = { nodeType: 3, nodeValue: '.' };
  const element = {
    nodeType: 1,
    textContent: 'Also includes Global Permissions when working in these conversations. Learn more.',
    childNodes: [textA, link, textB, textC, textD, textE],
    closest() { return null; },
    getAttribute() { return null; },
    setAttribute() {},
  };
  context.translateElementForTest(element);
  assert.equal(textA.nodeValue, '在这些对话中工作时，还包括');
  assert.equal(textC.nodeValue, '');
  assert.equal(textD.nodeValue, '');
  assert.equal(textE.nodeValue, '。');
});

test('2.5.5 IDE chrome strings are localized', () => {
  for (const [input, expected] of [
    ['AI may make mistakes. Double-check all generated code.', 'AI 可能会出错，请仔细核对生成的代码。'],
    ['Agent Conversation', '智能体对话'],
    ['AI Shortcuts', 'AI 快捷方式'],
    ['Agent', '智能体'],
    ['Start', '开始'],
    ['Antigravity - Settings', 'Antigravity - 设置'],
    ['Back to Agent', '返回智能体'],
    ['Workflows', '工作流'],
    ['Customization', '自定义项'],
    ['Rules help guide the behavior of Agent.', '规则用于指导智能体的行为。'],
    ['Customize Agent to get a better, more personalized experience.', '自定义智能体，获得更好、更个性化的体验。'],
    ['Workflows are saved prompts that Agent can follow. To trigger a workflow, type "/" in Agent.', '工作流是智能体可以遵循的已保存提示词。要触发工作流，请在智能体中输入“/”。'],
  ]) assert.equal(translate(input), expected);
});

test('IDE status bar, auxiliary title and portal layers are whitelisted', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const originalLocation = context.window.location;
  context.window.location = { pathname: '/workbench.html', href: 'vscode-file://vscode-app/workbench.html' };
  const build = (marker) => ({ nodeType: 1, closest: (selector) => (selector.includes(marker) ? {} : null) });
  try {
    assert.equal(context.isInAntigravityContainerForTest(build('.part.statusbar')), true, 'status bar rejected');
    assert.equal(context.isInAntigravityContainerForTest(build('.part.auxiliarybar .title-label')), true, 'auxiliary title rejected');
    assert.equal(context.isInAntigravityContainerForTest(build('.monaco-workbench ~ div')), true, 'portal layer rejected');
    assert.equal(context.isInAntigravityContainerForTest(build('.unrelated-part')), false, 'unrelated part accepted');
  } finally {
    context.window.location = originalLocation;
  }
});

test('security mode sentence with standalone number node is translated', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const build = (numberText) => {
    const first = { nodeType: 3, nodeValue: 'Select one of the ' };
    const number = { nodeType: 3, nodeValue: numberText };
    const rest = { nodeType: 3, nodeValue: ' options. Agent settings and permissions can be further customized below.' };
    const element = {
      nodeType: 1,
      textContent: `Select one of the ${numberText} options. Agent settings and permissions can be further customized below.`,
      childNodes: [first, number, rest],
      closest() { return null; },
      getAttribute() { return null; },
      setAttribute() {},
    };
    context.translateElementForTest(element);
    return [first, number, rest].map((node) => node.nodeValue).join('');
  };
  assert.equal(build('three'), '选择以下三项之一。智能体设置和权限可在下方进一步自定义。');
  assert.equal(build('two'), '选择以下两项之一。智能体设置和权限可在下方进一步自定义。');
});

test('merged case variants still translate through the lowercase fallback', () => {
  const pairs = [
    ['Refresh Skills', 'Refresh skills', '刷新技能'],
    ['Mark as Unread', 'Mark As Unread', '标记为未读'],
    ['Stop Subagent', 'Stop subagent', '停止子智能体'],
    ['conversations', 'Conversations', '对话'],
    ['Recent Files', 'Recent files', '最近文件'],
    ['Edit comment', 'Edit Comment', '编辑评论'],
    ['conversation', 'Conversation', '对话'],
    ['Mark as Read', 'Mark As Read', '标记为已读'],
    ['Cancel Step', 'Cancel step', '取消此步骤'],
    ['Allow once', 'Allow Once', '允许一次'],
    ['workspaces', 'Workspaces', '工作区'],
    ['Try Again', 'Try again', '重试'],
    ['Copy path', 'Copy Path', '复制路径'],
    ['workspace', 'Workspace', '工作区'],
    ['searches', 'Searches', '搜索'],
    ['Show all', 'Show All', '显示全部'],
    ['folders', 'Folders', '文件夹'],
    ['folder', 'Folder', '文件夹'],
    ['search', 'Search', '搜索'],
    ['Go to', 'Go To', '转到'],
    ['file', 'File', '文件'],
  ];
  for (const [first, second, expected] of pairs) {
    assert.equal(translate(first), expected);
    assert.equal(translate(second), expected);
  }
});

test('mutation batches share one timer and cancel drops pending work', () => {
  const timers = new Map();
  let nextId = 1;
  context.setTimeout = (callback) => { const id = nextId++; timers.set(id, callback); return id; };
  context.clearTimeout = (id) => timers.delete(id);
  const calls = [];
  const scheduler = context.createFlushSchedulerForTest((nodes, elements) => calls.push(`${nodes.join(',')}|${elements.join(',')}`));
  scheduler.schedule([1], [10]);
  scheduler.schedule([2], [20]);
  assert.equal(timers.size, 1, '应只创建一个定时器');
  const [id, callback] = [...timers.entries()][0];
  timers.delete(id);
  callback();
  assert.deepEqual(calls, ['1,2|10,20'], '两个批次应按顺序合并处理');
  scheduler.schedule([3], []);
  assert.equal(timers.size, 1);
  scheduler.cancel();
  assert.equal(timers.size, 0, 'cleanup 应清除待执行的定时器');
  assert.deepEqual(calls, ['1,2|10,20'], '取消后不应再处理批次');
});

test('composed sentence detection skips elements with fewer than 3 child nodes', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const text = { nodeType: 3, nodeValue: 'Select one of the three options. Agent settings and permissions can be further customized below.' };
  const element = {
    nodeType: 1,
    textContent: text.nodeValue,
    childNodes: [text],
    closest() { return null; },
    getAttribute() { return null; },
    setAttribute() {},
  };
  context.translateElementForTest(element);
  assert.equal(text.nodeValue.includes('three'), true, '少于 3 个文本节点时不应读取并改写 textContent');
});

test('lint catches untranslated words and permission polarity reversals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-lexicon-test-'));
  try {
    const file = path.join(dir, 'fixture.js');
    fs.writeFileSync(file, "const phrases = new Map([\n    ['Test label', 'untranslated'],\n  ]);\n");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./lint-overlay.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /译文残留英文 untranslated/);
    fs.writeFileSync(file, "const phrases = new Map([\n    ['Short', '短'],\n    ['Longer label', '更长的标签'],\n  ]);\n");
    const unsorted = spawnSync(process.execPath, [fileURLToPath(new URL('./lint-overlay.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.equal(unsorted.status, 1);
    assert.match(unsorted.stdout, /未按源文长度倒序/);
    fs.writeFileSync(file, "const phrases = new Map([\n    ['Deny', '允许'],\n  ]);\n");
    const denied = spawnSync(process.execPath, [fileURLToPath(new URL('./lint-overlay.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.equal(denied.status, 1);
    assert.match(denied.stdout, /语义反转/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('issue 12 remaining settings labels and descriptions are localized', () => {
  for (const [input, expected] of [
    ['Manage project folders, agent settings, and permissions.', '管理项目文件夹、智能体设置和权限。'],
    ['Danger Zone', '危险操作'],
    ['Gemini 4 Argon Weekly Limit', 'Gemini 4 Argon 周额度'],
    ['Check availability, schedule events, and RSVP.', '查看空闲时间、安排活动并回复活动邀请。'],
    ['Read, draft, and edit docs.', '阅读、起草和编辑文档。'],
    ['Search, upload, download, and share files.', '搜索、上传、下载和共享文件。'],
    ['Read, write, and format spreadsheets.', '读取、写入电子表格并设置格式。'],
    ['Read, edit, and export presentations.', '阅读、编辑和导出演示文稿。'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
  for (const name of ['Google Calendar', 'Google Docs', 'Google Drive', 'Google Sheets', 'Google Slides', 'Gemini 4 Argon']) {
    assert.equal(translate(name), name);
  }
  assert.equal(translate('Gemini 99 Future Weekly Limit'), 'Gemini 99 Future Weekly Limit');
});

test('project deletion preserves arbitrary names and counts through repeated passes', () => {
  for (const name of ['明明研究中心', 'Last 7 days', '10 files', 'Inherit Global', 'Danger Zone', "a $& $$ $` $'", 'a including 2 active conversations.', 'a\nb', 'a“b”']) {
    for (const [count, noun] of [['0', 'conversations'], ['1', 'conversation'], ['3', 'conversations'], ['1000', 'conversations']]) {
      const input = ` Permanently delete ${name} including ${count} active ${noun}. `;
      const output = ` 永久删除项目“${name}”及其中的 ${count} 个活跃对话。 `;
      assert.equal(translate(input), output);
      assert.equal(translate(output), output);
    }
  }
  assert.equal(translate('Permanently delete Example including unknown active conversations.'), 'Permanently delete Example including unknown active conversations.');
});

function projectPermissionFixture(parts, label = 'Global Permissions', skipped = false) {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const link = { nodeType: 1, textContent: label, href: '/settings/permissions', onclick() {} };
  const more = { nodeType: 1, textContent: ' Learn more.', href: '/docs/permissions' };
  const nodes = parts.map(value => value === null ? link : { nodeType: 3, nodeValue: value });
  nodes.push(more);
  return {
    nodeType: 1, childNodes: nodes, link, more,
    get textContent() { return nodes.map(n => n.nodeType === 3 ? n.nodeValue : n.textContent).join(''); },
    closest(selector) { return skipped && selector.includes('script, style') ? this : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
}

test('project permissions preserve link identity, destinations and handlers', () => {
  for (const label of ['Global Permissions', '全局权限']) {
    for (const parts of [
      ['Also includes ', null, ' when working in this project.'],
      ['Also includes ', null, ' ', 'when working ', 'in this project', '.'],
    ]) {
      const el = projectPermissionFixture(parts, label);
      const originalNodes = [...el.childNodes];
      const handler = el.link.onclick;
      context.translateElementForTest(el);
      assert.equal(el.textContent, `在此项目中工作时，还包括${label}。 Learn more.`);
      assert.deepEqual(el.childNodes, originalNodes);
      assert.equal(el.link.onclick, handler);
      assert.equal(el.link.href, '/settings/permissions');
      assert.equal(el.more.href, '/docs/permissions');
      context.translateElementForTest(el);
      assert.equal(el.textContent, `在此项目中工作时，还包括${label}。 Learn more.`);
    }
  }
});

test('unknown project permission layouts and skipped content remain untouched', () => {
  for (const el of [
    projectPermissionFixture(['Also includes ', null, ' when working in this workspace.']),
    projectPermissionFixture(['Also includes ', null, ' when working in this project.'], 'Custom Permissions'),
    projectPermissionFixture(['Also includes ', null, ' when working in this project.'], 'Global Permissions', true),
  ]) {
    const original = el.textContent;
    context.translateElementForTest(el);
    assert.equal(el.textContent, original);
  }
  for (const selectorFragment of ['script, style', 'contenteditable', 'user-input-step']) {
    const text = { nodeType: 3, nodeValue: 'Danger Zone', parentElement: {
      closest(selector) { return selector.includes(selectorFragment) ? this : null; },
    } };
    context.translateNodeForTest(text);
    assert.equal(text.nodeValue, 'Danger Zone');
    assert.equal(text.__zh_patched, undefined);
  }
});

test('2.26.0 normal app model availability tooltips are localized', () => {
  for (const [input, expected] of [
    ['Sonnet 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 2, 2026.', 'Sonnet 5.5 已面向付费 Pro 与 Ultra 套餐开放。自 2026 年 11 月 2 日 起，您当前使用的套餐将不再提供第三方模型访问。'],
    ['Opus 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 2, 2026.', 'Opus 5.5 已面向付费 Pro 与 Ultra 套餐开放。自 2026 年 11 月 2 日 起，您当前使用的套餐将不再提供第三方模型访问。'],
    ['Gemini 4 Argon is currently available to Ultra and paid Pro plan subscribers.', 'Gemini 4 Argon 目前仅向 Ultra 及付费 Pro 套餐订阅用户开放。'],
    ['GPT-OSS will be removed from Antigravity on November 2, 2026.', 'GPT-OSS 将于 2026 年 11 月 2 日 从 Antigravity 中移除。'],
  ]) {
    assert.equal(translate(input), expected);
    // 模型名原样保留、日期转为中文格式，二次翻译必须幂等
    assert.equal(translate(expected), expected);
  }
});

test('2.26.0 normal app notification and project deletion toasts are localized', () => {
  assert.equal(translate('Dismiss notification'), '关闭通知');
  assert.equal(translate('Project deleted'), '项目已删除');
  assert.equal(translate('关闭通知'), '关闭通知');
  assert.equal(translate('项目已删除'), '项目已删除');
});

test('2.29.0 observed controls and marketplace text are localized', () => {
  for (const [input, expected] of [
    ['This Computer', '此电脑'], ['Remote', '远程'],
    ['Configure what the agent can do in local and remote conversations.', '配置智能体在本地和远程对话中可以执行的操作。'],
    ['Built-in Browser', '内置浏览器'], ['Voice mode', '语音模式'], ['Microphone', '麦克风'],
    ['Conversation Steps', '对话步骤'], ['Choose how much detail is shown during a conversation.', '选择对话过程中显示的详细程度。'],
    ['Search shortcuts...', '搜索快捷键...'], ['Reopen Closed Tab', '重新打开已关闭的标签页'],
    ['Uses your local files and tools. Schedules only.', '使用本地文件和工具，仅支持定时运行。'],
    ['Trigger', '触发条件'], ['Every weekday', '每个工作日'], ['Instructions', '指令'],
    ['Design, Creative & Media', '设计、创意与媒体'], ['More Plugins', '更多插件'],
    ['Search customizations...', '搜索自定义项...'],
    ["Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here.", '按计划运行提示词，例如每天早晨汇总昨天的更改。运行记录会显示在这里。'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('2.29.0 greeting and shortcut labels preserve dynamic values', () => {
  for (const name of ['A $& $$', 'Last 7 days', 'No Automations', '用户']) {
    const result = `你好，${name}，今天想完成什么？`;
    assert.equal(translate(`Hi ${name}, what can we get done today?`), result);
    assert.equal(translate(result), result);
  }
  for (const [input, expected] of [
    ['Shortcut ⌘[ for Go Back', '快捷键 ⌘[：后退'],
    ['Remove shortcut ⇧⌘T for Reopen Closed Tab', '移除快捷键 ⇧⌘T：重新打开已关闭的标签页'],
    ['Add shortcut for Move Conversation Up', '添加快捷键：上移对话'],
    ['Shortcut $& for unknown action', '快捷键 $&：unknown action'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('split automation empty state retains child identity and ignores unknown layouts', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  for (const start of ['No ', '否 ']) {
    const first = {nodeType: 3, nodeValue: start};
    const middle = {nodeType: 1, textContent: '自动化'};
    const last = {nodeType: 3, nodeValue: ' yet'};
    const children = [first, middle, last];
    const el = {nodeType: 1, childNodes: children,
      get textContent() { return children.map(n => n.nodeType === 3 ? n.nodeValue : n.textContent).join(''); },
      closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
    context.translateElementForTest(el);
    assert.equal(el.textContent, '暂无自动化');
    assert.equal(el.childNodes[1], middle);
    context.translateElementForTest(el);
    assert.equal(el.textContent, '暂无自动化');
  }
});

test('2.29.0 marketplace actions preserve plugin and category names', () => {
  for (const [input, expected] of [
    ['See more in Developer Tools', '查看更多：开发工具'],
    ['See more in 效率与项目管理', '查看更多：效率与项目管理'],
    ['Details for Context7', '查看详情：Context7'],
    ['Details for $& 10 files', '查看详情：$& 10 files'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('language toggle restores English originals and re-applies Chinese', () => {
  const store = new Map();
  const parent = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const text = { nodeType: 3, nodeValue: 'Give Feedback', parentElement: parent };
  const attrs = new Map([['title', 'Settings']]);
  const button = {
    nodeType: 1, parentElement: parent, closest() { return null; },
    getAttribute: (name) => attrs.get(name) ?? null, setAttribute: (name, value) => attrs.set(name, value),
  };
  const nodes = [parent, text, button];
  const doc = {
    nodeType: 9, readyState: 'loading', documentElement: { lang: 'en' },
    createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] ?? null }; },
  };
  const win = {
    addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' },
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
  };
  const ctx = { window: win, document: doc, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } };
  vm.createContext(ctx);
  vm.runInContext(source.replace('  function run() {', '  globalThis.setLangForTest = setLang; globalThis.applyChineseForTest = applyChinese;\n  function run() {'), ctx);

  ctx.applyChineseForTest(false);
  assert.equal(text.nodeValue, '提供反馈');
  assert.equal(attrs.get('title'), '设置');
  assert.equal(doc.documentElement.lang, 'zh-CN');

  ctx.setLangForTest('en');
  assert.equal(text.nodeValue, 'Give Feedback', '切回英文应还原文本原文');
  assert.equal(attrs.get('title'), 'Settings', '切回英文应还原属性原文');
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(store.get('antigravityHansLang'), 'en', '语言偏好应持久化');

  // 英文模式下应用自行更新文案，切回中文时以新文案为原文
  text.nodeValue = 'Open Editor Settings';
  ctx.setLangForTest('zh');
  assert.equal(text.nodeValue, '打开编辑器设置');
  assert.equal(attrs.get('title'), '设置');
  assert.equal(store.get('antigravityHansLang'), 'zh');

  // 中文模式下应用改写了文本：还原时不得用旧原文覆盖应用的新内容
  text.nodeValue = 'Delete plugin';
  ctx.setLangForTest('en');
  assert.equal(text.nodeValue, 'Delete plugin');
});

test('toggle button itself is never translated', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  let altered = false;
  const element = {
    nodeType: 1,
    closest(selector) { return selector.includes('[data-agy-hans-ui]') ? this : null; },
    getAttribute() { return 'Switch to English (Antigravity-Hans)'; },
    setAttribute() { altered = true; },
  };
  context.translateElementForTest(element);
  assert.equal(altered, false);
});

test('custom translations keep English or apply user wording', () => {
  const ctx = {
    window: {
      addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' },
      __antigravityZhCustom: [['  request review ', ''], ['Turbo', '快速模式'], ['Default', 'Auto 模式'], ['', 'x'], 'bad', [42, null]],
    },
    document: { readyState: 'loading' },
  };
  vm.createContext(ctx);
  vm.runInContext(source.replace('  function run() {', '  globalThis.translateForTest = translate;\n  function run() {'), ctx);
  const t = ctx.translateForTest;
  assert.equal(t('Request Review'), 'Request Review', '译文为空：保留英文，匹配忽略大小写与首尾空白');
  assert.equal(t(' Turbo '), ' 快速模式 ', '使用自定义译文并保留首尾空白');
  assert.equal(t('快速模式'), '快速模式');
  assert.equal(t('Default'), 'Auto 模式');
  assert.equal(t('Auto 模式'), 'Auto 模式', '含英文的自定义译文不会被二次翻译');
  assert.equal(t('42'), '42');
  assert.equal(t('Every command requires approval.'), '每条命令都需要审核。', '名单外照常翻译');
  // 未注入名单时行为不变
  assert.equal(translate('Request Review'), '请求审核');
  assert.equal(translate('Turbo'), '极速');
});

test('English dates inside translated text become Chinese year/month/day', () => {
  for (const [input, expected] of [
    ['GPT-OSS will be removed from Antigravity on November 18, 2026.', 'GPT-OSS 将于 2026 年 11 月 18 日 从 Antigravity 中移除。'],
    ['GPT-OSS will be removed from Antigravity on Sept 3rd, 2027.', 'GPT-OSS 将于 2027 年 9 月 3 日 从 Antigravity 中移除。'],
    ['GPT-OSS will be removed from Antigravity on Jan. 5.', 'GPT-OSS 将于 1 月 5 日 从 Antigravity 中移除。'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
  // 纯英文（未翻译/用户数据）中的日期保持原样；非法日期与小写单词不改写
  assert.equal(translate('Released on November 18, 2026 by the team'), 'Released on November 18, 2026 by the team');
  assert.equal(translate('GPT-OSS will be removed from Antigravity on November 45.'), 'GPT-OSS 将于 November 45 从 Antigravity 中移除。');
  assert.equal(translate('Requesting permission to read /tmp/May 5, 2026.txt'), '正在请求权限：读取 /tmp/May 5, 2026.txt');
});

test('2.30.0 permission and model menu tooltips are localized', () => {
  for (const [input, expected] of [
    ['Only this conversation uses this preset.', '仅当前对话使用此预设。'],
    ['Your This Computer setting', '您在“此电脑”中的设置'],
    ['This Conversation', '当前对话'],
    ['Limited time', '限时提供'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('built-in "keep English labels" preset is off by default and toggles live', () => {
  const store = new Map();
  const parent = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const make = (value) => ({ nodeType: 3, nodeValue: value, parentElement: parent });
  const turbo = make('Turbo');
  const desc = make('Run all commands without restrictions.');
  const high = make('High');
  const title = make('This Conversation');
  const nodes = [parent, turbo, desc, high, title];
  const build = (custom) => {
    const doc = {
      nodeType: 9, readyState: 'loading', documentElement: { lang: 'en' },
      createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] ?? null }; },
    };
    const win = {
      addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' },
      localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
      __antigravityZhCustom: custom,
    };
    const ctx = { window: win, document: doc, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } };
    vm.createContext(ctx);
    vm.runInContext(source.replace('  function run() {', '  globalThis.hooks = { setEnglishLabels, applyChinese, setLang };\n  function run() {'), ctx);
    return ctx.hooks;
  };
  const snapshot = () => [turbo, desc, high, title].map((n) => n.nodeValue).join(' | ');

  let hooks = build([]);
  hooks.applyChinese(false);
  assert.equal(snapshot(), '极速 | 无限制运行所有命令。 | 高 | 当前对话', '默认关闭：全部汉化');

  hooks.setEnglishLabels(true);
  assert.equal(snapshot(), 'Turbo | 无限制运行所有命令。 | High | This Conversation', '开启：选项名英文、说明中文');
  assert.equal(store.get('antigravityHansEnglishLabels'), '1');

  hooks.setLang('en');
  assert.equal(snapshot(), 'Turbo | Run all commands without restrictions. | High | This Conversation');
  hooks.setLang('zh');
  assert.equal(snapshot(), 'Turbo | 无限制运行所有命令。 | High | This Conversation');

  hooks.setEnglishLabels(false);
  assert.equal(snapshot(), '极速 | 无限制运行所有命令。 | 高 | 当前对话', '关闭后恢复全部汉化');

  // 偏好持久化：新实例读取已开启的偏好；个人名单优先于预设
  store.set('antigravityHansEnglishLabels', '1');
  turbo.nodeValue = 'Turbo'; desc.nodeValue = 'Run all commands without restrictions.'; high.nodeValue = 'High'; title.nodeValue = 'This Conversation';
  hooks = build([['Turbo', '快速模式']]);
  hooks.applyChinese(true);
  assert.equal(snapshot(), '快速模式 | 无限制运行所有命令。 | High | This Conversation');
});
