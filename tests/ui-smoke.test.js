// tests/ui-smoke.test.js — smoke tests for the browser UI script.
// ui_pin.js is an IIFE written for the renderer, so we execute it inside `vm`
// with a minimal DOM/browser stub and assert on observable behavior: it boots
// without throwing, its loops survive, and its main branches (degraded, pinned,
// stale hook) produce the expected side effects. This is the layer where the
// real-machine regressions happened (icon placement, panel, verify banner) —
// these smoke tests lock the basic wiring without a browser.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI_SRC = fs.readFileSync(path.join(__dirname, '..', 'ui_pin.js'), 'utf8');
const { hmacSha256Hex } = require('../pin-core.js');

const TOKEN = 'testtoken0123456789abcdef0123456789abcdef0123456789abcdef01234567';

function makeEl(tag, overrides) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: { setProperty() {}, cssText: '' },
    classList: { add() {}, remove() {}, contains() { return false; } },
    children: [],
    textContent: '',
    id: '',
    dataset: {},
    attributes: {},
    listeners: {},
    offsetWidth: 34,
    offsetHeight: 22,
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.unshift(c); return c; },
    remove() { el.removed = true; },
    contains(child) { return child === el; }, // real containment, not always-true
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute(k, v) { el.attributes[k] = v; },
    getAttribute(k) { return (overrides && overrides.attrs && overrides.attrs[k]) || null; },
    getBoundingClientRect() { return { left: 10, top: 400, right: 110, bottom: 450, width: 100, height: 50 }; },
    getClientRects() { return [{}]; },
    focus() {},
  };
  return el;
}

