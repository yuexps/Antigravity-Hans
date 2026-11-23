#!/usr/bin/env node
// Antigravity 汉化适配辅助脚本：定位安装资源、检索前端文案、检查词库覆盖、抓取运行中界面。
// 用法: node antigravity-resources.mjs <info|search|check|missing|live> [选项]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OVERLAY_PATH = path.join(PROJECT_ROOT, 'resources', 'antigravity-hans-overlay.js');
const DEFAULT_LIMIT = 40;
const MAX_FILE_SIZE = 64 * 1024 * 1024;

const APP_DEFS = {
  normal: {
    name: 'Antigravity',
    dirName: 'Antigravity',
    exeName: 'Antigravity.exe',
    bundleName: 'Antigravity.app',
    port: 58321,
  },
  ide: {
    name: 'Antigravity IDE',
    dirName: 'Antigravity IDE',
    exeName: 'Antigravity IDE.exe',
    bundleName: 'Antigravity IDE.app',
    port: 58322,
  },
};

const COLLECT_EXPRESSION = `(() => {
  const values = new Set();
  const add = (value) => { if (value && value.trim()) values.add(value.trim()); };
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) add(walker.currentNode.nodeValue);
  }
  for (const element of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
    for (const attribute of ['aria-label', 'placeholder', 'title']) add(element.getAttribute(attribute));
  }
  return JSON.stringify([...values]);
})()`;

// ---------- 应用定位 ----------

function candidateRoots(def) {
  if (process.platform === 'win32') {
    const bases = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
    ].filter(Boolean);
    return bases.map((base) => path.join(base, def.dirName, def.exeName));
  }
  if (process.platform === 'darwin') {
    return ['/Applications', path.join(os.homedir(), 'Applications')].map((base) => path.join(base, def.bundleName));
  }
  return [];
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readAsar(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(4);
    const jsonSize = head.readUInt32LE(8);
    if (jsonSize <= 0 || jsonSize > MAX_FILE_SIZE) throw new Error('asar 头大小异常');
    const raw = Buffer.alloc(jsonSize);
    const readBytes = fs.readSync(fd, raw, 0, jsonSize, 16);
    const text = raw.subarray(0, readBytes).toString('utf8');
    const tree = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1));
    return {
      tree,
      read(entry) {
        const buffer = Buffer.alloc(entry.size);
        fs.readSync(fd, buffer, 0, entry.size, 8 + headerSize + Number(entry.offset));
        return buffer;
      },
      close() {
        fs.closeSync(fd);
      },
    };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function readAsarJson(file, entryPath) {
  const archive = readAsar(file);
  try {
    let node = archive.tree;
    for (const part of entryPath.split('/')) node = node?.files?.[part];
    if (!node || node.files) return null;
    return JSON.parse(archive.read(node).toString('utf8'));
  } finally {
    archive.close();
  }
}

function describeApp(key) {
  const def = APP_DEFS[key];
  const installPath = candidateRoots(def).find((candidate) => fs.existsSync(candidate));
  if (!installPath) return { key, name: def.name, port: def.port, installed: false };

  const resourcesDir = process.platform === 'win32'
    ? path.join(path.dirname(installPath), 'resources')
    : path.join(installPath, 'Contents', 'Resources');

  if (key === 'normal') {
    const asarPath = path.join(resourcesDir, 'app.asar');
    let pkg = {};
    try {
      pkg = readAsarJson(asarPath, 'package.json') ?? {};
    } catch {
      console.log(`[警告] 无法读取 ${asarPath}，版本标记为未知`);
    }
    return { key, name: def.name, port: def.port, installed: true, version: pkg.version ?? '未知', installPath, resourcePath: asarPath, asarPath };
  }

  const appDir = path.join(resourcesDir, 'app');
  const product = readJson(path.join(appDir, 'product.json')) ?? {};
  return {
    key,
    name: def.name,
    port: def.port,
    installed: true,
    version: product.ideVersion ?? product.version ?? '未知',
    installPath,
    resourcePath: appDir,
    appDir,
  };
}

// ---------- 静态资源检索 ----------

function collectAsarFiles(node, prefix, out, filter) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const full = prefix + name;
    if (entry.files) collectAsarFiles(entry, full + '/', out, filter);
    else if (filter(full)) out.push({ path: full, entry });
  }
}

