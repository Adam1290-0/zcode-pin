// tests/pin-server.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = 27900 + Math.floor(Math.random() * 300); // no fixed-port contention
const TOKEN = 'test-token-123';
const DATA_DIR = path.join(os.tmpdir(), 'zpin-srv-' + Date.now());
let proc;
let up = false;

function api(pathname, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers, { 'x-zpin-token': TOKEN });
  return fetch('http://127.0.0.1:' + PORT + pathname, opts).then(async function (r) {
    let json = null;
    try { json = await r.json(); } catch (_) {}
    return { status: r.status, json: json };
  });
}
async function waitUp() { // poll instead of fixed sleep (flaky-proof)
  for (let i = 0; i < 50; i++) {
    if (up) return;
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/api/challenge');
      if (r.status === 200) { up = true; return; }
    } catch (_) {}
    await new Promise(function (res) { setTimeout(res, 100); });
  }
  throw new Error('server did not come up');
}

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'pin-wrapper.js')], {
    env: Object.assign({}, process.env, {
      ZPIN_COMPONENTS: 'all', // fetch patch is harmless in a bare node process
      ZPIN_DATA_DIR: DATA_DIR,
      ZPIN_PORT: String(PORT),
      ZPIN_TOKEN: TOKEN,
    }),
    stdio: 'ignore',
  });
  await waitUp();
});
after(() => { if (proc) proc.kill(); });

test('rejects requests without token (401)', async () => {
  const r = await fetch('http://127.0.0.1:' + PORT + '/api/pins');
  assert.equal(r.status, 401);
});

test('OPTIONS returns 204 without auth', async () => {
  const r = await fetch('http://127.0.0.1:' + PORT + '/api/pins', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
});

test('challenge returns verifiable proof without token', async () => {
  const r = await fetch('http://127.0.0.1:' + PORT + '/api/challenge');
  assert.equal(r.status, 200);
  const j = await r.json();
  const expected = crypto.createHmac('sha256', TOKEN).update(j.nonce).digest('hex');
  assert.equal(j.proof, expected);
});

test('rejects evil origin (403)', async () => {
  const r = await fetch('http://127.0.0.1:' + PORT + '/api/pins',
    { headers: { 'x-zpin-token': TOKEN, origin: 'http://evil.com' } });
  assert.equal(r.status, 403);
});

test('add + list + limit roundtrip', async () => {
  const cid = 'conv-srv-1';
  await api('/api/active-conversation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: cid }) });
  const a1 = await api('/api/pins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: cid, text: 'constraint one', source: 'manual' }) });
  assert.equal(a1.status, 200);
  assert.equal(a1.json.ok, true);
  const list = await api('/api/pins');
  assert.equal(list.json.pins.length, 1);
  assert.equal(list.json.pins[0].text, 'constraint one');
  assert.equal(typeof list.json.maxTextLen, 'number');
  for (let i = 0; i < 2; i++) {
    await api('/api/pins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: cid, text: 'fill ' + i, source: 'manual' }) });
  }
  const over = await api('/api/pins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: cid, text: 'overflow', source: 'manual' }) });
  assert.equal(over.json.ok, false);
  assert.equal(over.json.error, 'limit');
});

test('pause then delete; invalid cid rejected with 400', async () => {
  const cid = 'conv-srv-2';
  const a = await api('/api/pins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: cid, text: 'temp', source: 'manual' }) });
  const id = a.json.item.id;
  const p = await api('/api/pins/' + id + '/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: cid, state: 'paused' }) });
  assert.equal(p.json.ok, true);
  const d = await api('/api/pins/' + id + '?conversationId=' + cid, { method: 'DELETE' });
  assert.equal(d.status, 200);
  const bad = await api('/api/active-conversation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: '__proto__' }) });
  assert.equal(bad.status, 400);
});