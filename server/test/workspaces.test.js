import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaces, validWorkspace, MAX_WORKSPACES } from '../src/workspaces.js';
import { CLEAN, INJECTION, startLab } from './helpers.js';

test('workspaces: default exists, ids are validated, the cap spares the default, reset gives the slot back', () => {
  const ws = createWorkspaces({ build: (id) => ({ id }), max: 2 });
  assert.equal(ws.get().id, 'default');
  ws.get('a'); ws.get('b');
  ws.get('a'); // a is now the most recently used
  assert.equal(ws.get('c').id, 'c');
  assert.deepEqual(ws.ids().sort(), ['a', 'c', 'default'], 'the least recently used (b) was forgotten, never a refusal, and the default stays');
  ws.reset('a');
  assert.deepEqual(ws.ids().sort(), ['c', 'default']);
  for (const bad of ['', 'A', '-x', 'a'.repeat(33), 'a b', '__proto__', 5, null]) assert.equal(validWorkspace(bad), false, String(bad));
  assert.throws(() => ws.get('Bad Id'), (e) => e.code === 'bad_workspace');
  assert.equal(MAX_WORKSPACES, 20);
});

test('the key, the clock and the last run are per workspace; Reset clears one only', async () => {
  const lab = await startLab();
  try {
    const w = (id) => ({ 'x-workspace': id });
    assert.equal((await lab.send('PUT', '/api/key', { authority: 'advisory', inspector: 'bedrock-guardrails' }, w('alpha'))).status, 200);
    const a = (await lab.get('/api/key', w('alpha'))).json;
    const d = (await lab.get('/api/key')).json;
    assert.deepEqual([a.authority, a.inspector], ['advisory', 'bedrock-guardrails']);
    assert.deepEqual([d.authority, d.inspector], ['enforcing', 'model-armor'], 'the default workspace keeps its own key');
    await lab.send('POST', '/api/run', { prompt: CLEAN }, w('alpha'));
    assert.equal((await lab.get('/api/info', w('alpha'))).json.labClockMs, 560);
    assert.equal((await lab.get('/api/info')).json.labClockMs, 0, 'the default clock did not move');
    assert.equal((await lab.get('/api/run-observability')).json.record, null, 'the default workspace has no run');
    assert.ok((await lab.get('/api/run-observability', w('alpha'))).json.record);
    assert.equal((await lab.get('/api/log', w('alpha'))).json.runs.length, 1);
    await lab.send('POST', '/api/run', { prompt: INJECTION });
    const r = await lab.send('POST', '/api/reset', {}, w('alpha'));
    assert.equal(r.json.workspace, 'alpha');
    assert.equal((await lab.get('/api/key', w('alpha'))).json.authority, 'enforcing', 'alpha is back to the default key');
    assert.equal((await lab.get('/api/run-observability', w('alpha'))).json.record, null);
    assert.equal((await lab.get('/api/log')).json.runs.length, 1, 'the default workspace was not reset');
    assert.equal((await lab.get('/api/info', w('alpha'))).json.workspace, 'alpha');
  } finally { await lab.close(); }
});

test('a malformed X-Workspace is a 400 with a message, never silently the default; past the cap the oldest workspace is forgotten, not a lock-out', async () => {
  const lab = await startLab();
  try {
    for (const bad of ['Bad Id', '../x', 'A', 'a'.repeat(40)]) {
      const r = await lab.get('/api/key', { 'x-workspace': bad });
      assert.deepEqual([r.status, r.json.error], [400, 'bad_workspace'], bad);
    }
    await lab.send('PUT', '/api/key', { authority: 'advisory' }, { 'x-workspace': 'w0' }); // w0 is the oldest
    for (let i = 1; i < MAX_WORKSPACES; i++) assert.equal((await lab.get('/api/key', { 'x-workspace': `w${i}` })).status, 200);
    assert.equal((await lab.get('/api/key', { 'x-workspace': 'one-too-many' })).status, 200, 'a new tab past the cap is admitted');
    assert.equal((await lab.get('/api/key', { 'x-workspace': 'w0' })).json.authority, 'enforcing', 'the oldest workspace (w0) was forgotten: it starts fresh');
    assert.equal((await lab.get('/api/key')).status, 200, 'the default workspace is always admitted');
    assert.equal((await lab.send('POST', '/api/reset', {}, { 'x-workspace': 'w5' })).status, 200);
  } finally { await lab.close(); }
});

test('Reset with a workspace id the lab has never seen creates nothing, so it never pushes the least recently used workspace out at the cap', async () => {
  const { createApp, startHttpServer } = await import('../src/app.js');
  const { validateConfig } = await import('../src/customer.js');
  const app = createApp({ runChecks: () => [], customer: validateConfig({}), log: () => {}, env: {} });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app });
  const base = url.replace(/\/$/, '');
  const call = (p, id, method = 'GET') => fetch(`${base}${p}`, { method, headers: { 'x-workspace': id, 'content-type': 'application/json', origin: base }, body: method === 'POST' ? '{}' : undefined });
  try {
    for (let i = 0; i < MAX_WORKSPACES; i++) assert.equal((await call('/api/key', `w${i}`)).status, 200);
    const before = app.locals.workspaces.ids();
    assert.equal(before.filter((x) => x !== 'default').length, MAX_WORKSPACES);
    const r = await call('/api/reset', 'never-seen', 'POST');
    assert.deepEqual([r.status, (await r.json()).cleared], [200, 0]);
    assert.deepEqual(app.locals.workspaces.ids(), before, 'nothing was created and nothing was evicted');
    assert.ok(app.locals.workspaces.ids().includes('w0'), 'the oldest workspace is still there');
    assert.equal((await call('/api/reset', 'w3', 'POST')).status, 200);
    assert.ok(!app.locals.workspaces.ids().includes('w3'), 'a known workspace is reset (forgotten) as before');
    assert.equal((await call('/api/reset', 'Bad Id', 'POST')).status, 400);
  } finally { await new Promise((res) => server.close(res)); }
});