function collectDirFiles(dir, out, filter) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['media', 'node_modules', 'test', '.git'].includes(entry.name)) collectDirFiles(full, out, filter);
    } else if (filter(full)) {
      out.push({ path: full });
    }
  }
}

function readTextFile(file) {
  try {
    if (fs.statSync(file).size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function searchText(text, needle, label, state) {
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  while (state.results.length < state.limit) {
    const index = lowerText.indexOf(lowerNeedle, from);
    if (index < 0) break;
    const before = text.slice(Math.max(0, index - 80), index).replace(/\s+/g, ' ');
    const hit = text.slice(index, index + needle.length).replace(/\s+/g, ' ');
    const after = text.slice(index + needle.length, index + needle.length + 80).replace(/\s+/g, ' ');
    state.results.push({ label, context: `${before}${hit}${after}` });
    from = index + needle.length;
  }
}

function searchNormal(app, needle, results, limit) {
  const archive = readAsar(app.asarPath);
  try {
    const files = [];
    collectAsarFiles(archive.tree, '', files, (file) => file.startsWith('dist/') && file.endsWith('.js'));
    for (const file of files) {
      if (results.length >= limit) break;
      searchText(archive.read(file.entry).toString('utf8'), needle, `${app.name}:${file.path}`, { results, limit });
    }
  } finally {
    archive.close();
  }
}

function searchIde(app, needle, results, limit) {
  const files = [];
  collectDirFiles(path.join(app.appDir, 'out'), files, (file) => /\.(js|html|json)$/i.test(file) && !/\.map$/i.test(file));
  for (const file of files) {
    if (results.length >= limit) break;
    const text = readTextFile(file.path);
    if (text) searchText(text, needle, `${app.name}:${path.relative(app.appDir, file.path)}`, { results, limit });
  }
}

function searchResources(appKeys, needle, limit) {
  const results = [];
  for (const key of appKeys) {
    const app = describeApp(key);
    if (!app.installed) {
      console.log(`[跳过] 未找到 ${app.name}`);
      continue;
    }
    if (key === 'normal') {
      searchNormal(app, needle, results, limit);
      console.log('[提示] 普通版界面文案来自运行时页面，请优先使用 live 命令核对。');
    } else {
      searchIde(app, needle, results, limit);
    }
  }
  for (const result of results) console.log(`${result.label}\n  …${result.context}…`);
  if (!results.length) console.log('未找到匹配文案。');
}

// ---------- 词库 ----------

// 用 overlay 的真实翻译函数判断覆盖，避免静态规则与动态模板不一致。
function createTranslator(overlayPath = OVERLAY_PATH) {
  const source = fs.readFileSync(overlayPath, 'utf8');
  const marker = '  function run() {';
  if (!source.includes(marker)) throw new Error(`无法定位 run 函数: ${overlayPath}`);
  const context = {
    window: { addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' } },
    document: { readyState: 'loading' },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(marker, '  globalThis.translateForTest = translate;\n' + marker), context);
  if (typeof context.translateForTest !== 'function') throw new Error('未能从 overlay 提取 translate');
  return context.translateForTest;
}

function createCoverageChecker(translate) {
  const cache = new Map();
  return (text) => {
    if (!cache.has(text)) cache.set(text, translate(text) !== text);
    return cache.get(text);
  };
}

function runCheck(text, overlayPath) {
  const translate = createTranslator(overlayPath);
  const translated = translate(text);
  if (translated !== text) {
    console.log(`已覆盖: ${JSON.stringify(text)} -> ${JSON.stringify(translated)}`);
    return;
  }
  console.log('未覆盖: 词库中没有可命中的词条、动态规则或长句。');
}

// ---------- 候选文案 ----------

function isUiText(value) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 200) return false;
  if (!/[A-Za-z]/.test(text) || /[\u4e00-\u9fff]/.test(text)) return false;
  if (/https?:\/\/|www\.|file:\/\/|@[a-z0-9.-]+\./i.test(text)) return false;
  if (/[{}<>=;\\]/.test(text)) return false;
  if (/^[A-Z0-9_]+$/.test(text)) return false;
  if (/^[a-z][a-z0-9-]*$/.test(text)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(text)) return false;
  if (/^[\w./-]+\.(?:js|json|md|ts|py|go|css|html|png|svg)$/i.test(text)) return false;
  if (/^(?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+/.test(text)) return false;
  const words = text.match(/[A-Za-z][A-Za-z'-]+/g) ?? [];
  if (words.some((word) => /[A-Za-z]\d|\d[A-Za-z]/.test(word))) return false;
  if (words.length >= 2) return true;
  if (/^[A-Z][A-Za-z'-]{2,29}$/.test(text)) return true;
  return text.length >= 12;
}

function isStaticCandidate(text) {
  if (!isUiText(text)) return false;
  if (text.length < 8 || text.length > 80 || !/^[A-Z0-9]/.test(text)) return false;
  if (!/\s/.test(text) || /[`#]/.test(text) || /\s{2,}/.test(text)) return false;
  return true;
}

function extractStrings(text) {
  const values = new Set();
  const pattern = /(["'`])((?:\\.|(?!\1)[^\\]){4,200})\1/g;
  let match;
  while ((match = pattern.exec(text)) && values.size < 20000) {
    const raw = match[2];
    if (raw.includes('${') || raw.includes('\\u') || raw.includes('\\x')) continue;
    values.add(raw.replace(/\\n|\\r|\\t/g, ' ').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return values;
}

function collectAppCandidates(app, candidates) {
  if (app.key === 'normal') {
    console.log('[提示] 普通版没有可扫描的静态前端资源，请使用 live 命令。');
    return;
  }
  const files = [];
  collectDirFiles(path.join(app.appDir, 'out'), files, (file) => /\.(js|html)$/i.test(file) && !/\.map$/i.test(file));
  for (const file of files) {
    const text = readTextFile(file.path);
    if (!text) continue;
    for (const value of extractStrings(text)) {
      if (isStaticCandidate(value)) candidates.add(value);
    }
  }
}

function runMissing(appKeys, limit, overlayPath) {
  const isCovered = createCoverageChecker(createTranslator(overlayPath));
  const candidates = new Set();
  for (const key of appKeys) {
    const app = describeApp(key);
    if (app.installed) collectAppCandidates(app, candidates);
  }
  const pending = [...candidates]
    .filter((text) => !isCovered(text))
    .sort((a, b) => a.length - b.length);
  for (const text of pending.slice(0, limit)) console.log(text);
  console.log(`\n静态候选 ${pending.length} 条，已显示 ${Math.min(limit, pending.length)} 条。候选为启发式结果，需逐条在界面或资源上下文中核对。`);
}

// ---------- 运行中页面 ----------

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function isTargetPage(url, key) {
  const lower = url.toLowerCase();
  if (key === 'ide') return lower.includes('workbench.html') || lower.includes('workbench-jetski-agent.html');
  if (lower.startsWith('data:text/html')) return true;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function collectPageTexts(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP 超时'));
    }, 8000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: COLLECT_EXPRESSION, returnByValue: true } }));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      const value = message.result?.result?.value;
      if (typeof value === 'string') resolve(value);
      else reject(new Error(message.error?.message ?? '页面未返回文本'));
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket 连接失败'));
    });
  });
}

async function scanPage(app, page, isCovered, limit) {
  try {
    const texts = JSON.parse(await collectPageTexts(page.webSocketDebuggerUrl));
    const pending = texts.filter(isUiText).filter((text) => !isCovered(text));
    console.log(`\n== ${app.name} / ${page.title ?? '页面'} ==`);
    console.log(`页面文本 ${texts.length} 条，疑似未翻译 ${pending.length} 条`);
    for (const text of pending.slice(0, limit)) console.log('  ' + text);
    if (pending.length > limit) console.log(`  ... 其余 ${pending.length - limit} 条省略`);
  } catch (error) {
    console.log(`[失败] ${app.name} / ${page.title ?? '页面'}: ${error.message}`);
  }
}

async function runLive(appKeys, limit, overlayPath) {
  const isCovered = createCoverageChecker(createTranslator(overlayPath));
  for (const key of appKeys) {
    const app = describeApp(key);
    if (!app.installed) {
      console.log(`[跳过] 未找到 ${app.name}`);
      continue;
    }
    let targets;
    try {
      targets = await fetchJson(`http://127.0.0.1:${app.port}/json/list`);
    } catch {
      console.log(`[跳过] ${app.name} 未监听调试端口 ${app.port}，请先用本工具启动应用`);
      continue;
    }
    const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl && isTargetPage(target.url, key));
    if (!pages.length) {
      console.log(`[跳过] ${app.name} 没有可读取的页面`);
      continue;
    }
    for (const page of pages) await scanPage(app, page, isCovered, limit);
  }
}

