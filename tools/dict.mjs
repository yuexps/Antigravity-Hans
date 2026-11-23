#!/usr/bin/env node
// 词条管理 CLI：免手改 JSON 与 overlay，自动查重、排序并重建主词库与插件 overlay
// 用法:
//   node tools/dict.mjs add <group> <en> <zh>
//   node tools/dict.mjs set <group> <en> <zh>
//   node tools/dict.mjs remove [plugin:<name>] <en>
//   node tools/dict.mjs find <keyword>
//   node tools/dict.mjs import <file.json> --group <group>
//   node tools/dict.mjs stats

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOverlayContent, buildSwarmOverlayContent } from './build-overlay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DICT_DIR = path.join(ROOT, 'resources', 'src', 'dict');
const PLUGINS_DIR = path.join(ROOT, 'resources', 'src', 'plugins');
const OUTPUT_PATH = path.join(ROOT, 'resources', 'antigravity-hans-overlay.js');
const SWARM_OUTPUT_PATH = path.join(ROOT, 'resources', 'swarm-overlay.js');

const MAIN_GROUPS = ['common', 'settings', 'chat-agent', 'marketplace', 'ide'];

function listPluginGroups() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs
    .readdirSync(PLUGINS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `plugin:${name.slice(0, -5)}`);
}

function isPluginGroup(group) {
  return group.startsWith('plugin:');
}

function allGroups() {
  return [...MAIN_GROUPS, ...listPluginGroups()];
}

function groupPath(group) {
  const valid = allGroups();
  if (!valid.includes(group)) {
    throw new Error(`无效分组 "${group}"，可选分组: ${valid.join(', ')}`);
  }
  if (isPluginGroup(group)) {
    return path.join(PLUGINS_DIR, `${group.slice('plugin:'.length)}.json`);
  }
  return path.join(DICT_DIR, `${group}.json`);
}

function sortObjectKeys(data) {
  const sorted = {};
  for (const key of Object.keys(data).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted[key] = data[key];
  }
  return sorted;
}

function loadGroup(group) {
  const p = groupPath(group);
  if (!fs.existsSync(p)) return {};
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  return isPluginGroup(group) ? (parsed.phrases || {}) : parsed;
}