// Builds the browser stub + executes ui_pin.js. Returns handles to drive loops
// and to assert on fetch calls / DOM effects.
function boot(options) {
  options = options || {};
  const fetchCalls = [];
  const bodyChildren = [];
  const intervals = [];
  const rafQueue = [];
  const registry = {}; // getElementById registry
  const store = {};
  // composer element: elementFromPoint returns ITSELF in the non-overlay case
  // (top === r => visible); in the overlay case a separate element => covered
  const composerRegion = makeEl('div');
  const overlayEl = makeEl('div');
  const assistantMsg = makeEl('div', {
    attrs: { 'data-trajectory-message-role': 'assistant' },
  });
  assistantMsg.textContent = options.staleText || 'normal reply';

  function jsonRes(obj, ok) {
    return { ok: ok !== false, status: ok === false ? 500 : 200, json: () => Promise.resolve(obj) };
  }
  globalThis.__zpinTestToken = TOKEN;
  const fetchImpl = function (url, opts) {
    fetchCalls.push({ url: String(url), method: (opts && opts.method) || 'GET', opts: opts });
    if (String(url).indexOf('/api/challenge') >= 0) {
      if (options.challengeFail) return Promise.resolve(jsonRes({ nonce: 'aa', proof: 'bogus' }));
      return Promise.resolve(jsonRes({ nonce: 'aa', proof: hmacSha256Hex(TOKEN, 'aa') }));
    }
    if (String(url).indexOf('/api/pins') >= 0 && (!opts || !opts.method || opts.method === 'GET')) {
      return Promise.resolve(jsonRes({
        conversationId: 'sess-abc',
        pins: options.pins || [],
        limit: 3, activeCount: (options.pins || []).length, maxTextLen: 500,
        lastInject: options.lastInject || null,
        lastUncovered: null,
      }));
    }
    return Promise.resolve(jsonRes({ ok: true }));
  };

  const documentStub = {
    body: makeEl('body'),
    getElementById(id) { return registry[id] || null; },
    createElement(tag) { const e = makeEl(tag); return e; },
    querySelector(sel) {
      if (sel === '[data-session-id]') {
        return options.sessionEl === null ? null : makeEl('div', { attrs: { 'data-session-id': options.sessionId || 'sess_abc' } });
      }
      if (sel === '[data-conversation-selection-tooltip]') return null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.chat-composer-region') return options.noComposer ? [] : [composerRegion];
      if (sel === '[data-trajectory-message-role="assistant"]') return [assistantMsg];
      return [];
    },
    addEventListener() {}, removeEventListener() {},
    elementFromPoint() { return options.overlay ? overlayEl : composerRegion; },
  };
  // make the created icon discoverable by getElementById
  const realCreate = documentStub.createElement.bind(documentStub);
  documentStub.createElement = function (tag) {
    const e = realCreate(tag);
    const origAppend = e.appendChild;
    return e;
  };
  documentStub.body.appendChild = function (c) {
    bodyChildren.push(c);
    if (c.id) registry[c.id] = c;
    return c;
  };

  const sandbox = {
    window: {},
    document: documentStub,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    fetch: fetchImpl,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval() {},
    setTimeout: (fn) => { return 0; }, // do not auto-run timeouts
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    console,
    Date,
    JSON,
    Math,
    Promise,
    Object,
    Array,
    String,
    Number,
    parseInt,
    encodeURIComponent,
    RegExp,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  // O3 wires scroll/resize listeners on window; the stub sandbox needs them.
  // Also MutationObserver is only guarded by try/catch in the script, so a
  // missing global is fine, but addEventListener must exist.
  sandbox.addEventListener = function () {};
  sandbox.removeEventListener = function () {};
  sandbox.MutationObserver = function () { this.observe = function () {}; };

  // replace the token placeholder the same way inject-pin-ui.py does at patch
  // time, so the challenge HMAC verifies in the stub environment
  const src = UI_SRC.replace("'__ZPIN_TOKEN__'", JSON.stringify(TOKEN));
  vm.runInNewContext(src, sandbox, { filename: 'ui_pin.js' });
  return {
    fetchCalls,
    bodyChildren,
    intervals,
    rafQueue,
    registry,
    driveInterval(times) {
      for (let i = 0; i < times; i++) intervals.forEach((iv) => iv.fn());
    },
    driveFrames(times) {
      // rAF handlers re-register themselves; run a bounded number of frames
      for (let i = 0; i < times; i++) {
        const q = rafQueue.splice(0, rafQueue.length);
        q.forEach((fn) => fn());
      }
    },
  };
}

test('boots without throwing and verifies the server via challenge', async () => {
  const h = boot();
  assert.equal(h.fetchCalls.some((c) => c.url.indexOf('/api/challenge') >= 0), true);
  // let the verify promise settle, then drive the loops
  await new Promise((r) => setTimeout(r, 10));
  h.driveFrames(3);
  h.driveInterval(2);
});

test('icon appears when a visible composer exists (body-level mount)', async () => {
  const h = boot();
  await new Promise((r) => setTimeout(r, 10));
  h.driveFrames(2);
  assert.ok(h.registry['zpin-icon'], 'floating icon should be registered by id');
});

test('icon disappears when an overlay covers the composer (settings page)', async () => {
  const h = boot({ overlay: true });
  await new Promise((r) => setTimeout(r, 10));
  h.driveFrames(2);
  assert.equal(h.registry['zpin-icon'], undefined, 'no icon over a covered composer');
});

test('degraded mode: bogus challenge proof disables pin operations', async () => {
  const h = boot({ challengeFail: true });
  await new Promise((r) => setTimeout(r, 10));
  h.driveInterval(1);
  // after a failed verify the UI must not fetch pins with the token
  const pinFetches = h.fetchCalls.filter((c) => c.url.indexOf('/api/pins') >= 0);
  assert.equal(pinFetches.length, 0, 'no pin traffic in degraded mode');
});

test('stale hook: [PIN_STALE:1] on the last assistant message opens the ask banner', async () => {
  const h = boot({ staleText: 'some reply\n[PIN_STALE:1]', pins: [{ id: 'p1', text: '你是猫娘', state: 'active', source: 'manual' }] });
  await new Promise((r) => setTimeout(r, 10));
  h.driveInterval(2);
  const banner = h.bodyChildren.find((c) => c.id === 'zpin-stale');
  assert.ok(banner, 'stale ask banner should be created');
  // asked-once: a second interval pass must NOT create another banner
  h.driveInterval(2);
  const banners = h.bodyChildren.filter((c) => c.id === 'zpin-stale');
  assert.equal(banners.length, 1, 'banner asked once per pin per session');
});

test('no stale banner when the reply has no marker', async () => {
  const h = boot({ pins: [{ id: 'p1', text: 'x', state: 'active', source: 'manual' }] });
  await new Promise((r) => setTimeout(r, 10));
  h.driveInterval(2);
  assert.equal(h.bodyChildren.find((c) => c.id === 'zpin-stale'), undefined);
});