function capturePageScreenshot(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP 截图超时'));
    }, 10000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
      socket.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 2) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.data) resolve(Buffer.from(message.result.data, 'base64'));
      else reject(new Error(message.error?.message ?? '截图失败'));
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket 连接失败'));
    });
  });
}

async function runScreenshot(appKey, outPath) {
  const app = describeApp(appKey);
  let targets;
  try {
    targets = await fetchJson(`http://127.0.0.1:${app.port}/json/list`);
  } catch {
    throw new Error(`${app.name} 未监听调试端口 ${app.port}，请先用本工具启动应用`);
  }
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && /^https?:\/\//i.test(t.url))
    || targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && isTargetPage(t.url, appKey));
  if (!page) throw new Error(`${app.name} 没有可截图的页面`);
  const png = await capturePageScreenshot(page.webSocketDebuggerUrl);
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, png);
  console.log(`[成功] 已保存截图: ${resolved} (${page.title ?? page.url})`);
}

// ---------- 命令入口 ----------

async function printInfo() {
  for (const key of Object.keys(APP_DEFS)) {
    const app = describeApp(key);
    console.log(`\n== ${app.name} ==`);
    if (!app.installed) {
      console.log('未找到安装（已检查默认路径）');
      continue;
    }
    console.log(`版本: ${app.version}`);
    console.log(`安装: ${app.installPath}`);
    console.log(`资源: ${app.resourcePath}`);
    try {
      await fetchJson(`http://127.0.0.1:${app.port}/json/list`);
      console.log(`调试端口 ${app.port}: 在线`);
    } catch {
      console.log(`调试端口 ${app.port}: 未监听`);
    }
  }
}