function saveGroup(group, data) {
  const p = groupPath(group);
  const sorted = sortObjectKeys(data);
  if (isPluginGroup(group)) {
    const config = JSON.parse(fs.readFileSync(p, 'utf8'));
    config.phrases = sorted;
    fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return;
  }
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

function findExistingMainGroup(key) {
  for (const g of MAIN_GROUPS) {
    const dict = loadGroup(g);
    if (Object.prototype.hasOwnProperty.call(dict, key)) return g;
  }
  return null;
}

function rebuild(group) {
  if (group && isPluginGroup(group)) {
    const { output, phraseCount } = buildSwarmOverlayContent();
    fs.writeFileSync(SWARM_OUTPUT_PATH, output, 'utf8');
    console.log(`[重建完成] resources/swarm-overlay.js（共 ${phraseCount} 条词条）`);
    return;
  }
  const { output, phraseCount } = buildOverlayContent();
  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
  console.log(`[重建完成] resources/antigravity-hans-overlay.js（共 ${phraseCount} 条词条）`);
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'add': {
      const [group, key, val] = args;
      if (!group || !key || !val) throw new Error('用法: node tools/dict.mjs add <group> <en> <zh>');
      if (isPluginGroup(group)) {
        const dict = loadGroup(group);
        if (Object.prototype.hasOwnProperty.call(dict, key)) {
          throw new Error(`词条已存在于 ${group}，如需覆盖请使用 set`);
        }
        dict[key] = val;
        saveGroup(group, dict);
      } else {
        const existing = findExistingMainGroup(key);
        if (existing) throw new Error(`词条已存在于 ${existing}.json，如需覆盖请使用 set`);
        const dict = loadGroup(group);
        dict[key] = val;
        saveGroup(group, dict);
      }
      console.log(`[新增] ${group}: ${JSON.stringify(key)} -> ${JSON.stringify(val)}`);
      rebuild(group);
      break;
    }
    case 'set': {
      const [group, key, val] = args;
      if (!group || !key || !val) throw new Error('用法: node tools/dict.mjs set <group> <en> <zh>');
      if (!isPluginGroup(group)) {
        const existing = findExistingMainGroup(key);
        if (existing && existing !== group) {
          const oldDict = loadGroup(existing);
          delete oldDict[key];
          saveGroup(existing, oldDict);
          console.log(`[迁移] ${existing}.json -> ${group}.json: ${JSON.stringify(key)}`);
        }
      }
      const dict = loadGroup(group);
      dict[key] = val;
      saveGroup(group, dict);
      console.log(`[更新] ${group}: ${JSON.stringify(key)} -> ${JSON.stringify(val)}`);
      rebuild(group);
      break;
    }
    case 'remove': {
      let targetGroup;
      let key;
      if (args.length >= 2 && isPluginGroup(args[0])) {
        [targetGroup, key] = args;
      } else {
        [key] = args;
      }
      if (!key) throw new Error('用法: node tools/dict.mjs remove [plugin:<name>] <en>');
      if (targetGroup) {
        const dict = loadGroup(targetGroup);
        if (!Object.prototype.hasOwnProperty.call(dict, key)) {
          throw new Error(`未在 ${targetGroup} 找到词条: ${JSON.stringify(key)}`);
        }
        delete dict[key];
        saveGroup(targetGroup, dict);
        console.log(`[删除] ${targetGroup}: ${JSON.stringify(key)}`);
        rebuild(targetGroup);
        break;
      }
      const existing = findExistingMainGroup(key);
      if (!existing) throw new Error(`未在主词库找到词条: ${JSON.stringify(key)}`);
      const dict = loadGroup(existing);
      delete dict[key];
      saveGroup(existing, dict);
      console.log(`[删除] ${existing}.json: ${JSON.stringify(key)}`);
      rebuild(existing);
      break;
    }
    case 'find': {
      const query = (args[0] || '').toLowerCase();
      if (!query) throw new Error('用法: node tools/dict.mjs find <keyword>');
      let hits = 0;
      for (const g of allGroups()) {
        const dict = loadGroup(g);
        for (const [k, v] of Object.entries(dict)) {
          if (k.toLowerCase().includes(query) || v.toLowerCase().includes(query)) {
            console.log(`[${g}] ${JSON.stringify(k)} => ${JSON.stringify(v)}`);
            hits++;
          }
        }
      }
      console.log(`共命中 ${hits} 条`);
      break;
    }
    case 'import': {
      const file = args[0];
      const groupIdx = args.indexOf('--group');
      const group = groupIdx >= 0 ? args[groupIdx + 1] : '';
      if (!file || !group) throw new Error('用法: node tools/dict.mjs import <file.json> --group <group>');
      const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
      const dict = loadGroup(group);
      let added = 0;
      let updated = 0;
      for (const [k, v] of Object.entries(incoming)) {
        if (!isPluginGroup(group)) {
          const existing = findExistingMainGroup(k);
          if (existing && existing !== group) {
            const oldDict = loadGroup(existing);
            oldDict[k] = v;
            saveGroup(existing, oldDict);
            updated++;
            continue;
          }
        }
        if (Object.prototype.hasOwnProperty.call(dict, k)) updated++;
        else added++;
        dict[k] = v;
      }
      saveGroup(group, dict);
      console.log(`[导入完成] ${group}：新增 ${added} 条，更新 ${updated} 条`);
      rebuild(group);
      break;
    }
    case 'stats': {
      let mainTotal = 0;
      for (const g of MAIN_GROUPS) {
        const count = Object.keys(loadGroup(g)).length;
        mainTotal += count;
        console.log(`  ${g.padEnd(16)} ${count} 条`);
      }
      console.log(`  ${'主词库小计'.padEnd(12)} ${mainTotal} 条`);
      const plugins = listPluginGroups();
      if (plugins.length > 0) {
        let pluginTotal = 0;
        for (const g of plugins) {
          const count = Object.keys(loadGroup(g)).length;
          pluginTotal += count;
          console.log(`  ${g.padEnd(16)} ${count} 条`);
        }
        console.log(`  ${'插件词库小计'.padEnd(11)} ${pluginTotal} 条`);
      }
      break;
    }
    default:
      console.log('用法: node tools/dict.mjs <add|set|remove|find|import|stats> ...');
      process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error('[错误]', err.message);
  process.exit(1);
}
