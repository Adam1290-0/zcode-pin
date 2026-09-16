// tests/pin-store.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createStore } = require('../pin-core.js');
const path = require('path');
const os = require('os');
const fs = require('fs');

function tmpfile() { return path.join(os.tmpdir(), 'pin-store-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json'); }

test('add respects per-conversation limit of 3 active pins', () => {
  const s = createStore(tmpfile());
  assert.equal(s.add('conv-1', { text: 'a' }).ok, true);
  assert.equal(s.add('conv-1', { text: 'b' }).ok, true);
  assert.equal(s.add('conv-1', { text: 'c' }).ok, true);
  const r = s.add('conv-1', { text: 'd' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'limit');
});

test('paused pins do not count against the limit, but resume does', () => {
  const s = createStore(tmpfile());
  const a = s.add('conv-1', { text: 'a' });
  const b = s.add('conv-1', { text: 'b' });
  const c = s.add('conv-1', { text: 'c' });
  s.pause('conv-1', a.item.id, true);
  const d = s.add('conv-1', { text: 'd' });
  assert.equal(d.ok, true);
  const resume = s.pause('conv-1', a.item.id, false);
  assert.equal(resume.ok, false);
  assert.equal(resume.error, 'limit');
});

test('pins are isolated per conversation', () => {
  const s = createStore(tmpfile());
  s.add('conv-1', { text: 'x' });
  assert.equal(s.getActive('conv-2').length, 0);
  assert.equal(s.getActive('conv-1').length, 1);
});

test('remove is a hard delete, persistence survives reload', () => {
  const file = tmpfile();
  const s1 = createStore(file);
  const a = s1.add('conv-1', { text: 'keep' });
  s1.remove('conv-1', a.item.id);
  const s2 = createStore(file);
  assert.equal(s2.getActive('conv-1').length, 0);
});

test('rejects empty, overlength, and invalid cid', () => {
  const s = createStore(tmpfile());
  assert.equal(s.add('conv-1', { text: '   ' }).error, 'empty');
  assert.equal(s.add('conv-1', { text: 'x'.repeat(501) }).error, 'too_long');
  assert.equal(s.add('__proto__', { text: 'x' }).error, 'bad_cid');
  assert.equal(s.add('', { text: 'x' }).error, 'bad_cid');
});

test('rejects constructor and prototype as cid', () => {
  const s = createStore(tmpfile());
  assert.equal(s.add('constructor', { text: 'x' }).error, 'bad_cid');
  assert.equal(s.add('prototype', { text: 'x' }).error, 'bad_cid');
});

test('corrupt store file is renamed to .corrupt, pins rebuild cleanly', () => {
  const file = tmpfile();
  fs.writeFileSync(file, '{ broken json');
  const s = createStore(file);
  assert.equal(s.getActive('conv-1').length, 0);
  assert.ok(fs.existsSync(file + '.corrupt'));
});

test('getActive/getList never create dirty keys', () => {
  const file = tmpfile();
  const s = createStore(file);
  s.add('conv-1', { text: 'x' }); // trigger file creation (zero-write design)
  s.getActive('nonexistent');
  s.getList('nonexistent');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(raw.conversations), ['conv-1']); // no 'nonexistent' key
});

// The store key must be identical whether the id arrives from the DOM
// (data-session-id, "sess_<id>") or from the request header ("<id>"), otherwise
// pins written in the UI would never be found when injecting.
test('pins stored under one spelling are readable under the other', () => {
  const file = tmpfile();
  const s = createStore(file);
  const raw = '057a52bd-9952-450b-8479-94fc91264c4b';
  s.add('sess_' + raw, { text: 'shared' });   // UI writes the DOM form
  assert.equal(s.getActive(raw).length, 1);   // wrapper reads the header form
  assert.equal(s.getActive('sess_' + raw).length, 1);
});

test('legacy duplicate spellings of one session merge on load', () => {
  const file = tmpfile();
  const raw = 'abc-123';
  fs.writeFileSync(file, JSON.stringify({
    conversations: {
      ['sess_' + raw]: [{ id: 'p1', text: 'first', source: 'manual', state: 'active' }],
      [raw]: [{ id: 'p2', text: 'second', source: 'manual', state: 'active' }],
    },
    schemaVersion: 1,
  }));
  const s = createStore(file);
  assert.equal(s.getActive(raw).length, 2); // both entries under one canonical key
});

// O1: multi-process freshness — a store that already loaded must pick up pins
// written by ANOTHER process (the port holder), otherwise new pins are never
// injected and deleted pins keep injecting.
test('external writes by another process are picked up without recreating the store', async () => {
  const file = tmpfile();
  const s = createStore(file);
  s.add('conv-x', { text: 'mine' }); // triggers load + arms the watcher
  assert.equal(s.getActive('conv-x').length, 1);

  // simulate another process writing the file behind our back
  fs.writeFileSync(file, JSON.stringify({
    conversations: { 'conv-x': [{ id: 'p-ext', text: 'external', source: 'manual', state: 'active' }] },
    schemaVersion: 1,
  }));

  // fs.watch fires asynchronously; poll until the watcher reloads
  const deadline = Date.now() + 3000;
  while (s.getActive('conv-x').length === 1 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const list = s.getActive('conv-x');
  assert.equal(list.length, 1, 'external state replaces the stale snapshot');
  assert.equal(list[0].text, 'external');
});

test('own writes do not clobber the in-memory state via the watcher', async () => {
  const file = tmpfile();
  const s = createStore(file);
  s.add('conv-y', { text: 'a' });
  await new Promise((r) => setTimeout(r, 300)); // let any watcher event settle
  assert.equal(s.getActive('conv-y').length, 1);
  assert.equal(s.getActive('conv-y')[0].text, 'a');
});