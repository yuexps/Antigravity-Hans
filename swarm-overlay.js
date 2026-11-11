(() => {
  if (typeof window === 'undefined' || window.location?.protocol !== 'plugin:' ||
      !/^swarm--swarm_board-[a-z0-9]{5}$/i.test(window.location.hostname) ||
      !['', '/'].includes(window.location.pathname)) return;

  const fingerprint = window.__antigravityZhPatchRequestedFingerprint || 'swarm-20261111-r2';
  if (window.__antigravityZhPatchInstalled === true && window.__observedDocument === document &&
      window.__antigravityZhPatchFingerprint === fingerprint) return;
  if (typeof window.__antigravityZhPatchCleanup === 'function') window.__antigravityZhPatchCleanup();

  // These selectors address application-owned controls only. Member names,
  // board posts, paths, raw files and narrator-generated content are excluded.
  const textSelectors = [
    '[data-testid="swarm-loading"]', '#live-label',
    '[data-testid="swarm-tab-overview"]', '[data-testid="swarm-tab-feed"]',
    '[data-testid="swarm-tab-members"]', '[data-testid="swarm-tab-graph"]', '[data-testid="swarm-tab-raw"]',
    '#ov-label .ov-label-text', '#ov-mode', '#ov-footer .ov-hint > span', '#ov-open-coord',
    '#f-agent option[value=""]', '#f-mention option[value=""]', '#f-mention option[value="@none"]',
    '#f-mention option[value="@all"]', '#f-channel option[value=""]', '#filters label.switch', '#jump-latest',
    '#replay-live', '#replay-timing option', '#tab-graph label.switch', '#tab-graph .legend-item', '#raw-copy-label',
    '#empty-title', '#empty-body', '#empty .empty-hint',
    '[data-testid="swarm-feed-empty"]', '[data-testid="swarm-unread-divider"]',
    '[data-testid="swarm-message-more"]', '[data-testid="swarm-overview-badge"]',
    '[data-testid="swarm-overview-stale"]', '[data-testid="swarm-onboarding"] .o2-onb-h',
    '[data-testid="swarm-onboarding"] .o2-onb-steps', '[data-testid="swarm-onboarding"] .o2-onb-wait',
    '.o2-msec > span', '.o2-mret > span:first-child', '.o2-mrow.working .o2-mstat.info',
    '.o2-mrow.needs_you .o2-mstat.warn', '.o2-team > .o2-h', '.o2-team .o2-lb > b',
    '.o2-br > .o2-h', '.o2-none', '.o2-team .o2-m.all', '.o2-more', '.o2-tvh > b',
    '.o2-progt', '.o2-pchip', '.o2-qhdr', '.o2-doneempty', '.o2-tprog.rev',
  ];
  const attributeSelectors = [
    '[data-testid="swarm-live"]', '[data-testid="swarm-tabs"]', '[data-testid="swarm-overview-system"]',
    '[data-testid="swarm-search"]', '[data-testid="swarm-filter-toggle"]', '[data-testid="swarm-channel-tabs"]',
    '#f-agent', '#f-mention', '#f-channel', '#agents', '#replay-start', '#replay-back', '#replay-play',
    '#replay-fwd', '#replay-slider', '#replay-live', '#replay-timing', '#replay-speed', '#g-hide-inactive',
    '#filters label.switch', '#tab-graph label.switch',
    '#raw-copy', '[data-testid="swarm-overview-badge"]', '.o2-msin', '.o2-crew', '.o2-team .o2-m.all',
    '.o2-tvx', '.o2-tvnav', '.o2-tvstrip',
  ];
  const phrases = new Map([
    ["Looking for this conversation's swarm…", '正在查找此对话的智能体群组…'],
    ['Live', '实时'], ['Reconnecting', '正在重新连接'], ['Overview', '概览'], ['Board', '消息板'],
    ['Members', '成员'], ['Graph', '关系图'], ['Raw', '原始数据'], ['Filters', '筛选'],
    ['Filters (active)', '筛选（已启用）'], ['Latest', '最新'], ['Follow', '跟随'],
    ['From anyone', '来自任意成员'], ['To anyone', '发给任意成员'], ['To no one', '未提及任何人'],
    ['To @all', '发给 @all'], ['All channels', '所有频道'], ['Even pacing', '等间隔'],
    ['Real-time gaps', '按真实时间间隔'], ['Hide inactive', '隐藏非活跃成员'],
    ['posted with no mention', '发帖时未提及他人'], ['Copy', '复制'], ['Copied', '已复制'],
    ['Copy failed', '复制失败'], ['No swarm in this conversation', '当前对话没有智能体群组'],
    ['Watching for a swarm', '正在等待智能体群组'],
    ['Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with',
      '在此对话中启动的智能体群组会自动显示在这里，包括消息板、成员和 @提及关系图。使用'],
    ['Open this pane from a conversation to see its swarm. Swarms started there appear here automatically; start one with',
      '从对话中打开此面板即可查看智能体群组。该对话中启动的群组会自动显示在这里；使用'],
    ['No posts match', '没有匹配的消息'], ['Try a different search or member filter.', '请尝试其他搜索内容或成员筛选条件。'],
    ['Clear filters', '清除筛选'], ['No posts yet', '暂无消息'],
    ['Posts to the swarm board will appear here as members talk.', '成员交流时，发送到群组消息板的内容会显示在这里。'],
    ['New', '新消息'], ['Show more', '展开'], ['Show less', '收起'],
    ['overview · from the narrator’s notes', '概览 · 来自叙述者的笔记'],
    ["overview · from the narrator's notes", '概览 · 来自叙述者的笔记'],
    ['Narrator’s page', '叙述者页面'], ["Narrator's page", '叙述者页面'],
    ["Retry narrator's page", '重试叙述者页面'], ["narrator's page · AI-generated", '叙述者页面 · AI 生成'],
    ['Want this view different? Tell the coordinator.', '想调整此视图？请告诉协调员。'],
    ['Open coordinator chat', '打开协调员对话'], ['updating', '更新中'], ['watching', '等待中'],
    ['stopped', '已停止'], ['stale', '未更新'], ['paused: quota', '已暂停：额度不足'], ['paused: error', '已暂停：出错'],
    ['Your swarm is starting', '智能体群组正在启动'], ['One goal', '一个目标'],
    ['The coordinator splits it into tasks.', '协调员将目标拆分为任务。'], ['Many workers', '多个成员'],
    ['Each takes a task, and they run in parallel.', '每个成员负责一项任务，并行工作。'],
    ['One board', '一个消息板'], ['Updates land here. You step in only when asked.', '进展会显示在这里，只有需要时才请你参与。'],
    ['Waiting for the first update', '正在等待首次更新'], ['Active', '活跃'], ['Team', '团队'],
    ['Standing by', '待命'], ['Retired', '已退出'], ['Coordinator · Working', '协调员 · 工作中'],
    ['Coordinator', '协调员'], ['Working', '工作中'], ['Needs you', '需要你'], ['The team', '团队'],
    ['Blocked', '受阻'], ['Running', '进行中'], ['Planned next', '接下来计划'], ['Done', '已完成'],
    ['Goal', '目标'], ['Threads', '任务线'], ['Now', '现在'], ['Progress', '进度'],
    ['Nothing blocked', '没有受阻事项'], ['Nothing running', '没有进行中的事项'],
    ['Nothing planned', '没有计划中的事项'], ['All', '全部'],
    ['tasks done', '项任务已完成'], ['No tasks completed yet.', '暂无已完成的任务。'], ['In review', '审核中'],
    ['Updates automatically', '自动更新'], ['Lost contact with the swarm sidecar; retrying', '与群组面板的连接已断开，正在重试'],
    ['Swarm views', '智能体群组视图'], ['System alerts', '系统提醒'], ['Search posts', '搜索消息'],
    ['Search', '搜索'], ['Channels', '频道'], ['Show posts by one member', '显示某个成员的消息'],
    ['Filter by poster', '按发送者筛选'], ['Show posts that call on one member', '显示提及某个成员的消息'],
    ['Filter by recipient', '按接收者筛选'], ['Show posts in one channel', '显示某个频道的消息'],
    ['Filter by channel', '按频道筛选'], ["Show or hide each member's posts", '显示或隐藏各成员的消息'],
    ['Keep the newest post in view', '始终显示最新消息'],
    ['Jump to start', '跳至开头'], ['Previous post (←)', '上一条消息（←）'], ['Previous post', '上一条消息'],
    ['Play / pause replay (space)', '播放或暂停回放（空格）'], ['Play replay', '播放回放'], ['Pause replay', '暂停回放'],
    ['Next post (→)', '下一条消息（→）'], ['Next post', '下一条消息'], ['Scrub through board posts', '浏览消息板记录'],
    ['Replay position', '回放位置'], ['Show everything and follow live', '显示全部内容并实时跟随'],
    ['Replay pacing', '回放节奏'], ['Replay speed', '回放速度'],
    ['Hide killed and inactive members from the graph', '在关系图中隐藏已退出和非活跃的成员'],
    ['Copy to clipboard', '复制到剪贴板'], ['Search members', '搜索成员'], ['Filter by worker', '按成员筛选'],
    ['All workers', '所有成员'], ['Close', '关闭'], ['Previous', '上一项'], ['Next', '下一项'], ['Frames', '帧'],
    ['The narrator is updating the overview', '叙述者正在更新概览'],
    ['The narrator is waiting for new board posts', '叙述者正在等待消息板的新内容'],
    ['The narrator was killed; the overview no longer updates', '叙述者已停止，概览不再更新'],
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
    if (!document.querySelector('[data-testid="swarm-tabs"]') || !document.querySelector('[data-testid="swarm-empty-state"]')) return;
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
