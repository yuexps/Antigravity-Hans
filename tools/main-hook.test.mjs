import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { classifyFrameURL, wrapFrameSource } from '../internal/patch/main_hook.mjs';

test('main_hook accepts IDE agent routes and Swarm board frames while rejecting unrelated URLs', () => {
  for (const [rawURL, expectedKind] of [
    ['http://127.0.0.1:1960/?extensionView=true', 'ide-agent'],
    ['http://127.0.0.1:1960/settings-standalone?extensionView=true', 'ide-agent'],
    ['http://127.0.0.1:1960/c/00000000-0000-4000-8000-000000000001?extensionView=true', 'ide-agent'],
    ['http://127.0.0.1:1960/customizations/browse', 'ide-agent'],
    ['http://127.0.0.1:1960/history', 'ide-agent'],
    ['plugin://swarm--swarm_board-7192/', 'swarm'],
    ['plugin://swarm--swarm_board-ab12c/', 'swarm'],
  ]) {
    const got = classifyFrameURL(rawURL);
    assert.equal(got?.kind, expectedKind, `expected ${rawURL} -> ${expectedKind}`);
  }

  for (const rejected of [
    'http://127.0.0.1:1960/preview',
    'http://127.0.0.1:1960/settings-standalone/preview',
    'http://127.0.0.1:1960/c/a/b',
    'http://127.0.0.1:1960/sidecars/..',
    'http://127.0.0.1:1960/%2f',
    'http://127.0.0.1:1960/#hash',
    'https://127.0.0.1:1960/',
    'http://example.test:1960/',
    'http://user@127.0.0.1:1960/',
    'plugin://other--swarm_board-7192/',
    'plugin://swarm--swarm_board-7192/extra',
    'vscode-file://vscode-app/workbench.html',
  ]) {
    assert.equal(classifyFrameURL(rejected), null, `should reject ${rejected}`);
  }
});

test('wrapFrameSource enforces runtime location and DOM marker guards', () => {
  const ideTarget = classifyFrameURL('http://127.0.0.1:1960/c/conv-1');
  const ideWrapped = wrapFrameSource(ideTarget, 'globalThis.ran = true;');
  for (const [location, hasRoot, expected] of [
    [{ protocol: 'http:', hostname: '127.0.0.1', port: '1960', pathname: '/c/conv-1' }, true, true],
    [{ protocol: 'http:', hostname: '127.0.0.1', port: '1960', pathname: '/c/conv-1' }, false, false],
    [{ protocol: 'http:', hostname: '127.0.0.1', port: '9999', pathname: '/c/conv-1' }, true, false],
    [{ protocol: 'http:', hostname: '127.0.0.1', port: '1960', pathname: '/preview' }, true, false],
  ]) {
    const ctx = { location, document: { getElementById: () => (hasRoot ? {} : null) } };
    vm.runInNewContext(ideWrapped, ctx);
    assert.equal(ctx.ran === true, expected);
  }

  const swarmTarget = classifyFrameURL('plugin://swarm--swarm_board-7192/');
  const swarmWrapped = wrapFrameSource(swarmTarget, 'globalThis.ran = true;');
  for (const [location, hasMarkers, expected] of [
    [{ protocol: 'plugin:', hostname: 'swarm--swarm_board-7192', pathname: '/' }, true, true],
    [{ protocol: 'plugin:', hostname: 'swarm--swarm_board-7192', pathname: '/' }, false, false],
    [{ protocol: 'plugin:', hostname: 'other--swarm_board-7192', pathname: '/' }, true, false],
  ]) {
    const ctx = { location, document: { querySelector: () => (hasMarkers ? {} : null) } };
    vm.runInNewContext(swarmWrapped, ctx);
    assert.equal(ctx.ran === true, expected);
  }
});