function printUsage() {
  console.log(`用法: node antigravity-resources.mjs <命令> [选项]

命令:
  info                 显示 Antigravity 与 Antigravity IDE 的安装版本和资源路径
  search <关键词>      在静态前端资源中检索文案（普通版建议改用 live）
  check <文本>         检查词库是否会命中指定文本
  missing              扫描 IDE 静态资源中疑似未收录的文案
  live                 从运行中的应用页面抓取疑似未翻译文本
  screenshot           通过 CDP 截取运行中的应用主页面（PNG）

选项:
  --app normal|ide|both  目标应用，默认 both（missing 默认 ide，screenshot 默认 normal）
  --out <路径>           screenshot 输出文件路径，默认 ./screenshot.png
  --limit N              最多输出条数，默认 ${DEFAULT_LIMIT}
  --overlay <路径>       指定词库文件，默认 resources/antigravity-hans-overlay.js`);
}

function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=');
    options[name] = inline ?? args[++index];
  }
  return options;
}

function resolveApps(option = 'both') {
  if (option === 'both') return ['normal', 'ide'];
  if (!APP_DEFS[option]) throw new Error(`未知应用: ${option}`);
  return [option];
}

async function main() {
  const [command = 'info', ...rest] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }
  const options = parseOptions(rest);
  const limit = Number(options.limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit 必须是正整数');
  const overlayPath = options.overlay ? path.resolve(options.overlay) : OVERLAY_PATH;

  switch (command) {
    case 'info':
      await printInfo();
      break;
    case 'search': {
      const needle = options._.join(' ').trim();
      if (!needle) throw new Error('search 需要一个关键词');
      searchResources(resolveApps(options.app), needle, limit);
      break;
    }
    case 'check': {
      const text = options._.join(' ').trim();
      if (!text) throw new Error('check 需要一段文本');
      runCheck(text, overlayPath);
      break;
    }
    case 'missing':
      runMissing(resolveApps(options.app ?? 'ide'), limit, overlayPath);
      break;
    case 'live':
      await runLive(resolveApps(options.app), limit, overlayPath);
      break;
    case 'screenshot': {
      const targetApp = options.app && options.app !== 'both' ? options.app : 'normal';
      if (!APP_DEFS[targetApp]) throw new Error(`未知应用: ${targetApp}`);
      await runScreenshot(targetApp, options.out ?? 'screenshot.png');
      break;
    }
    default:
      printUsage();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[错误] ${error.message}`);
  process.exitCode = 1;
});
