(() => {
  const hostPattern = new RegExp('__SWARM_HOST_PATTERN__', 'i');
  if (typeof window === 'undefined' || window.location?.protocol !== 'plugin:' ||
      !hostPattern.test(window.location.hostname) ||
      !['', '/'].includes(window.location.pathname)) return;

  const fingerprint = window.__antigravityZhPatchRequestedFingerprint || '__SWARM_FINGERPRINT__';
  if (window.__antigravityZhPatchInstalled === true && window.__observedDocument === document &&
      window.__antigravityZhPatchFingerprint === fingerprint) return;
  if (typeof window.__antigravityZhPatchCleanup === 'function') window.__antigravityZhPatchCleanup();

  const markers = [
    /* __SWARM_MARKERS__ */
  ];
  // 仅针对插件自身控件选择器翻译，排除成员名、消息正文、路径、原始文件与叙述者生成内容
  const textSelectors = [
    /* __SWARM_TEXT_SELECTORS__ */
  ];
  const attributeSelectors = [
    /* __SWARM_ATTR_SELECTORS__ */
  ];
  const phrases = new Map([
    /* __SWARM_PHRASES__ */
  ]);

  const originals = new WeakMap();
  const originalAttrs = new WeakMap();
  let observer, timer, requestTimer;
  let cancelled = false;
  let lang = 'zh';
  try { if (window.localStorage?.getItem('antigravityHansLang') === 'en') lang = 'en'; } catch (_e) { /* unavailable */ }

  function translate(value, node) {
    const text = value.trim();
    if (node?.parentElement?.id === 'empty-body' && text === '.') return value.replace('.', '。');
    let result = phrases.get(text);
    const parent = node?.parentElement;
    let match;
    if (!result && parent?.matches?.('.o2-pchip')) {
      if ((match = text.match(/^(\d+) needs? you$/))) result = `${match[1]} 项需要你参与`;
      else if ((match = text.match(/^(\d+) blocked$/))) result = `${match[1]} 项受阻`;
      else if ((match = text.match(/^(\d+) threads? open$/))) result = `${match[1]} 条任务线未结束`;
      else if ((match = text.match(/^(\d+) active$/))) result = `${match[1]} 项进行中`;
    } else if (!result && parent?.matches?.('.o2-progt > b') &&
        (match = text.match(/^(\d+) of (\d+)$/))) {
      result = `${match[1]} / ${match[2]}`;
    } else if (!result && parent?.matches?.('.o2-qhdr') && (match = text.match(/^Up next · (\d+)$/))) {
      result = `接下来 · ${match[1]}`;
    }
    const more = text.match(/^\+(\d+) more$/);
    if (!result && more) result = `还有 ${more[1]} 项`;
    return result ? value.replace(text, () => result) : value;
  }

  function processText(node, apply) {
    if (node.parentElement?.closest('code, pre, script, style, [contenteditable="true"]')) return;
    const value = node.nodeValue || '';
    const record = originals.get(node);
    if (!apply) {
      if (record && value === record.translated) node.nodeValue = record.original;
      originals.delete(node);
      return;
    }
    if (record && value === record.translated) return;
    const next = translate(value, node);
    if (next !== value) {
      originals.set(node, { original: value, translated: next });
      node.nodeValue = next;
    }
  }

  function processAttributes(element, apply) {
    let records = originalAttrs.get(element);
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const value = element.getAttribute(attr);
      const record = records?.get(attr);
      if (!apply) {
        if (record && value === record.translated) element.setAttribute(attr, record.original);
        records?.delete(attr);
        continue;
      }
      if (!value || (record && value === record.translated)) continue;
      const next = translate(value);
      if (next !== value) {
        if (!records) originalAttrs.set(element, (records = new Map()));
        records.set(attr, { original: value, translated: next });
        element.setAttribute(attr, next);
      }
    }
  }

  function refresh(apply = lang === 'zh') {
    for (const root of document.querySelectorAll(textSelectors.join(','))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) processText(node, apply);
    }
    for (const element of document.querySelectorAll(attributeSelectors.join(','))) processAttributes(element, apply);
  }

  function setLang(next) {
    if (next !== 'en' && next !== 'zh') return;
    if (next === lang) return;
    lang = next;
    refresh(next === 'zh');
  }

  function onMessage(event) {
    let topWindow;
    try { topWindow = window.top; } catch (_e) { return; }
    if (event.source !== topWindow || !event.data || event.data.type !== 'antigravity-hans-preferences-state') return;
    if (event.origin !== 'null' && event.origin !== 'vscode-file://vscode-app' &&
        !/^https?:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(event.origin)) return;
    setLang(event.data.lang);
  }

  function requestPreferences() {
    try { if (window.top && window.top !== window) window.top.postMessage({ type: 'antigravity-hans-preferences-request' }, '*'); }
    catch (_e) { /* parent unavailable */ }
  }

  function boot() {
    if (cancelled) return;
    if (!markers.every((selector) => document.querySelector(selector))) return;
    window.__antigravityZhPatchInstalled = true;
    window.__observedDocument = document;
    window.__antigravityZhPatchFingerprint = fingerprint;
    refresh();
    observer = new MutationObserver(() => {
      if (cancelled || lang !== 'zh' || timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; if (!cancelled) refresh(); }, 40);
    });
    observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder'] });
    window.addEventListener('message', onMessage);
    requestPreferences();
    requestTimer = setInterval(requestPreferences, 3000);
  }

  window.__antigravityZhPatchCleanup = () => {
    cancelled = true;
    observer?.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    if (requestTimer !== undefined) clearInterval(requestTimer);
    window.removeEventListener('DOMContentLoaded', boot);
    window.removeEventListener('message', onMessage);
    refresh(false);
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
