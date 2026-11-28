(() => {
  if (typeof window === 'undefined') return;
  const fingerprint = window.__antigravityZhPatchRequestedFingerprint || 'app-2.36.0-20261128-r2';
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
    'Extra High', 'High', 'Medium', 'Low',
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
  // 格式：[索引, 原文, 译文]
  const ideNlsSupplement = [
    /* __IDE_NLS_ENTRIES__ */
  ];

  // 仅在已验证的 IDE 2.6.0-2.8.0 工作台布局下补充未翻译的原生 NLS 条目
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
    /* __PHRASES_ENTRIES__ */
  ]);

  // 根据长度倒序排序
  /* __RULES_MODULE__ */

  function translateNode(root) {
    if (!root) return;
    if (shouldSkipSubtree(root)) {
      if (!isProtectedAgentContent(root)) return;
      restoreTrackedNode(root);
      // 正文容器可能在挂载后取得身份；继续遍历，以还原已有误译并保留固定界面控件。
      if (root.nodeType === Node.TEXT_NODE) return;
    }
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
      if (shouldSkip(node)) {
        if (isProtectedAgentContent(node)) restoreTrackedNode(node);
        continue;
      }
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
      } else if (!isFrame && data.type === preferenceRequest && e.source &&
        ((isWorkbench && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(e.origin)) ||
          /^plugin:\/\/swarm--swarm_board-[a-z0-9]{1,16}$/i.test(e.origin))) {
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
          const welcome = parent?.closest?.('[data-testid="coordinator-welcome"]');
          if (welcome) {
            welcome.__zh_patched = false;
            nodesToTranslate.push(welcome);
            continue;
          }
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
            mutation.attributeName === 'role' || mutation.attributeName === 'data-testid' ||
            mutation.attributeName === 'data-markdown-root' || mutation.attributeName === 'data-bubble-side') {
            nodesToTranslate.push(target);
          } else {
            elementsToTranslate.push(target);
          }
        } else {
          const welcome = mutation.target.nodeType === Node.ELEMENT_NODE &&
            mutation.target.closest?.('[data-testid="coordinator-welcome"]');
          if (welcome) {
            welcome.__zh_patched = false;
            nodesToTranslate.push(welcome);
            continue;
          }
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
      attributeFilter: ['aria-label', 'title', 'placeholder', 'alt', 'class', 'id', 'role', 'data-testid', 'data-markdown-root', 'data-bubble-side'],
    });
    mountToggleUI();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
