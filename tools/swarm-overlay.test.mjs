import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../swarm-overlay.js', import.meta.url), 'utf8');

function fixture(hostname = 'swarm--swarm_board-ab12c', markers = true) {
  const elements = [];
  const listeners = new Map();
  const timeouts = new Map();
  const intervals = new Map();
  let nextTimer = 0;
  let observer;
  const add = (selectors, values = [], attrs = {}) => {
    const element = {
      selectors: new Set(selectors), attrs: new Map(Object.entries(attrs)), nodes: [],
      getAttribute(name) { return this.attrs.get(name) ?? null; },
      setAttribute(name, value) { this.attrs.set(name, value); },
    };
    for (const value of values) {
      const parentElement = {
        id: value.parentId || '', closest() { return value.inCode ? {} : null; },
        matches(selector) { return value.matches === selector; },
      };
      element.nodes.push({ nodeValue: value.text, parentElement });
    }
    elements.push(element);
    return element;
  };
  const board = add(['[data-testid="swarm-tab-feed"]'], [{ text: 'Board' }, { text: '3' }]);
  const title = add(['#swarm-title'], [{ text: 'Board' }]);
  const message = add(['#feed .msg-body'], [{ text: 'Board' }]);
  const memberTitle = add(['.o2-mstat'], [{ text: 'In review' }]);
  const tabs = add(['[data-testid="swarm-tabs"]'], [], { 'aria-label': 'Swarm views' });
  const initialOption = add(['#f-channel option[value=""]', '#f-channel option'], [{ text: 'All channels' }]);
  const userOption = add(['#f-channel option'], [{ text: 'All channels' }]);
  const empty = add(['#empty-body'], [
    { text: 'Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with ', parentId: 'empty-body' },
    { text: '/swarm', inCode: true },
    { text: '.', parentId: 'empty-body' },
  ]);
  const progress = add(['.o2-progt'], [
    { text: '3 of 7', matches: '.o2-progt > b' }, { text: ' tasks done', matches: '.o2-progt' },
  ]);
  const chips = add(['.o2-pchip'], [
    { text: '1 needs you', matches: '.o2-pchip' }, { text: '2 blocked', matches: '.o2-pchip' },
    { text: '1 thread open', matches: '.o2-pchip' }, { text: '4 threads open', matches: '.o2-pchip' },
    { text: '5 active', matches: '.o2-pchip' }, { text: '6 unknown', matches: '.o2-pchip' },
  ]);
  const upcoming = add(['.o2-qhdr'], [{ text: 'Up next · 6', matches: '.o2-qhdr' }]);
  const doneEmpty = add(['.o2-doneempty'], [{ text: 'No tasks completed yet.' }]);
  const review = add(['.o2-tprog.rev'], [{ text: 'In review' }]);
  const fakeDocument = {
    readyState: 'complete',
    querySelector(selector) {
      return markers && ['[data-testid="swarm-tabs"]', '[data-testid="swarm-empty-state"]'].includes(selector) ? {} : null;
    },
    querySelectorAll(group) {
      const selectors = group.split(',');
      return elements.filter((el) => selectors.includes('*') || selectors.some((selector) => el.selectors.has(selector)));
    },
    createTreeWalker(root) { let i = 0; return { nextNode: () => root.nodes[i++] ?? null }; },
  };
  const parent = { postMessage() {} };
  const fakeWindow = {
    location: { protocol: 'plugin:', hostname, pathname: '/' }, top: parent,
    localStorage: { getItem() { return null; } },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const context = {
    window: fakeWindow, document: fakeDocument, NodeFilter: { SHOW_TEXT: 4 }, MutationObserver: FakeMutationObserver,
    setTimeout(fn) { const id = ++nextTimer; timeouts.set(id, fn); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn) { const id = ++nextTimer; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    window: fakeWindow, parent, board, title, message, memberTitle, tabs, initialOption, userOption, empty,
    progress, chips, upcoming, doneEmpty, review, intervals,
    observer: () => observer,
    messageEvent(event) { for (const handler of listeners.get('message') ?? []) handler(event); },
    flush() { for (const [id, fn] of [...timeouts]) { timeouts.delete(id); fn(); } },
  };
}

test('Swarm controls translate without changing names, posts, commands or user options', () => {
  const f = fixture();
  assert.equal(f.board.nodes[0].nodeValue, '消息板');
  assert.equal(f.board.nodes[1].nodeValue, '3');
  assert.equal(f.tabs.getAttribute('aria-label'), '智能体群组视图');
  assert.equal(f.title.nodes[0].nodeValue, 'Board');
  assert.equal(f.message.nodes[0].nodeValue, 'Board');
  assert.equal(f.memberTitle.nodes[0].nodeValue, 'In review');
  assert.equal(f.initialOption.nodes[0].nodeValue, '所有频道');
  assert.equal(f.userOption.nodes[0].nodeValue, 'All channels');
  assert.ok(f.empty.nodes[0].nodeValue.startsWith('在此对话中启动'));
  assert.equal(f.empty.nodes[1].nodeValue, '/swarm');
  assert.equal(f.empty.nodes[2].nodeValue, '。');
  assert.deepEqual(f.progress.nodes.map((node) => node.nodeValue), ['3 / 7', ' 项任务已完成']);
  assert.deepEqual(f.chips.nodes.map((node) => node.nodeValue),
    ['1 项需要你参与', '2 项受阻', '1 条任务线未结束', '4 条任务线未结束', '5 项进行中', '6 unknown']);
  assert.equal(f.upcoming.nodes[0].nodeValue, '接下来 · 6');
  assert.equal(f.doneEmpty.nodes[0].nodeValue, '暂无已完成的任务。');
  assert.equal(f.review.nodes[0].nodeValue, '审核中');

  f.board.nodes[0].nodeValue = 'Members';
  f.observer().callback();
  f.flush();
  assert.equal(f.board.nodes[0].nodeValue, '成员', 'application updates are translated');

  const state = { type: 'antigravity-hans-preferences-state', lang: 'en', englishLabels: false };
  f.messageEvent({ source: {}, origin: 'https://127.0.0.1:50648', data: state });
  f.messageEvent({ source: f.parent, origin: 'https://example.test', data: state });
  assert.equal(f.board.nodes[0].nodeValue, '成员', 'untrusted messages cannot change the language');
  f.messageEvent({ source: f.parent, origin: 'https://127.0.0.1:50648', data: state });
  assert.equal(f.board.nodes[0].nodeValue, 'Members');
  assert.equal(f.tabs.getAttribute('aria-label'), 'Swarm views');
  assert.equal(f.empty.nodes[1].nodeValue, '/swarm');
  assert.deepEqual(f.progress.nodes.map((node) => node.nodeValue), ['3 of 7', ' tasks done']);
  assert.equal(f.chips.nodes[1].nodeValue, '2 blocked');
  f.messageEvent({ source: f.parent, origin: 'https://127.0.0.1:50648', data: { ...state, lang: 'zh' } });
  assert.equal(f.board.nodes[0].nodeValue, '成员');
  f.window.__antigravityZhPatchCleanup();
  assert.equal(f.board.nodes[0].nodeValue, 'Members');
  assert.equal(f.intervals.size, 0);
  assert.equal(f.observer().disconnected, true);
});

test('Swarm overlay rejects other plugin pages and missing board markers', () => {
  for (const f of [fixture('other--swarm_board-ab12c'), fixture('swarm--swarm_board-ab12c', false)]) {
    assert.equal(f.board.nodes[0].nodeValue, 'Board');
    assert.notEqual(f.window.__antigravityZhPatchInstalled, true);
  }
});
