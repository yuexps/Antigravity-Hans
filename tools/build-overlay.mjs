#!/usr/bin/env node
// 根据 resources/src/ 模块化词库与模板自动构建主 overlay 与独立插件 overlay
// 用法:
//   node tools/build-overlay.mjs          # 构建并写入生成产物
//   node tools/build-overlay.mjs --check  # 仅校验产物与源码是否同步（供 CI 使用）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'resources', 'src');
const ENGINE_PATH = path.join(SRC_DIR, 'runtime', 'engine.js');
const RULES_PATH = path.join(SRC_DIR, 'runtime', 'rules.js');
const IDE_NLS_PATH = path.join(SRC_DIR, 'ide-nls.json');
const SWARM_RUNTIME_PATH = path.join(SRC_DIR, 'runtime', 'swarm.js');
const DICT_DIR = path.join(SRC_DIR, 'dict');
const PLUGINS_DIR = path.join(SRC_DIR, 'plugins');
const SWARM_PLUGIN_PATH = path.join(PLUGINS_DIR, 'swarm.json');
const OUTPUT_PATH = path.join(ROOT, 'resources', 'antigravity-hans-overlay.js');
const SWARM_OUTPUT_PATH = path.join(ROOT, 'resources', 'swarm-overlay.js');

const DICT_FILES = [
  'common.json',
  'settings.json',
  'chat-agent.json',
  'marketplace.json',
  'ide.json',
];

const POLARITY_POSITIVE = /(allow|enable|approve|accept|trust|permit|always|grant)/i;
const POLARITY_NEGATIVE = /(deny|disable|reject|block|never|revoke|restrict|without|denied)/i;
const ZH_PERMISSIVE = /(允许|启用|批准|接受|信任|始终|授权)/;
const ZH_RESTRICTIVE = /(拒绝|禁用|拦截|阻止|从不|禁止|取消授权|撤销)/;

// 校验单条词库键值对的合法性与权限语义一致性
function validatePhraseEntry(sourceLabel, key, val, errors) {
  if (typeof val !== 'string') {
    errors.push(`[${sourceLabel}] 译文不是字符串: ${JSON.stringify(key)}`);
    return false;
  }
  if (!key || !val) {
    errors.push(`[${sourceLabel}] 空键或空译文: ${JSON.stringify(key)}`);
    return false;
  }
  if (key === val) {
    errors.push(`[${sourceLabel}] 键与译文相同（无需收录）: ${JSON.stringify(key)}`);
    return false;
  }
  if (/[\r\n\t]/.test(key)) {
    errors.push(`[${sourceLabel}] 键包含控制字符: ${JSON.stringify(key)}`);
    return false;
  }
  const posEn = POLARITY_POSITIVE.test(key) && !POLARITY_NEGATIVE.test(key);
  const negEn = POLARITY_NEGATIVE.test(key) && !POLARITY_POSITIVE.test(key);
  if (posEn && ZH_RESTRICTIVE.test(val) && !ZH_PERMISSIVE.test(val)) {
    errors.push(`[${sourceLabel}] 疑似权限语义反转: ${JSON.stringify(key)} -> ${JSON.stringify(val)}`);
  }
  if (negEn && ZH_PERMISSIVE.test(val) && !ZH_RESTRICTIVE.test(val)) {
    errors.push(`[${sourceLabel}] 疑似权限语义反转: ${JSON.stringify(key)} -> ${JSON.stringify(val)}`);
  }
  return true;
}

