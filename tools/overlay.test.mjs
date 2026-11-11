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
vm.runInContext(source.replace('  function run() {', '  globalThis.translateForTest = translate; globalThis.translateElementForTest = translateElement; globalThis.translateNodeForTest = translateNode; globalThis.isInAntigravityContainerForTest = isInAntigravityContainer; globalThis.createFlushSchedulerForTest = createFlushScheduler; globalThis.restoreProtectedCustomizationNamesForTest = restoreProtectedCustomizationNames; globalThis.translateKnownSlashDescriptionForTest = translateKnownSlashDescription;\n  function run() {'), context);
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

test('2.6.0 IDE settings options and placeholders preserve commands and identifiers', () => {
  const pairs = [
    ['Bottom Panel', '底部面板'],
    ['Side Panel', '侧边面板'],
    ['Antigravity Settings', 'Antigravity 设置'],
    ['Antigravity Tab Settings', 'Antigravity 标签页设置'],
    ['Tab Settings', '标签页设置'],
    ['Settings - ', '设置 - '],
    ['Voice engine', '语音引擎'],
    ['Voice engine address', '语音引擎地址'],
    ['Default (Mendel)', '默认（Mendel）'],
    ['Whatever the voice-engine-addr flag serves you.', '使用由 voice-engine-addr 参数提供的语音引擎。'],
    ['Type a voice variant name, such as rev27.', '输入语音变体名称，例如 rev27。'],
    ['Git-on-Borg repository used when creating a new Cog workspace from your initial prompt (e.g., chromium/src or android/platform/superproject).', '用于根据你的初始提示创建 Cog 工作区的 Git-on-Borg 仓库（例如 chromium/src 或 android/platform/superproject）。'],
    ['Optional branch or ref used when creating a new Cog workspace (defaults to main if unset).', '创建新 Cog 工作区时可选的分支或引用（未设置时默认为 main）。'],
    ['e.g., chromium/src', '例如 chromium/src'],
    ['e.g., main or refs/heads/main', '例如 main 或 refs/heads/main'],
    ['example:\nsource ~/.jetski_shell_setup', '示例：\nsource ~/.jetski_shell_setup'],
    ['example:\r\nsource ~/.jetski_shell_setup', '示例：\r\nsource ~/.jetski_shell_setup'],
  ];
  for (const [input, expected] of pairs) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected, 'observer reprocessing changed the translation');
  }
  for (const name of ['Fig', 'Piper (g4)', 'Cog (GoB)', 'Google Chrome', 'chromium/src', 'refs/heads/main']) {
    assert.equal(translate(name), name);
  }
});

test('2.6.0 IDE account, quota and settings controls are localized', () => {
  const pairs = [
    ['You cannot sign out from Remote Control. Please sign out on your local application.', '无法通过远程控制退出登录。请在本地应用中退出登录。'],
    ['You are logged in using Application Default Credentials (ADC). To log out, undo any changes to ~/.gemini/config/config.json (or unset AGY_ADC_AUTH if launched from terminal) and restart the application.', '你使用应用默认凭据（ADC）登录。如需退出，请撤销对 ~/.gemini/config/config.json 的修改（如果从终端启动，也可取消设置 AGY_ADC_AUTH），然后重启应用。'],
    ['You are logged in using environment credentials and cannot sign out from the application.', '你使用环境凭据登录，无法在应用中退出登录。'],
    ['Enterprise Gateway', '企业网关'], ['Your Plan', '你的套餐'],
    ['Authenticated via Enterprise Gateway', '已通过企业网关身份验证'],
    ['Google One Referral', 'Google One 推荐计划'], ['Invite a Friend', '邀请好友'],
    ['Project Required', '需要项目'], ['License Required', '需要许可证'],
    ['A Google Cloud project is required to use Antigravity.', '使用 Antigravity 需要 Google Cloud 项目。'],
    ['A license or project selection is required to use Antigravity.', '使用 Antigravity 需要许可证或选择项目。'],
    ['Manage License', '管理许可证'], ['Signing Out...', '正在退出登录...'], ['Sign In', '登录'],
    ['See Activity', '查看活动记录'], ['Get More AI Credits', '获取更多 AI 积分'],
    ['For Antigravity Business consumption options, see', '有关 Antigravity Business 的用量选项，请参阅'],
    ['documentation', '文档'], ['Reset all shortcuts to defaults', '将所有快捷键恢复为默认值'],
    ['Resources', '资源'], ['No resources added yet.', '尚未添加资源。'],
    ['No folders added yet.', '尚未添加文件夹。'], ['Google3 Configuration', 'Google3 配置'],
    ['No project selected or project management not available.', '未选择项目，或项目管理不可用。'],
    ['Copied to clipboard', '已复制到剪贴板'], ['Show Less', '收起'],
    ['Open settings menu', '打开设置菜单'], ['Dismiss error', '关闭错误提示'],
    ['Duplicate project name', '项目名称重复'], ['Duplicate workspace name', '工作区名称重复'],
    ['Failed to resolve folder', '无法定位文件夹'],
    ['Sign in from the Antigravity panel.', '请在 Antigravity 面板中登录。'],
    ['Sign in to use Antigravity!', '登录后即可使用 Antigravity！'],
  ];
  for (const [input, expected] of pairs) {
    assert.equal(translate(input), expected, input);
    assert.equal(translate(expected), expected, 'observer reprocessing changed the translation');
  }
  const path = "C:/Last 7 days/10 files/$& $'";
  const output = translate(`Failed to resolve folder: ${path} (permission denied)`);
  assert.equal(output, `无法定位文件夹：${path} (permission denied)`);
  assert.equal(translate(output), output, 'folder path changed on reprocessing');
});

