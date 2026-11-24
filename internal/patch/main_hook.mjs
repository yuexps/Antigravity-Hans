// Antigravity IDE 主进程跨域子帧汉化注入模块（由静态补丁自动写入 resources/app/out/）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SWARM_HOST_RE = /^swarm--swarm_board-[a-z0-9]{1,16}$/i;
const IDE_STATIC_ROUTES = new Set([
  '/',
  '/settings-standalone',
  '/terminal-standalone',
  '/history',
  '/multi',
  '/new-project',
  '/artifact',
]);
const IDE_DYNAMIC_ROUTE_RE =
  /^(?:\/c\/[A-Za-z0-9_-]+|\/forked\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|\/view\/[A-Za-z0-9_-]+|\/battle\/[A-Za-z0-9_-]+|\/sidecars\/(?:triggers\/)?[A-Za-z0-9._-]+|\/customizations(?:\/browse|\/(?:plugins|sidecars)\/[A-Za-z0-9._-]+|\/marketplaces\/[A-Za-z0-9._-]+\/(?:plugins|skills|bundles)\/[A-Za-z0-9._-]+)?)$/;

// 判断子帧 URL 是否属于允许注入汉化脚本的 IDE 智能体或 Swarm 面板
export function classifyFrameURL(rawURL) {
  if (typeof rawURL !== 'string' || !rawURL) return null;
  let u;
  try {
    u = new URL(rawURL);
  } catch {
    return null;
  }
  if (u.username || u.password || u.hash) return null;

  if (u.protocol === 'plugin:') {
    if (u.port || (u.pathname !== '' && u.pathname !== '/')) return null;
    if (!SWARM_HOST_RE.test(u.hostname)) return null;
    return { kind: 'swarm', host: u.hostname.toLowerCase() };
  }

  if (u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.port) {
    const portNum = Number(u.port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) return null;
    const rawPath = rawURL.slice(u.origin.length).split('?')[0];
    if (rawPath.includes('..') || rawPath.includes('%2f') || rawPath.includes('%2F')) return null;
    const p = u.pathname;
    if (IDE_STATIC_ROUTES.has(p) || IDE_DYNAMIC_ROUTE_RE.test(p)) {
      return { kind: 'ide-agent', port: String(portNum), pathname: p };
    }
  }

  return null;
}

// 为目标子帧脚本附加执行期地址与 DOM 根节点二次校验
export function wrapFrameSource(target, source) {
  const body = String(source || '').trim();
  if (!body || !target) return '';
  if (target.kind === 'swarm') {
    return (
      `(() => { if (location.protocol !== 'plugin:' || location.hostname.toLowerCase() !== ${JSON.stringify(target.host)} || ` +
      `(location.pathname !== '/' && location.pathname !== '') || ` +
      `!document.querySelector('[data-testid="swarm-tabs"]') || ` +
      `!document.querySelector('[data-testid="swarm-empty-state"]')) return;\n${body}\n})()`
    );
  }
  if (target.kind === 'ide-agent') {
    return (
      `(() => { if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || ` +
      `location.port !== ${JSON.stringify(target.port)} || location.pathname !== ${JSON.stringify(target.pathname)} || ` +
      `!document.getElementById('root')) return;\n${body}\n})()`
    );
  }
  return '';
}

function loadOverlayScripts() {
  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const wbDir = path.join(outDir, 'vs', 'code', 'electron-browser', 'workbench');
  const readSafe = (name) => {
    try {
      return fs.readFileSync(path.join(wbDir, name), 'utf8');
    } catch {
      return '';
    }
  };
  return {
    overlay: readSafe('antigravity-hans-overlay.js'),
    swarm: readSafe('antigravity-hans-swarm-overlay.js'),
  };
}

function injectFrame(frame, scripts) {
  if (!frame || frame.isDestroyed?.()) return;
  const target = classifyFrameURL(frame.url);
  if (!target) return;
  const raw = target.kind === 'swarm' ? scripts.swarm : scripts.overlay;
  const wrapped = wrapFrameSource(target, raw);
  if (!wrapped) return;
  Promise.resolve(frame.executeJavaScript(wrapped, false)).catch(() => {});
}

async function installElectronHook() {
  if (globalThis.__antigravityHansMainHookInstalled) return;
  globalThis.__antigravityHansMainHookInstalled = true;

  const { app, webFrameMain } = await import('electron');
  const scripts = loadOverlayScripts();
  if (!scripts.overlay && !scripts.swarm) return;

  app.on('web-contents-created', (_event, wc) => {
    const injectByIds = (_e, _isMain, processId, routingId) => {
      try {
        const frame = webFrameMain.fromId(processId, routingId);
        if (frame) injectFrame(frame, scripts);
      } catch {
        /* 忽略已销毁的子帧 */
      }
    };

    const injectSubtree = () => {
      try {
        const frames = wc.mainFrame?.framesInSubtree || [];
        for (const frame of frames) injectFrame(frame, scripts);
      } catch {
        /* 忽略已销毁的窗口 */
      }
    };

    wc.on('did-frame-finish-load', injectByIds);
    wc.on('did-navigate-in-page', (_e, _url, _isMain, processId, routingId) => {
      injectByIds(_e, _isMain, processId, routingId);
    });
    wc.on('dom-ready', injectSubtree);
  });
}

if (typeof process !== 'undefined' && process.versions?.electron) {
  installElectronHook().catch(() => {});
}
