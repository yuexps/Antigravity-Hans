#!/usr/bin/env node
// 词典体检：把“永远匹配不到”的词条、重复键、语义反转挡在提交之前
// 用法: node tools/lint-overlay.mjs [overlay.js 路径]

import fs from 'node:fs';

const file = process.argv[2] ?? 'resources/antigravity-hans-overlay.js';
const source = fs.readFileSync(file, 'utf8');

const arrayStart = source.indexOf('[', source.indexOf('const phrases = new Map(['));
const arrayEnd = source.indexOf('\n  ]);', arrayStart);
if (arrayStart < 0 || arrayEnd < 0) {
  console.error('未能在 ' + file + ' 中定位词库数组');
  process.exit(2);
}
const entries = new Function('return ' + source.slice(arrayStart, arrayEnd + 4))();

const errors = [];
const warnings = [];
const seen = new Set();

// 词库为单一长句优先列表：源文长度必须单调不增，避免再次出现分区或随意追加
for (let i = 1; i < entries.length; i++) {
  if (String(entries[i][0]).length > String(entries[i - 1][0]).length) {
    errors.push('词库未按源文长度倒序: ' + JSON.stringify(String(entries[i][0]).slice(0, 40)));
    break;
  }
}

// 译文里允许保留的英文：产品名、协议名、命令名、路径名
const ALLOWED_LATIN = new Set([
  'agy', 'android', 'antigravity', 'antigravity-browser-profile', 'blaze', 'browser', 'cascade',
  'chrome', 'citc', 'cli', 'devtools', 'gemini', 'gemini-api', 'git', 'gitignore', 'http', 'https',
  'ide', 'inline-actions-feedback', 'javascript', 'jetski', 'json', 'lint', 'localhost', 'markdown',
  'mcp', 'plan', 'powershell', 'python', 'sdk', 'shell', 'sidecar', 'tab', 'token', 'url', 'vcs',
]);

const POLARITY_POSITIVE = /(allow|enable|approve|accept|trust|permit|always|grant)/i;
const POLARITY_NEGATIVE = /(deny|disable|reject|block|never|revoke|restrict|without|denied)/i;
const ZH_PERMISSIVE = /(允许|启用|批准|接受|信任|始终|授权)/;
const ZH_RESTRICTIVE = /(禁止|禁用|拒绝|阻止|从不|撤销|限制|不允许)/;

for (const [key, value] of entries) {
  const where = JSON.stringify(String(key).slice(0, 60));
  if (!key || !value) errors.push('存在空键或空值: ' + where);
  if (String(key).includes('\\')) errors.push('键含字面反斜杠，永远匹配不到真实 UI 文本: ' + where);
  if (/[\u0000-\u001f]/.test(key) || /[\u0000-\u001f]/.test(value)) errors.push('键或值含控制字符: ' + where);
  if (key === value) errors.push('键与译文完全相同（无效条目）: ' + where);
  if (seen.has(key)) errors.push('重复键: ' + where);
  seen.add(key);

  const keyPositive = POLARITY_POSITIVE.test(key);
  const keyNegative = POLARITY_NEGATIVE.test(key);
  const valuePermissive = ZH_PERMISSIVE.test(value);
  const valueRestrictive = ZH_RESTRICTIVE.test(value);
  if ((keyPositive && !keyNegative && valueRestrictive && !valuePermissive) ||
      (keyNegative && !keyPositive && valuePermissive && !valueRestrictive)) {
    errors.push('疑似语义反转（权限类词条必须人工复核）: ' + where + ' => ' + JSON.stringify(String(value).slice(0, 30)));
  }

  // 只盯小写英文单词：专有名词与协议名通常是大写，混在中文里的小写词基本就是漏译
  const leftovers = [...new Set((String(value).match(/\b[a-z][a-z'-]{2,}\b/g) || []))]
    .filter((word) => !ALLOWED_LATIN.has(word));
  if (leftovers.length) warnings.push('译文残留英文 ' + leftovers.join(',') + ': ' + where);
}

console.log('词典文件: ' + file);
console.log('词条总数: ' + entries.length);
console.log('错误: ' + errors.length + '  警告: ' + warnings.length);
for (const item of errors) console.log('  [错误] ' + item);
for (const item of warnings) console.log('  [警告] ' + item);
process.exit(errors.length ? 1 : 0);