test('ambiguous control labels use their actual interface context', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  assert.equal(translate('Type'), '类型');
  assert.equal(translate('View'), '查看');
  assert.equal(translate('Plan'), '套餐');
  assert.equal(translate('Scheduled'), '定时运行');
  assert.equal(translate('Choose where links open by default when clicked.'), '选择点击链接时默认在哪里打开。');
  const planHint = {
    nodeType: 1,
    closest(selector) { return selector === '[data-testid="plan-command-fyi-alert"]' ? this : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
  const verb = { nodeType: 3, nodeValue: 'Type ', parentElement: planHint };
  context.translateNodeForTest(verb);
  assert.equal(verb.nodeValue, '输入 ');
  const code = {
    nodeType: 1,
    closest(selector) { return selector.includes('script, style, code') ? this : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
  const command = { nodeType: 3, nodeValue: 'plan', parentElement: code };
  context.translateNodeForTest(command);
  assert.equal(command.nodeValue, 'plan');

  const carousel = {
    nodeType: 1,
    closest(selector) { return selector === '.carousel' ? this : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
  const nextSlide = { nodeType: 3, nodeValue: 'Next', parentElement: carousel };
  const previousSlide = { nodeType: 3, nodeValue: 'Previous', parentElement: carousel };
  context.translateNodeForTest(nextSlide);
  context.translateNodeForTest(previousSlide);
  assert.equal(nextSlide.nodeValue, '下一项');
  assert.equal(previousSlide.nodeValue, '上一项');

  const nextRunLabel = {
    nodeType: 1, closest() { return null; },
    nextElementSibling: { matches(selector) { return selector === '[data-testid="automation-next-run"]'; } },
    getAttribute() { return null; }, setAttribute() {},
  };
  const nextRun = { nodeType: 3, nodeValue: 'Next', parentElement: nextRunLabel };
  context.translateNodeForTest(nextRun);
  assert.equal(nextRun.nodeValue, '下次');

  const mediaAttrs = new Map([['aria-label', 'Next (→)']]);
  const mediaButton = {
    nodeType: 1,
    closest(selector) { return selector === '[data-testid="media-modal-next"]' ? this : null; },
    getAttribute(name) { return mediaAttrs.get(name) ?? null; },
    setAttribute(name, value) { mediaAttrs.set(name, value); },
  };
  context.translateElementForTest(mediaButton);
  assert.equal(mediaAttrs.get('aria-label'), '下一项 (→)');
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

test('IDE settings tab is whitelisted without opening ordinary file tabs', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const originalLocation = context.window.location;
  context.window.location = { pathname: '/workbench.html', href: 'vscode-file://vscode-app/workbench.html' };
  const tab = (resource, label) => ({
    nodeType: 1,
    closest: (selector) => selector.includes(`.tabs-container .tab[data-resource-name="${resource}"][aria-label="${label}"]`) ? {} : null,
  });
  try {
    assert.equal(context.isInAntigravityContainerForTest(tab('global', 'Antigravity Settings')), true);
    assert.equal(context.isInAntigravityContainerForTest(tab('global', 'Antigravity 设置')), true);
    assert.equal(context.isInAntigravityContainerForTest(tab('project-file', 'Antigravity Settings')), false);
    assert.equal(context.isInAntigravityContainerForTest(tab('global', 'unrelated file')), false);
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
    querySelectorAll() { return []; },
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

test('2.30.0 Turbo permission, full access descriptions and long texts are localized', () => {
  for (const [input, expected] of [
    ['Turbo mode', '极速模式'],
    ['Turbo', '极速'],
    ['Disables all safety barriers for maximal iteration velocity.', '禁用所有安全屏障，以最大程度提高迭代速度。'],
    ['Run all commands without restrictions.', '不受限制地运行所有命令。'],
    ['Always Proceed', '始终继续'],
    ['Always Ask', '始终询问'],
    ['Full access', '完整访问权限'],
    ['When Turbo mode is on, the agent will automatically capture screenshots in the Browser without explicit user input. You can toggle this setting in Antigravity\'s settings.', '开启 Turbo 模式后，智能体将在浏览器中自动截图，无需用户明确操作。你可以在 Antigravity 设置中调整此项。'],
    ['Context and Quota Indicator', '上下文与配额指示器'],
    ['Show how full the context window is next to the send button. Click it for a breakdown and to see your model quota.', '在发送按钮旁显示上下文窗口的使用进度。点击可查看明细及模型配额。'],
    ['Enter to Send', '按 Enter 发送'],
    ['Screen Reader Mode', '屏幕阅读器模式'],
    ['Link Settings', '链接设置'],
    ['Commands Outside Sandbox', '沙盒外命令执行'],
    ['Allow/deny agent browser file downloads from specific sites.', '允许或拒绝智能体浏览器从特定网站下载文件。'],
    ['Keep In Menu Bar', '保留在菜单栏'],
    ['Enable Remote Control', '启用远程控制'],
    ['CitC Workspace Type', 'CitC 工作区类型'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('2.30.0 policy and data descriptions preserve their meaning and identifiers', () => {
  const cases = [
    [
      'A high-risk mode that disables all safety barriers. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts.',
      '一种禁用所有安全屏障的高风险模式。智能体将以完全系统访问权限运行，自动执行所有终端命令，读写所有本地文件，且不弹出审查提示。',
    ],
    [
      'Useful for tasks that require file access across your full machine. The agent has full read and write access to all local files, but all proposed terminal commands require manual review and approval before running.',
      '适用于需要在整机范围内访问文件的任务。智能体对所有本地文件具有完全读写权限，但在执行任何终端命令前均需手动审查与批准。',
    ],
    [
      'Requires manual review for all terminal commands and file accesses outside of the working folders.',
      '所有终端命令以及工作文件夹之外的文件访问均需人工审查。',
    ],
    [
      'Enforce settings that prevent the agent from autonomously running targeted exploits and require human review for all agent actions. Visit antigravity.google/docs/strict-mode for details.',
      '强制启用安全设置，防止智能体自主执行针对性的漏洞利用，并要求所有智能体操作均经过人工审核。详情请访问 antigravity.google/docs/strict-mode。',
    ],
    [
      'Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content.',
      '智能体从不请求审核。这能最大限度提高自主性，但智能体处理不安全或被注入恶意内容的产物时执行操作的风险也最高。',
    ],
    [
      'View your available model quota and AI credits. Model quota refreshes periodically based on your plan. Enable AI Credit Overages to continue using models when your quota is exhausted.',
      '查看可用的模型额度和 AI 积分。模型额度会根据你的套餐定期刷新。启用 AI 积分超额使用后，可在额度耗尽时继续使用模型。',
    ],
    [
      'Permanently delete your remote conversations, projects, scheduled tasks, connected plugins and settings. Data in the desktop app and your Google account are not affected.',
      '永久删除你的远程会话、项目、定时任务、已连接的插件及设置。桌面客户端本地数据及你的 Google 账号不受影响。',
    ],
    [
      'Hook will only trigger if the tool name matches run_command or view_file.',
      '仅当工具名称匹配 run_command 或 view_file 时触发钩子。',
    ],
    [
      'Sets the `workspaceUri` URL parameter and reloads, repointing the active workspace. Pick a folder from an existing project or enter a custom URI (e.g. file:///path/to/workspace).',
      '设置 `workspaceUri` URL 参数并重新加载以重定向活动工作区。请从现有项目中选择文件夹，或输入自定义 URI（例如 file:///path/to/workspace）。',
    ],
  ];
  for (const [input, expected] of cases) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('2.30.0 queued message tooltip preserves Windows and macOS shortcuts', () => {
  for (const key of ['Enter', 'Alt+Enter', '⏎', '⌥⏎']) {
    for (const [description, chinese] of [
      ['Queues after the turn', '当前轮次结束后排队发送'],
      ['Sends immediately', '立即发送'],
    ]) {
      const expected = `${key} ${chinese}`;
      assert.equal(translate(`${key} ${description}`), expected);
      assert.equal(translate(expected), expected);
    }
  }
  for (const key of ['Alt+Enter', '⌥⏎']) {
    const expected = `${key} 提示词为空时发送队列中的下一条消息`;
    assert.equal(translate(`${key} On empty prompt, sends next in queue`), expected);
    assert.equal(translate(expected), expected);
  }
  assert.equal(translate('  Enter Queues after the turn  '), '  Enter 当前轮次结束后排队发送  ');
  assert.equal(translate('Ctrl+Enter Queues after the turn'), 'Ctrl+Enter Queues after the turn');

  // 动态出现的 tooltip 文本节点也必须经过同一条翻译路径。
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  const tooltip = { nodeType: 1, closest() { return null; } };
  const text = { nodeType: 3, parentElement: tooltip, nodeValue: 'Alt+Enter Sends immediately' };
  context.translateNodeForTest(text);
  assert.equal(text.nodeValue, 'Alt+Enter 立即发送');
});

test('updating an existing overlay revisits previously untranslated tooltips', () => {
  const parent = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const text = { nodeType: 3, parentElement: parent, nodeValue: 'Enter Queues after the turn', __zh_patched: true };
  const nodes = [parent, text];
  const document = {
    nodeType: 9, readyState: 'loading', documentElement: { lang: 'en' },
    querySelectorAll() { return []; },
    createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] ?? null }; },
  };
  const window = {
    addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' },
    localStorage: { getItem() { return null; }, setItem() {} },
  };
  const fresh = { window, document, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } };
  vm.createContext(fresh);
  vm.runInContext(source.replace('  function run() {', '  globalThis.applyChineseForTest = applyChinese; globalThis.setLangForTest = setLang;\n  function run() {'), fresh);
  fresh.applyChineseForTest(true);
  assert.equal(text.nodeValue, 'Enter 当前轮次结束后排队发送');
  fresh.setLangForTest('en');
  assert.equal(text.nodeValue, 'Enter Queues after the turn');
});

test('hot update replaces old translations without overwriting application changes', () => {
  const attrs = new Map([['title', '完全访问']]);
  const parent = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const type = { nodeType: 3, nodeValue: '输入', parentElement: parent, __zh_patched: true };
  const edited = { nodeType: 3, nodeValue: '应用已修改', parentElement: parent, __zh_patched: true };
  const button = {
    nodeType: 1, parentElement: parent, closest() { return null; },
    getAttribute(name) { return attrs.get(name) ?? null; },
    setAttribute(name, value) { attrs.set(name, value); },
  };
  const nodes = [parent, type, edited, button];
  const document = {
    nodeType: 9, readyState: 'loading', body: {}, documentElement: { lang: 'zh-CN' },
    querySelectorAll() { return []; },
    createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] ?? null }; },
  };
  let cleanupCalled = false;
  const window = {
    addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' },
    localStorage: { getItem() { return null; }, setItem() {} },
    __antigravityZhPatchInstalled: true, __observedDocument: document, __antigravityZhPatchFingerprint: 'old',
    __antigravityZhPatchCleanup() { cleanupCalled = true; },
    __antigravityZhOriginals: { texts: new WeakMap(), attrs: new WeakMap() },
  };
  window.__antigravityZhOriginals.texts.set(type, { orig: 'Type', zh: '输入' });
  window.__antigravityZhOriginals.texts.set(edited, { orig: 'Settings', zh: '设置' });
  window.__antigravityZhOriginals.attrs.set(button, new Map([['title', { orig: 'Full access', zh: '完全访问' }]]));
  class FakeMutationObserver { observe() {} disconnect() {} }
  const fresh = { window, document, MutationObserver: FakeMutationObserver, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } };
  vm.createContext(fresh);
  const instrumented = source.replace('  function run() {', '  globalThis.runForTest = run;\n  function run() {').replace('    mountToggleUI();', '');
  vm.runInContext(instrumented, fresh);
  fresh.runForTest();
  assert.equal(cleanupCalled, true);
  assert.equal(type.nodeValue, '类型');
  assert.equal(attrs.get('title'), '完整访问权限');
  assert.equal(edited.nodeValue, '应用已修改');
});

test('browser rule descriptions preserve the browser link and command', () => {
  const full = 'Configure allowed and denied URLs for the browser subagent. It runs in the built-in browser, so no separate browser install is needed.';
  const fullTranslation = '配置浏览器子智能体允许和拒绝访问的网址。它在内置浏览器中运行，因此无需单独安装浏览器。';
  assert.equal(translate(full), fullTranslation);
  assert.equal(translate(fullTranslation), fullTranslation);

  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  const parent = { nodeType: 1, closest() { return null; } };
  const text = { nodeType: 3, parentElement: parent, nodeValue: 'Configure allowed and denied URLs for the browser subagent (invoked with /browser). Requires' };
  const link = { nodeType: 1, textContent: 'Google Chrome', href: 'https://www.google.com/chrome/' };
  const children = [text, { nodeType: 3, nodeValue: ' ' }, link, { nodeType: 3, nodeValue: '.' }];
  parent.childNodes = children;
  context.translateNodeForTest(text);
  assert.equal(text.nodeValue, '配置浏览器子智能体（通过 /browser 调用）允许和拒绝访问的网址。需要');
  assert.equal(parent.childNodes[2], link);
  assert.equal(link.href, 'https://www.google.com/chrome/');
});

test('2.30.0 customization screens and observed skill descriptions are localized', () => {
  for (const [input, expected] of [
    ['Interface Layout', '界面布局'],
    ['There are no customizations enabled.', '没有启用任何自定义项。'],
    ['No customizations match your search.', '没有与搜索条件匹配的自定义项。'],
    ['Loading customizations...', '正在加载自定义项...'],
    ["Couldn't edit queued message", '无法编辑排队中的消息'],
    ["It was already sent or couldn't be removed from the queue.", '该消息已发送，或无法从队列中移除。'],
    ['Permanently delete', '永久删除'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
  const descriptions = [
    [
      "Guidelines for interacting with GitHub and request permissions from the user when commands fail due to restrictions in the agent environment.",
      ['GitHub', '命令', '限制', '请求权限'],
    ],
    [
      "How to manage and create plugins — namespaced bundles of skills, agents, rules, MCP servers and hooks that install, enable and disable as a single unit. Use this skill when the user wants to enable, disable, install or uninstall a plugin, when they want to create a new plugin, or when a new customization should be packaged into a plugin rather than left loose. Also triggered by the /plugin slash command. Don't use for the underlying customization system itself — discovery roots, loading priority, or authoring a standalone skill, agent, rule, hook or MCP server outside a plugin; see the customizations guide skill for those.",
      ['/plugin', 'MCP', '不要', '加载优先级'],
    ],
    [
      "How to write and run a dynamic workflow script with the `run_workflow` tool: a Python script that orchestrates many agents with `agent`, `parallel`, `pipeline`, and `phase`. Use when a task splits into many independent or staged pieces of agent work (fan out over files, modules, bugs, or review angles, then aggregate), or when the user asks for a workflow. Don't use for a single delegated task (use a subagent) or for legacy workflow files (see migrate-workflows).",
      ['`run_workflow`', '`agent`', '`parallel`', '`pipeline`', '`phase`', 'migrate-workflows', '不要'],
    ],
    [
      "Discover UI plugin panels relevant to the current task and surface a one-click pill in chat to open (toggle) them in the side pane. Use when a running UI plugin's panel would help with what the user is doing, or right after the user enables a new UI plugin pane and a shortcut to open it is handy.",
      ['侧边面板', '一键按钮', '界面插件'],
    ],
  ];
  for (const [input, importantParts] of descriptions) {
    const result = translate(input);
    assert.notEqual(result, input);
    for (const part of importantParts) assert.ok(result.includes(part), `缺少 ${part}`);
    assert.equal(translate(result), result);
  }
  for (const name of ['permissioned-github', 'plugin', 'run-workflow', 'ui-plugin-navigation']) {
    assert.equal(translate(name), name, '技能标识符应保持原样');
  }
});

test('2.30.0 controls across browser, account, workspace and tasks are localized', () => {
  for (const [input, expected] of [
    ['View site information', '查看网站信息'],
    ['Your connection is not private', '你的连接不是私密连接'],
    ["This page is blocked in the built-in browser by your organization's Context-Aware Access policy.", '此页面因组织的上下文感知访问政策而被内置浏览器阻止。'],
    ['Terminal Placement', '终端位置'],
    ['Pay As You Go', '按量付费'],
    ['Delete All Remote Agents Data?', '删除所有远程智能体数据？'],
    ['Services this plugin connects to on your behalf. Credentials stay on this machine and are only sent to the domains listed.', '此插件代表你连接的服务。凭据保留在本机，只会发送到所列域名。'],
    ['Remove resource', '移除资源'],
    ['Fork in New Workspace', '在新工作区中派生'],
    ['No files or folders found', '未找到文件或文件夹'],
    ['Unsandboxed commands', '沙盒外命令'],
    ['No events recorded.', '没有事件记录。'],
    ['Where should it run?', '应该在哪里运行？'],
    ['Grant create, update, or delete access to specific branches.', '授予对指定分支的创建、更新或删除权限。'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
});

test('project conversation counts translate without changing unknown templates', () => {
  for (const [input, expected] of [
    ['1 active conversation', '1 个活跃对话'],
    ['3 active conversations and 2 archived conversations', '3 个活跃对话和 2 个已归档对话'],
    ['1 archived conversation', '1 个已归档对话'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
  assert.equal(translate('1 archived conversation and 2 archived conversations'), '1 archived conversation and 2 archived conversations');
});

test('dynamic aria labels preserve names, paths and replacement metacharacters', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  const target = "Last 7 days $& $$ $` $'";
  const cases = [
    [`Open ${target} skill`, `打开技能：${target}`],
    [`${target}. View site information`, `查看网站信息：${target}`],
    [`Show ${target} in folder`, `在文件夹中显示：${target}`],
    [`Remove ${target} from list`, `从列表中移除：${target}`],
    [`More actions for ${target}`, `更多操作：${target}`],
    [`Toggle ${target}`, `切换：${target}`],
    [`Install ${target}`, `安装：${target}`],
    [`Version ${target}`, `版本：${target}`],
    [`Cost summary: ${target}`, `费用摘要：${target}`],
    [`${target}. Switch mic`, `切换麦克风：${target}`],
    [`${target} CEL values`, `CEL 值：${target}`],
    [`Shortcut Ctrl+K for ${target}`, `快捷键 Ctrl+K：${target}`],
    [`Remove shortcut Ctrl+K for ${target}`, `移除快捷键 Ctrl+K：${target}`],
    [`Add shortcut for ${target}`, `添加快捷键：${target}`],
    [`Edit comment: ${target}`, `编辑评论：${target}`],
    [`Open URL in system browser: ${target}`, `在系统浏览器中打开网址：${target}`],
    [`Authorization code for ${target}`, `授权代码：${target}`],
    [`Enable ${target} tool for Example`, `启用工具：${target}（Example）`],
    [`Disable ${target} tool for Example`, `停用工具：${target}（Example）`],
    [`Scroll to: ${target} on page 7`, `滚动到第 7 页：${target}`],
    [`Select project, current: ${target}`, `选择项目，当前：${target}`],
    ['Select project, current: No Project', '选择项目，当前：无项目'],
    [`Delete ${target}`, `删除：${target}`],
    ['Open File', '打开文件'],
    ['Playback speed 1.5x', '播放速度：1.5x'],
    ['Voice Name, voice 2 of 5', '语音：Voice Name（2 / 5）'],
    ['+3 more', '还有 3 项'],
    ['Question 2 of 5', '问题 2 / 5'],
    ['Page 3 failed to load', '第 3 页加载失败'],
    ['Go to page 12', '转到第 12 页'],
  ];
  for (const [input, expected] of cases) {
    const attrs = new Map([['aria-label', input]]);
    const element = {
      nodeType: 1, closest() { return null; },
      getAttribute(name) { return attrs.get(name) ?? null; },
      setAttribute(name, value) { attrs.set(name, value); },
    };
    context.translateElementForTest(element);
    assert.equal(attrs.get('aria-label'), expected, input);
    context.translateElementForTest(element);
    assert.equal(attrs.get('aria-label'), expected, '重复处理不得改变变量');
  }
});

test('user-supplied names in application controls are never translated', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  for (const testId of ['file-title-name', 'branch-pill-label', 'branch-repo-label', 'automation-name', 'webview-download-filename', 'side-question-tab-header-name', 'subagent-tab-header-title', 'resource-link']) {
    const parent = {
      nodeType: 1,
      closest(selector) { return selector.includes(`data-testid="${testId}"`) ? this : null; },
      getAttribute() { return null; }, setAttribute() {},
    };
    const text = { nodeType: 3, parentElement: parent, nodeValue: 'Owner' };
    context.translateNodeForTest(text);
    assert.equal(text.nodeValue, 'Owner', testId);
  }
  const skill = {
    nodeType: 1,
    matches(selector) { return selector === 'span[data-tooltip-id].text-sm.font-medium.truncate'; },
    closest(selector) { return selector === '[data-testid="workspace-customizations-view"]' ? this : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
  const skillName = { nodeType: 3, parentElement: skill, nodeValue: 'Owner' };
  context.translateNodeForTest(skillName);
  assert.equal(skillName.nodeValue, 'Owner');

  const project = { getAttribute(name) { return name === 'data-project-label' ? 'Owner' : null; } };
  const projectLabel = {
    nodeType: 1, matches() { return false; },
    closest(selector) { return selector.includes('[data-testid="project-header"][data-project-label]') ? project : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
  const projectName = { nodeType: 3, parentElement: projectLabel, nodeValue: 'Owner' };
  context.translateNodeForTest(projectName);
  assert.equal(projectName.nodeValue, 'Owner');

  const ordinary = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const uiLabel = { nodeType: 3, parentElement: ordinary, nodeValue: 'Owner' };
  context.translateNodeForTest(uiLabel);
  assert.equal(uiLabel.nodeValue, '所有者');
});

test('IDE settings customization names are restored and protected on update', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  context.NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
  const attrs = new Map([['title', '设置']]);
  const nameElement = {
    nodeType: 1,
    closest(selector) {
      return selector.includes('[data-testid="workspace-customizations-view"]') &&
        selector.includes('.group.flex.items-start.justify-between') ? this : null;
    },
    getAttribute(name) { return attrs.get(name) ?? null; },
    setAttribute(name, value) { attrs.set(name, value); },
  };
  const name = { nodeType: 3, nodeValue: '设置', parentElement: nameElement };
  const changedByApp = { nodeType: 3, nodeValue: '应用新名称', parentElement: nameElement };
  const originals = context.window.__antigravityZhOriginals;
  originals.texts.set(name, { orig: 'Settings', zh: '设置' });
  originals.texts.set(changedByApp, { orig: 'Owner', zh: '所有者' });
  originals.attrs.set(nameElement, new Map([['title', { orig: 'Settings', zh: '设置' }]]));
  const oldQuery = context.document.querySelectorAll;
  const oldWalker = context.document.createTreeWalker;
  try {
    context.document.querySelectorAll = () => [nameElement];
    context.document.createTreeWalker = () => {
      const nodes = [name, changedByApp]; let i = 0;
      return { nextNode: () => nodes[i++] ?? null };
    };
    context.restoreProtectedCustomizationNamesForTest();
    assert.equal(name.nodeValue, 'Settings');
    assert.equal(attrs.get('title'), 'Settings');
    assert.equal(changedByApp.nodeValue, '应用新名称');
    context.translateNodeForTest(name);
    assert.equal(name.nodeValue, 'Settings');
    assert.equal(originals.texts.has(name), false);
  } finally {
    context.document.querySelectorAll = oldQuery;
    context.document.createTreeWalker = oldWalker;
  }
});

test('split project deletion description translates including and preserves names', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  for (const name of ['Antigravity-Hans', 'Owner', 'including', "Last 7 days $& $'", 'a including 2 active conversations']) {
    for (const prefixValue of ['Permanently delete', '永久删除']) {
      for (const [countValue, expectedCount] of [
        ['1 active conversation', '1 个活跃对话'],
        ['1 个活跃对话', '1 个活跃对话'],
        ['2 active conversations and 3 archived conversations', '2 个活跃对话和 3 个已归档对话'],
      ]) {
        const parent = { nodeType: 1, tagName: 'SPAN', closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
        const prefix = { nodeType: 3, nodeValue: prefixValue, parentElement: parent };
        const space = { nodeType: 3, nodeValue: ' ', parentElement: parent };
        const project = { nodeType: 1, tagName: 'STRONG', parentElement: parent, closest(selector) { return selector === 'strong' ? this : null; } };
        const projectText = { nodeType: 3, nodeValue: name, parentElement: project };
        const join = { nodeType: 3, nodeValue: ' including ', parentElement: parent };
        const count = { nodeType: 1, tagName: 'STRONG', parentElement: parent, closest(selector) { return selector === 'strong' ? this : null; } };
        const countText = { nodeType: 3, nodeValue: countValue, parentElement: count };
        const period = { nodeType: 3, nodeValue: '.', parentElement: parent };
        parent.childNodes = [prefix, space, project, join, count, period];
        context.translateElementForTest(parent);
        context.translateNodeForTest(prefix);
        context.translateNodeForTest(projectText);
        context.translateNodeForTest(countText);
        assert.equal(prefix.nodeValue, '永久删除');
        assert.equal(projectText.nodeValue, name);
        assert.equal(join.nodeValue, ' 包含 ');
        assert.equal(countText.nodeValue, expectedCount);
        assert.equal(period.nodeValue, '。');
        assert.equal(parent.childNodes[2], project);
        assert.equal(parent.childNodes[4], count);
        context.translateElementForTest(parent);
        assert.equal(join.nodeValue, ' 包含 ');
        // React 可能重新写回英文片段；重新扫描父节点应再次翻译。
        join.nodeValue = ' including ';
        context.translateElementForTest(parent);
        assert.equal(join.nodeValue, ' 包含 ');
      }
    }
  }

  const bare = { nodeType: 1, tagName: 'SPAN', closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const barePrefix = { nodeType: 3, nodeValue: 'Permanently delete', parentElement: bare };
  const bareSpace = { nodeType: 3, nodeValue: ' ', parentElement: bare };
  const bareName = { nodeType: 1, tagName: 'STRONG', parentElement: bare, closest(selector) { return selector === 'strong' ? this : null; } };
  const bareNameText = { nodeType: 3, nodeValue: 'Owner', parentElement: bareName };
  const barePeriod = { nodeType: 3, nodeValue: '.', parentElement: bare };
  bare.childNodes = [barePrefix, bareSpace, bareName, barePeriod];
  context.translateElementForTest(bare);
  context.translateNodeForTest(bareNameText);
  assert.equal(bareNameText.nodeValue, 'Owner');
  assert.equal(barePeriod.nodeValue, '。');

  const unknown = { nodeType: 1, tagName: 'SPAN', closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const unknownJoin = { nodeType: 3, nodeValue: ' including ', parentElement: unknown };
  unknown.childNodes = [barePrefix, bareSpace, bareName, unknownJoin, barePeriod];
  context.translateElementForTest(unknown);
  assert.equal(unknownJoin.nodeValue, ' including ', '未知结构不得改写');
});

test('automation-managed project warning keeps the automation name unchanged', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  for (const [kind, translatedKind] of [['project', '项目'], ['workspace', '工作区']]) {
    for (const name of ['Settings', 'Last 7 days', "Name $& $'"]) {
      const parent = { nodeType: 1, tagName: 'SPAN', closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
      const prefix = { nodeType: 3, nodeValue: 'This ', parentElement: parent };
      const type = { nodeType: 3, nodeValue: kind, parentElement: parent };
      const join = { nodeType: 3, nodeValue: ' is managed by the', parentElement: parent };
      const space = { nodeType: 3, nodeValue: ' ', parentElement: parent };
      const strong = { nodeType: 1, tagName: 'STRONG', parentElement: parent, closest(selector) { return selector === 'strong' ? this : null; } };
      const nameText = { nodeType: 3, nodeValue: name, parentElement: strong };
      const suffix = { nodeType: 3, nodeValue: ' automation and can only be deleted by deleting that automation.', parentElement: parent };
      parent.childNodes = [prefix, type, join, space, strong, suffix];
      context.translateElementForTest(parent);
      context.translateNodeForTest(nameText);
      assert.equal([prefix.nodeValue, type.nodeValue, join.nodeValue, nameText.nodeValue, suffix.nodeValue].join(''), `此${translatedKind}由自动化“${name}”管理，只能通过删除该自动化来删除此${translatedKind}。`);
      assert.equal(space.nodeValue, '');
      assert.equal(nameText.nodeValue, name);
      assert.equal(parent.childNodes[4], strong);
      context.translateElementForTest(parent);
      assert.equal(nameText.nodeValue, name);
      join.nodeValue = ' is managed by the';
      suffix.nodeValue = ' automation and can only be deleted by deleting that automation.';
      context.translateElementForTest(parent);
      assert.equal(join.nodeValue, '由自动化“');
      assert.equal(nameText.nodeValue, name);
      assert.equal(suffix.nodeValue, `”管理，只能通过删除该自动化来删除此${translatedKind}。`);
    }
  }
});

test('split settings messages preserve linked elements and product names', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  const node = (value) => ({ nodeType: 3, nodeValue: value });
  const parent = (tagName, children) => ({
    nodeType: 1, tagName, childNodes: children,
    get textContent() { return this.childNodes.map((child) => child.nodeType === 3 ? child.nodeValue : child.textContent).join(''); },
    closest() { return null; }, getAttribute() { return null; }, setAttribute() {},
  });
  const duplicate = parent('SPAN', [node('A '), node('project'), node(' with this name already exists.')]);
  context.translateElementForTest(duplicate);
  assert.equal(duplicate.textContent, '已存在同名项目。');

  const linkText = node('documentation');
  const link = { nodeType: 1, tagName: 'A', textContent: 'documentation', closest() { return null; } };
  linkText.parentElement = link;
  const creditMessage = parent('DIV', [node('For Antigravity Business consumption options, see'), node(' '), link, node('.')]);
  context.translateElementForTest(creditMessage);
  context.translateNodeForTest(linkText);
  assert.equal(creditMessage.childNodes[2], link);
  assert.equal(creditMessage.childNodes[0].nodeValue, '有关 Antigravity Business 的用量选项，请参阅');
  assert.equal(linkText.nodeValue, '文档');
  assert.equal(creditMessage.childNodes[3].nodeValue, '。');

  const button = parent('BUTTON', [node('Open '), node('Antigravity'), node(' panel')]);
  context.translateElementForTest(button);
  assert.equal(button.textContent, '打开 Antigravity 面板');
});

test('layout choices and remaining installed skill descriptions are localized', () => {
  for (const [input, expected] of [
    ['Knowledge Work', '知识工作'],
    ['Simplified interface for research, writing, and everyday tasks.', '精简界面，适合研究、写作和日常任务。'],
    ['Software Engineering', '软件工程'],
    ['Full interface for coding, developer tools, and managing agents.', '完整界面，适合编程、使用开发者工具和管理智能体。'],
    ['Settings for conversations outside of projects.', '项目之外的对话设置。'],
    ['Interactive guide to design and create a scheduled background automation. Use this skill when the user wants to create an automated or recurring scheduled task (e.g. "summarize my emails every morning", "every Monday send me a to-do list"). Also triggered by the /automation slash command.', '设计并创建定时后台自动化任务的交互式指南。当用户希望创建自动执行或定期运行的任务时使用此技能（例如“每天早上汇总我的邮件”“每周一给我发送待办事项清单”）。/automation 斜杠命令也会触发此技能。'],
    ['How to render rich interactive HTML widgets inline in the chat or as standalone artifacts. Use this skill when you want to show the user diagrams, data visualizations, interactive controls, educational walkthroughs, or any rich visual content beyond plain text and markdown.', '介绍如何在对话中内嵌或以独立产物形式呈现丰富的交互式 HTML 组件。需要向用户展示图表、数据可视化、交互控件、教学演示，或纯文本和 Markdown 之外的其他丰富视觉内容时使用此技能。'],
    ["Migrates the user's MCP servers, skills, slash commands, subagents, and instruction files from other coding agents (Claude Code, Codex, Cursor, Gemini CLI) into one new Antigravity plugin. Use when the user wants to bring over, import, or migrate their setup or config from another agent or tool. Don't use for installing Marketplace plugins or authoring a new plugin from scratch (use the plugin skill).", '将用户在其他编码智能体（Claude Code、Codex、Cursor、Gemini CLI）中的 MCP 服务器、技能、斜杠命令、子智能体和指令文件迁移到一个新的 Antigravity 插件。当用户希望从其他智能体或工具导入或迁移其设置、配置时使用。不要用于安装插件市场中的插件或从头创建新插件（请使用 plugin 技能）。'],
    ['Automatically migrate legacy workflows to modern skills across global and workspace configurations. Scans for existing workflows, creates target SKILL.md files, and safely archives old workflow files.', '自动将全局及工作区配置中的旧工作流迁移为新版技能。会扫描已有工作流、创建目标 SKILL.md 文件，并安全归档旧工作流文件。'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
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

test('custom outputs do not suppress independent text or attribute rules', () => {
  const parent = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
  const turbo = { nodeType: 3, nodeValue: 'Turbo', parentElement: parent };
  const defaults = { nodeType: 3, nodeValue: 'Default', parentElement: parent };
  const attrs = new Map([['title', 'Turbo'], ['aria-label', 'Default']]);
  const element = {
    nodeType: 1, parentElement: parent, closest() { return null; },
    getAttribute: (name) => attrs.get(name) ?? null, setAttribute: (name, value) => attrs.set(name, value),
  };
  const nodes = [parent, turbo, defaults, element];
  const document = {
    nodeType: 9, readyState: 'loading', documentElement: { lang: 'en' },
    querySelectorAll() { return []; },
    createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] ?? null }; },
  };
  const window = {
    addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' },
    __antigravityZhCustom: [['Turbo', 'Default'], ['Default', '默认值']],
  };
  const ctx = { window, document, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } };
  vm.createContext(ctx);
  vm.runInContext(source.replace('  function run() {', '  globalThis.hooks = { applyChinese, translateNode, translateElement, setLang };\n  function run() {'), ctx);
  ctx.hooks.applyChinese(false);
  assert.equal(turbo.nodeValue, 'Default');
  assert.equal(defaults.nodeValue, '默认值');
  assert.equal(attrs.get('title'), 'Default');
  assert.equal(attrs.get('aria-label'), '默认值');
  turbo.__zh_patched = false;
  ctx.hooks.translateNode(turbo);
  ctx.hooks.translateElement(element);
  assert.equal(turbo.nodeValue, 'Default', 'observer must preserve this node’s custom output');
  assert.equal(attrs.get('title'), 'Default', 'observer must preserve this attribute’s custom output');
  turbo.nodeValue = 'High';
  turbo.__zh_patched = false;
  ctx.hooks.translateNode(turbo);
  assert.equal(turbo.nodeValue, '高', 'application changes must still be translated');
  ctx.hooks.setLang('en');
  assert.equal(defaults.nodeValue, 'Default');
  assert.equal(attrs.get('title'), 'Turbo');
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
  assert.equal(translate('已选择 /workspace/May 5, 2026/report.txt'), '已选择 /workspace/May 5, 2026/report.txt');
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const attrs = new Map([['title', '已选择 /workspace/May 5, 2026/report.txt']]);
  const element = {
    nodeType: 1, closest() { return null; },
    getAttribute: (name) => attrs.get(name) ?? null, setAttribute: (name, value) => attrs.set(name, value),
  };
  context.translateElementForTest(element);
  assert.equal(attrs.get('title'), '已选择 /workspace/May 5, 2026/report.txt');
  assert.equal(translate('GPT-OSS will be removed from Antigravity on /workspace/May 5, 2026/report.txt.'),
    'GPT-OSS 将于 /workspace/May 5, 2026/report.txt 从 Antigravity 中移除。');
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

test('IDE quick settings hover descriptions preserve policy scope', () => {
  const pairs = [
    ['Show AI autocomplete suggestions in the editor', '在编辑器中显示 AI 自动补全建议'],
    ['Predict the location of your next edit and navigates you there with a tab keypress', '预测下一处编辑位置，按 Tab 键可跳转到该位置'],
    ['Enable navigation suggestions that predict your next edit', '启用预测下一处编辑位置的导航建议'],
    ['Always Proceed - Agent never asks for confirmation before executing terminal commands (except those in the Deny List)', '始终继续——智能体在执行终端命令前从不请求确认（拒绝列表中的命令除外）'],
    ['Request Review - Agent always asks for confirmation before executing terminal commands (except those in the Allow List)', '请求审核——智能体在执行终端命令前始终请求确认（允许列表中的命令除外）'],
    ['Always auto-execute commands unless they are in your deny list. This also allows Agent to auto-execute Browser controls.', '始终自动执行命令，拒绝列表中的命令除外。此设置也允许智能体自动执行浏览器操作。'],
    ['Never auto-execute commands unless they are in your allow list.', '从不自动执行命令，允许列表中的命令除外。'],
    ['Always Proceed - Trust the agent to do tasks end-to-end', '始终继续——信任智能体独立完成整个任务'],
    ['Agent Decides - Assist the agent to complete tasks', '由智能体决定——协助智能体完成任务'],
    ['Request Review - Collaborate with the agent to complete tasks', '请求审核——与智能体协作完成任务'],
    ["When enabled, Agent is given awareness of lint errors created by its edits and may fix them without explicit user prompting. Note that this may increase Agent's tool usage.", '启用后，智能体将获悉其编辑产生的 Lint 错误，并可在用户未明确要求的情况下修复这些错误。请注意，这可能增加智能体的工具使用量。'],
    ['Used to represent onboardingsteps which have not been completed', '用于表示尚未完成的入门步骤'],
    ['Used to represent onboarding steps which have been completed', '用于表示已完成的入门步骤'],
  ];
  for (const [input, expected] of pairs) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
  const multiline = pairs.slice(3, 5);
  assert.equal(translate(multiline.map(([input]) => input).join('\n')), multiline.map(([, output]) => output).join('\n'));
});

test('IDE hover portals translate dynamically while editor content is protected', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
  const oldLocation = context.window.location;
  context.window.location = { pathname: '/workbench.html', href: 'vscode-file://vscode-app/workbench.html' };
  try {
    const attrs = new Map([['title', 'Show AI autocomplete suggestions in the editor']]);
    const hover = {
      nodeType: 1,
      closest(selector) { return selector.includes('.monaco-hover') ? this : null; },
      getAttribute(name) { return attrs.get(name) ?? null; },
      setAttribute(name, value) { attrs.set(name, value); },
    };
    const node = { nodeType: 3, nodeValue: 'Show AI autocomplete suggestions in the editor', parentElement: hover };
    context.translateNodeForTest(node);
    context.translateElementForTest(hover);
    assert.equal(node.nodeValue, '在编辑器中显示 AI 自动补全建议');
    assert.equal(attrs.get('title'), '在编辑器中显示 AI 自动补全建议');

    const editor = {
      nodeType: 1,
      closest(selector) { return selector.includes('.monaco-editor') ? this : null; },
    };
    const code = { nodeType: 3, nodeValue: 'Show AI autocomplete suggestions in the editor', parentElement: editor };
    context.translateNodeForTest(code);
    assert.equal(code.nodeValue, 'Show AI autocomplete suggestions in the editor');
  } finally {
    context.window.location = oldLocation;
  }
});

test('IDE native language supplement is version-gated, reversible, and preserves placeholders', () => {
  function setup(pathname = '/workbench.html', language = 'zh-cn') {
    const messages = new Array(16558);
    messages[3864] = 'Used to represent onboardingsteps which have not been completed';
    messages[3865] = 'Used to represent onboarding steps which have been completed';
    messages[3866] = 'Code with Agent';
    messages[147] = 'Extensions';
    messages[5685] = 'Click to focus this command in the terminal.';
    messages[5816] = 'All commands will be auto approved for this session';
    messages[13461] = 'Task not found: `{0}`';
    const window = {
      addEventListener() {}, removeEventListener() {},
      location: { pathname, href: `vscode-file://vscode-app${pathname}` },
      _VSCODE_NLS_LANGUAGE: language, _VSCODE_NLS_MESSAGES: messages,
    };
    const fresh = { window, document: { readyState: 'loading' } };
    vm.createContext(fresh);
    const instrumented = source.replace('  function run() {', '  globalThis.applyNls = applyIdeNlsMessages; globalThis.restoreNls = restoreIdeNlsMessages; globalThis.nlsEntries = ideNlsSupplement;\n  function run() {');
    vm.runInContext(instrumented, fresh);
    return { fresh, messages };
  }
  const { fresh, messages } = setup();
  fresh.applyNls();
  assert.equal(messages[147], '扩展');
  assert.equal(messages[5685], '单击聚焦终端中的此命令。');
  assert.equal(messages[5816], '此会话的所有命令将得到自动批准');
  assert.equal(messages[13461], '找不到任务：`{0}`');
  messages[147] = '应用更新后的内容';
  fresh.restoreNls();
  assert.equal(messages[147], '应用更新后的内容');
  assert.equal(messages[5685], 'Click to focus this command in the terminal.');

  for (const setupCase of [setup('/other.html'), setup('/workbench.html', 'en')]) {
    setupCase.fresh.applyNls();
    assert.equal(setupCase.messages[147], 'Extensions');
  }
  const mismatched = setup();
  mismatched.messages[3866] = 'different IDE build';
  mismatched.fresh.applyNls();
  assert.equal(mismatched.messages[147], 'Extensions');

  const indices = new Set();
  for (const [index, original, translated] of fresh.nlsEntries) {
    assert.ok(!indices.has(index), `duplicate native localization index ${index}`);
    indices.add(index);
    const sourceParameters = original.match(/\{\d+\}/g)?.sort() ?? [];
    const targetParameters = translated.match(/\{\d+\}/g)?.sort() ?? [];
    // In IDE 2.6.0 this parameter is only the English plural suffix "s" or "".
    if (index === 5772) assert.deepEqual(sourceParameters, ['{0}', '{1}']);
    assert.deepEqual(index === 5772 ? ['{0}'] : sourceParameters, targetParameters);
    const protectedTokens = original.match(/\$\{[^}]+\}|\$\([^)]+\)|#[A-Za-z0-9_.-]+#|`[^`\r\n]+`|https?:\/\/[^\s)]+|--[\w-]+/g) ?? [];
    for (const token of protectedTokens) assert.ok(translated.includes(token), `native entry ${index} changed ${token}`);
    // VS Code language packs also encode a mnemonic as a single & before its letter.
    if (original.includes('&&')) assert.ok(/&&|&[A-Za-z]/.test(translated), `native entry ${index} lost its menu mnemonic`);
  }
  assert.ok(indices.size >= 700);
});

test('IDE native language supplement follows overlay language changes and cleanup', () => {
  const messages = new Array(16558);
  messages[3864] = 'Used to represent onboardingsteps which have not been completed';
  messages[3865] = 'Used to represent onboarding steps which have been completed';
  messages[3866] = 'Code with Agent';
  messages[147] = 'Extensions';
  const document = {
    nodeType: 9, readyState: 'loading', documentElement: { lang: 'zh-CN' },
    createTreeWalker() { return { nextNode() { return null; } }; },
    querySelectorAll() { return []; },
  };
  const window = {
    addEventListener() {}, removeEventListener() {},
    location: { pathname: '/workbench.html', href: 'vscode-file://vscode-app/workbench.html' },
    _VSCODE_NLS_LANGUAGE: 'zh-cn', _VSCODE_NLS_MESSAGES: messages,
  };
  class FakeMutationObserver { observe() {} disconnect() {} }
  const fresh = { window, document, MutationObserver: FakeMutationObserver,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } };
  vm.createContext(fresh);
  const instrumented = source.replace('  function run() {', '  globalThis.runForTest = run;\n  function run() {');
  vm.runInContext(instrumented, fresh);
  fresh.runForTest();
  assert.equal(messages[147], '扩展');
  window.__antigravityZhSetLang('en');
  assert.equal(messages[147], 'Extensions');
  window.__antigravityZhSetLang('zh');
  assert.equal(messages[147], '扩展');
  window.__antigravityZhPatchCleanup();
  assert.equal(messages[147], 'Extensions');
});

test('IDE native supplement respects personal rules without changing unmatched entries', () => {
  const messages = new Array(16558);
  messages[3864] = 'Used to represent onboardingsteps which have not been completed';
  messages[3865] = 'Used to represent onboarding steps which have been completed';
  messages[3866] = 'Code with Agent';
  messages[147] = 'Extensions';
  messages[5685] = 'Click to focus this command in the terminal.';
  const window = {
    addEventListener() {}, removeEventListener() {},
    location: { pathname: '/workbench.html', href: 'vscode-file://vscode-app/workbench.html' },
    _VSCODE_NLS_LANGUAGE: 'zh-cn', _VSCODE_NLS_MESSAGES: messages,
    __antigravityZhCustom: [['extensions', ''], ['Click to focus this command in the terminal.', '聚焦命令']],
  };
  const ctx = { window, document: { readyState: 'loading' } };
  vm.createContext(ctx);
  vm.runInContext(source.replace('  function run() {', '  globalThis.hooks = { applyIdeNlsMessages, restoreIdeNlsMessages };\n  function run() {'), ctx);
  ctx.hooks.applyIdeNlsMessages();
  assert.equal(messages[147], 'Extensions');
  assert.equal(messages[5685], '聚焦命令');
  ctx.hooks.restoreIdeNlsMessages();
  assert.equal(messages[5685], 'Click to focus this command in the terminal.');
});

test('slash command descriptions are localized without changing commands', () => {
  const descriptions = [
    ['Run until the specified goal is completely finished.', '持续运行，直到指定目标完全完成。'],
    ['Compact the conversation now (summarize history to free up the context window).', '立即压缩对话（概括历史记录以释放上下文窗口空间）。'],
    ['Run an instruction on a recurring schedule or as a one-time timer.', '按周期计划或一次性定时执行一条指令。'],
    ['Invoke a browser agent for web tasks.', '调用浏览器智能体处理网页任务。'],
    ['Plan carefully before executing a task.', '执行任务前先仔细规划。'],
    ['Interview me to align on a plan.', '通过提问与我就计划达成一致。'],
    ['Invoke a team of agents to autonomously tackle large projects.', '调用智能体团队自主处理大型项目。'],
    ['Reflect on recent successes or corrections to capture reusable skills or rules.', '回顾近期的成功经验或修正，提炼可复用的技能或规则。'],
    ['Invoke the Boost multi-agent orchestrator for complex tasks.', '调用 Boost 多智能体协调器处理复杂任务。'],
  ];
  for (const [input, expected] of descriptions) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }

  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  for (const name of ['plan', 'browser', 'schedule', 'automation', 'Copy Path']) {
    const label = {
      nodeType: 1,
      closest(selector) {
        if (selector === '[data-testid="menu-option-label"]' || selector === '[data-mention-menu]') return this;
        return null;
      },
    };
    const node = { nodeType: 3, nodeValue: name, parentElement: label };
    context.translateNodeForTest(node);
    assert.equal(node.nodeValue, name, `suggestion label changed: ${name}`);
  }

  const category = {
    nodeType: 1,
    closest(selector) {
      if (selector === '[data-testid="menu-option-label"]' || selector === '[data-mention-menu]' || selector === '[data-testid="menu-category-row"]') return this;
      return null;
    },
  };
  const categoryText = { nodeType: 3, nodeValue: 'Browser', parentElement: category };
  context.translateNodeForTest(categoryText);
  assert.equal(categoryText.nodeValue, '浏览器');
});

test('fragmented slash descriptions translate without replacing highlight nodes or application updates', () => {
  const oldWalker = context.document.createTreeWalker;
  const oldNodeFilter = context.NodeFilter;
  context.NodeFilter = { SHOW_TEXT: 4 };
  context.document.createTreeWalker = (element) => {
    let index = 0;
    return { nextNode: () => element.textNodes[index++] ?? null };
  };
  try {
    const label = { textNodes: [{ nodeValue: 'plan' }] };
    const row = { querySelector: () => label };
    const description = {
      textNodes: [{ nodeValue: 'Plan ' }, { nodeValue: 'carefully' }, { nodeValue: ' before executing a task.' }],
      matches(selector) { return selector === '[data-testid="menu-option-description"]'; },
      closest(selector) {
        if (selector === '[data-mention-menu]') return this;
        if (selector === '[role="option"]') return row;
        return null;
      },
    };
    const originalNodes = [...description.textNodes];
    assert.equal(context.translateKnownSlashDescriptionForTest(description), true);
    assert.deepEqual(description.textNodes.map((node) => node.nodeValue), ['执行任务前先仔细规划。', '', '']);
    assert.equal(description.textNodes[1], originalNodes[1], 'highlight node was replaced');
    assert.equal(context.translateKnownSlashDescriptionForTest(description), true);

    description.textNodes[0].nodeValue = 'Application changed this text';
    assert.equal(context.translateKnownSlashDescriptionForTest(description), false);
    assert.equal(description.textNodes[0].nodeValue, 'Application changed this text');
    assert.equal(description.textNodes[1].nodeValue, 'carefully');
    assert.equal(description.textNodes[2].nodeValue, ' before executing a task.');

    const clippedLabel = { textNodes: [{ nodeValue: 'schedule' }] };
    const clipped = {
      textNodes: [{ nodeValue: '…schedule ' }, { nodeValue: 'or as a one-time timer.' }],
      matches(selector) { return selector === '[data-testid="menu-option-description"]'; },
      closest(selector) {
        if (selector === '[data-mention-menu]') return this;
        if (selector === '[role="option"]') return { querySelector: () => clippedLabel };
        return null;
      },
    };
    assert.equal(context.translateKnownSlashDescriptionForTest(clipped), true);
    assert.deepEqual(clipped.textNodes.map((node) => node.nodeValue), ['按周期计划或一次性定时执行一条指令。', '']);
  } finally {
    context.document.createTreeWalker = oldWalker;
    context.NodeFilter = oldNodeFilter;
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
      querySelectorAll() { return []; },
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
  assert.equal(snapshot(), '极速 | 不受限制地运行所有命令。 | 高 | 当前对话', '默认关闭：全部汉化');

  hooks.setEnglishLabels(true);
  assert.equal(snapshot(), 'Turbo | 不受限制地运行所有命令。 | High | This Conversation', '开启：选项名英文、说明中文');
  assert.equal(store.get('antigravityHansEnglishLabels'), '1');

  hooks.setLang('en');
  assert.equal(snapshot(), 'Turbo | Run all commands without restrictions. | High | This Conversation');
  hooks.setLang('zh');
  assert.equal(snapshot(), 'Turbo | 不受限制地运行所有命令。 | High | This Conversation');

  hooks.setEnglishLabels(false);
  assert.equal(snapshot(), '极速 | 不受限制地运行所有命令。 | 高 | 当前对话', '关闭后恢复全部汉化');

  // 偏好持久化：新实例读取已开启的偏好；个人名单优先于预设
  store.set('antigravityHansEnglishLabels', '1');
  turbo.nodeValue = 'Turbo'; desc.nodeValue = 'Run all commands without restrictions.'; high.nodeValue = 'High'; title.nodeValue = 'This Conversation';
  hooks = build([['Turbo', '快速模式']]);
  hooks.applyChinese(true);
  assert.equal(snapshot(), '快速模式 | 不受限制地运行所有命令。 | High | This Conversation');
});

test('IDE workbench synchronizes language and label preferences with cross-origin agent frames', () => {
  function makePage(location, preferences = {}) {
    const listeners = new Map();
    const timers = new Map();
    const store = new Map(Object.entries(preferences));
    const parent = { nodeType: 1, closest() { return null; }, getAttribute() { return null; }, setAttribute() {} };
    const feedback = { nodeType: 3, nodeValue: 'Give Feedback', parentElement: parent };
    const turbo = { nodeType: 3, nodeValue: 'Turbo', parentElement: parent };
    const nodes = [parent, feedback, turbo];
    const document = {
      nodeType: 9, readyState: 'loading', documentElement: { lang: 'en' },
      querySelectorAll() { return []; },
      createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] ?? null }; },
    };
    const window = {
      location,
      localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
      addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
      removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    };
    const ctx = {
      window, document, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
      setInterval(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
      clearInterval(id) { timers.delete(id); },
    };
    vm.createContext(ctx);
    vm.runInContext(source.replace('  function run() {', '  globalThis.hooks = { startPreferenceSync, setLang, setEnglishLabels, applyChinese };\n  function run() {'), ctx);
    return { ctx, window, feedback, turbo, timers, dispatch(type, event) { for (const handler of listeners.get(type) ?? []) handler(event); } };
  }

  const top = makePage({ pathname: '/workbench.html', href: 'vscode-file://vscode-app/workbench.html' }, { antigravityHansLang: 'en' });
  top.window.top = top.window;
  top.ctx.hooks.startPreferenceSync();
  const frame = makePage({ protocol: 'http:', hostname: '127.0.0.1', pathname: '/', href: 'http://127.0.0.1:63517/' });
  const childProxy = {
    postMessage(data, origin) {
      assert.equal(origin, 'http://127.0.0.1:63517');
      frame.dispatch('message', { data, source: topProxy, origin: 'vscode-file://vscode-app' });
    },
  };
  const topProxy = {
    postMessage(data) { top.dispatch('message', { data, source: childProxy, origin: 'http://127.0.0.1:63517' }); },
  };
  frame.window.top = topProxy;
  frame.ctx.hooks.applyChinese(false);
  assert.equal(frame.feedback.nodeValue, '提供反馈');
  frame.ctx.hooks.startPreferenceSync();
  assert.equal(frame.feedback.nodeValue, 'Give Feedback', 'frame adopts the workbench language on connection');
  top.ctx.hooks.setLang('zh');
  assert.equal(frame.feedback.nodeValue, '提供反馈');
  top.ctx.hooks.setEnglishLabels(true);
  assert.equal(frame.turbo.nodeValue, 'Turbo');
  top.ctx.hooks.setEnglishLabels(false);
  assert.equal(frame.turbo.nodeValue, '极速');

  frame.dispatch('message', { data: { type: 'antigravity-hans-preferences-state', lang: 'en', englishLabels: true }, source: {}, origin: 'http://evil.test' });
  frame.dispatch('message', { data: { type: 'antigravity-hans-preferences-state', lang: 'en', englishLabels: true }, source: topProxy, origin: 'https://example.test' });
  frame.dispatch('message', { data: { type: 'antigravity-hans-preferences-state', lang: 'invalid', englishLabels: true }, source: topProxy });
  assert.equal(frame.feedback.nodeValue, '提供反馈', 'untrusted or malformed messages cannot change the frame');
  let foreignReplies = 0;
  top.dispatch('message', { data: { type: 'antigravity-hans-preferences-request' }, source: { postMessage() { foreignReplies++; } }, origin: 'https://example.test' });
  assert.equal(foreignReplies, 0);

  frame.dispatch('storage', { key: 'antigravityHansLang', newValue: 'en' });
  assert.equal(frame.feedback.nodeValue, 'Give Feedback', 'same-origin storage events work in frames too');
  for (const tick of frame.timers.values()) tick();
  assert.equal(frame.feedback.nodeValue, '提供反馈', 'periodic requests recover after a parent reload');
  frame.window.__antigravityZhPatchCleanup();
  assert.equal(frame.timers.size, 0);
  top.ctx.hooks.setLang('en');
  assert.equal(frame.feedback.nodeValue, '提供反馈', 'cleanup unregisters preference listeners');
  top.window.__antigravityZhPatchCleanup();
});