function readTextLF(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

export function buildOverlayContent() {
  const engine = readTextLF(ENGINE_PATH);
  const rules = readTextLF(RULES_PATH).replace(/\n$/, '');
  const ideNls = JSON.parse(readTextLF(IDE_NLS_PATH));

  const seen = new Map();
  const entries = [];
  const errors = [];

  for (const fileName of DICT_FILES) {
    const filePath = path.join(DICT_DIR, fileName);
    if (!fs.existsSync(filePath)) continue;
    const dict = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const [key, val] of Object.entries(dict)) {
      if (!validatePhraseEntry(fileName, key, val, errors)) continue;
      if (seen.has(key)) {
        errors.push(`重复词条 ${JSON.stringify(key)} 同时存在于 ${seen.get(key)} 与 ${fileName}`);
        continue;
      }
      seen.set(key, fileName);
      entries.push([key, val]);
    }
  }

  if (errors.length > 0) {
    throw new Error('词库校验失败:\n' + errors.map((e) => '  - ' + e).join('\n'));
  }

  // 严格按源文长度倒序排列，同长度按字典序稳定排序
  entries.sort((a, b) => (b[0].length - a[0].length) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const ideNlsLines = ideNls.map((item) => `    ${JSON.stringify(item)},`).join('\n');
  const phraseLines = entries.map(([k, v]) => `    [${JSON.stringify(k)}, ${JSON.stringify(v)}],`).join('\n');

  if (
    !engine.includes('/* __IDE_NLS_ENTRIES__ */') ||
    !engine.includes('/* __PHRASES_ENTRIES__ */') ||
    !engine.includes('/* __RULES_MODULE__ */')
  ) {
    throw new Error('engine.js 缺少必需占位符');
  }

  const output = engine
    .replace('    /* __IDE_NLS_ENTRIES__ */', () => ideNlsLines)
    .replace('    /* __PHRASES_ENTRIES__ */', () => phraseLines)
    .replace('  /* __RULES_MODULE__ */', () => rules);

  return { output, phraseCount: entries.length, ideNlsCount: ideNls.length };
}

export function buildSwarmOverlayContent() {
  const runtime = readTextLF(SWARM_RUNTIME_PATH);
  const config = JSON.parse(readTextLF(SWARM_PLUGIN_PATH));
  const errors = [];

  if (typeof config.fingerprint !== 'string' || !config.fingerprint) {
    errors.push('[plugins/swarm.json] 缺少 fingerprint');
  }
  if (typeof config.hostPattern !== 'string' || !config.hostPattern) {
    errors.push('[plugins/swarm.json] 缺少 hostPattern');
  } else {
    try { new RegExp(config.hostPattern, 'i'); }
    catch (err) { errors.push(`[plugins/swarm.json] hostPattern 正则无效: ${err.message}`); }
  }
  for (const field of ['markers', 'textSelectors', 'attributeSelectors']) {
    if (!Array.isArray(config[field]) || config[field].length === 0) {
      errors.push(`[plugins/swarm.json] 缺少非空数组 ${field}`);
    }
  }
  const phrasesObj = config.phrases && typeof config.phrases === 'object' ? config.phrases : {};
  const entries = [];
  for (const [key, val] of Object.entries(phrasesObj)) {
    if (!validatePhraseEntry('plugins/swarm.json', key, val, errors)) continue;
    entries.push([key, val]);
  }
  if (errors.length > 0) {
    throw new Error('Swarm 插件词库校验失败:\n' + errors.map((e) => '  - ' + e).join('\n'));
  }

  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const formatList = (items) => items.map((item) => `    ${JSON.stringify(item)},`).join('\n');
  const phraseLines = entries.map(([k, v]) => `    [${JSON.stringify(k)}, ${JSON.stringify(v)}],`).join('\n');

  const placeholders = [
    "'__SWARM_HOST_PATTERN__'",
    "'__SWARM_FINGERPRINT__'",
    '/* __SWARM_MARKERS__ */',
    '/* __SWARM_TEXT_SELECTORS__ */',
    '/* __SWARM_ATTR_SELECTORS__ */',
    '/* __SWARM_PHRASES__ */',
  ];
  for (const ph of placeholders) {
    if (!runtime.includes(ph)) throw new Error(`runtime/swarm.js 缺少必需占位符: ${ph}`);
  }

  const output = runtime
    .replace("'__SWARM_HOST_PATTERN__'", () => JSON.stringify(config.hostPattern))
    .replace("'__SWARM_FINGERPRINT__'", () => JSON.stringify(config.fingerprint))
    .replace('    /* __SWARM_MARKERS__ */', () => formatList(config.markers))
    .replace('    /* __SWARM_TEXT_SELECTORS__ */', () => formatList(config.textSelectors))
    .replace('    /* __SWARM_ATTR_SELECTORS__ */', () => formatList(config.attributeSelectors))
    .replace('    /* __SWARM_PHRASES__ */', () => phraseLines);

  return { output, phraseCount: entries.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes('--check');
  const mainResult = buildOverlayContent();
  const swarmResult = buildSwarmOverlayContent();

  if (checkOnly) {
    const diffs = [];
    const existingMain = fs.existsSync(OUTPUT_PATH) ? readTextLF(OUTPUT_PATH) : '';
    if (existingMain !== mainResult.output) diffs.push('resources/antigravity-hans-overlay.js');
    const existingSwarm = fs.existsSync(SWARM_OUTPUT_PATH) ? readTextLF(SWARM_OUTPUT_PATH) : '';
    if (existingSwarm !== swarmResult.output) diffs.push('resources/swarm-overlay.js');
    if (diffs.length > 0) {
      console.error(`[错误] ${diffs.join('、')} 与 resources/src/ 不同步，请运行: node tools/build-overlay.mjs`);
      process.exit(1);
    }
    console.log(
      `[通过] overlay 产物与源码同步（主词条 ${mainResult.phraseCount} 条，IDE NLS ${mainResult.ideNlsCount} 条，Swarm 插件 ${swarmResult.phraseCount} 条）`,
    );
  } else {
    fs.writeFileSync(OUTPUT_PATH, mainResult.output, 'utf8');
    fs.writeFileSync(SWARM_OUTPUT_PATH, swarmResult.output, 'utf8');
    console.log(
      `[成功] 已生成 resources/antigravity-hans-overlay.js（主词条 ${mainResult.phraseCount} 条，IDE NLS ${mainResult.ideNlsCount} 条）与 resources/swarm-overlay.js（Swarm 插件 ${swarmResult.phraseCount} 条）`,
    );
  }
}
