import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, startHttpServer } from '../src/app.js';
import { BOUNDS } from '../src/bounds.js';
import { SCENARIOS } from '../src/scenarios.js';
import { CLEAN, INJECTION, card } from './helpers.js';

let server; let base; let port;
before(async () => {
  ({ server, url: base } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ env: { LAB_ALLOWED_HOSTS: 'lab.example' } }) }));
  port = server.address().port;
  base = base.replace(/\/$/, '');
});
after(() => new Promise((r) => server.close(r)));

const J = { 'content-type': 'application/json' };
const send = (method, p, body, headers = {}) => fetch(`${base}${p}`, { method, headers: { ...J, origin: base, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) });
const post = (p, body, headers) => send('POST', p, body, headers);
const put = (p, body, headers) => send('PUT', p, body, headers);
const get = async (p) => (await fetch(`${base}${p}`)).json();
// fetch cannot set Host, so raw http for Host tests.
const raw = (method, p, headers, body = '{}') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
  req.on('error', reject); req.end(method === 'GET' ? undefined : body);
});
const reset = () => post('/api/reset');

test('GET /api/health is demo-health/1 and ready', async () => {
  const j = await get('/api/health');
  assert.equal(j.schema, 'demo-health/1');
  assert.equal(j.state, 'ready');
  assert.equal(j.runtime, 'offline');
  assert.equal(j.mode, 'mock-only');
  assert.equal(j.demo.id, 'privilege-model-armor-lab');
});

test('GET /api/info: mock, Real not available with a plain reason, banner says UNVERIFIED, no credential anywhere', async () => {
  const j = await get('/api/info');
  assert.equal(j.source, 'mock');
  assert.equal(j.mode, 'mock');
  assert.equal(j.realAvailable, false);
  assert.match(j.realReason, /owner-run/);
  assert.match(j.realReason, /not built/);
  assert.match(j.banner, /UNVERIFIED/);
  assert.deepEqual(j.scenarios, SCENARIOS.map((s) => s.id));
  assert.deepEqual(j.inspectors.map((i) => i.id), ['model-armor', 'azure-content-safety', 'bedrock-guardrails']);
  assert.equal(/secret|credential|password|apikey/i.test(JSON.stringify(j)), false);
});

test('POST /api/mode: mock is fine, real and live are refused with a plain message, anything else is a 400', async () => {
  assert.equal((await post('/api/mode', { source: 'mock' })).status, 200);
  for (const source of ['real', 'live']) {
    const r = await post('/api/mode', { source });
    assert.equal(r.status, 409);
    const j = await r.json();
    assert.equal(j.error, 'real_not_available');
    assert.match(j.message, /not built/);
  }
  for (const body of [{}, { source: 'moon' }, { source: 5 }, { source: 'mock', x: 1 }, [], 'x']) assert.equal((await post('/api/mode', body)).status, 400, JSON.stringify(body));
  assert.equal((await get('/api/info')).source, 'mock', 'still mock');
});

test('GET /api/scenarios lists the data, with the expected results', async () => {
  const j = await get('/api/scenarios');
  assert.equal(j.scenarios.length, 11);
  assert.ok(j.scenarios.every((s) => s.expect.length && s.steps.length));
});

for (const sc of SCENARIOS) {
  test(`POST /api/scenario/${sc.id}: ok, and the live key is untouched`, async () => {
    await reset();
    const before = await get('/api/key');
    const r = await post(`/api/scenario/${sc.id}`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.deepEqual(j.checks.filter((c) => !c.pass), []);
    assert.deepEqual(await get('/api/key'), before);
  });
}

test('POST /api/scenario/:id: unknown, prototype-ish ids are 404', async () => {
  for (const id of ['nope', '__proto__', 'constructor', 'toString']) assert.equal((await post(`/api/scenario/${id}`)).status, 404, id);
});

test('GET and PUT /api/key: inspector, authority, failMode; a second inspector replaces the first; the view has no credential field', async () => {
  await reset();
  const k0 = await get('/api/key');
  assert.deepEqual([k0.inspector, k0.authority, k0.failMode], ['model-armor', 'enforcing', 'closed']);
  const r = await put('/api/key', { inspector: 'azure-content-safety', authority: 'advisory', failMode: 'open' });
  assert.equal(r.status, 200);
  const k1 = await r.json();
  assert.deepEqual([k1.inspector, k1.authority, k1.failMode, k1.replaced], ['azure-content-safety', 'advisory', 'open', 'model-armor']);
  const { replaced: _r, ...view } = k1;
  assert.deepEqual(await get('/api/key'), view);
  assert.equal(/secret|credential|password|apikey|project/i.test(JSON.stringify(k1)), false);
});

test('PUT /api/key: two inspectors at once are refused and nothing changes; credentials and unknown or prototype fields are refused', async () => {
  await reset();
  const two = await put('/api/key', { inspectors: ['model-armor', 'bedrock-guardrails'], authority: 'advisory' });
  assert.equal(two.status, 400);
  assert.equal((await two.json()).error, 'two_inspectors');
  const k = await get('/api/key');
  assert.deepEqual([k.inspector, k.authority], ['model-armor', 'enforcing']);
  for (const body of ['{"credential":"hunter2-not-a-real-secret"}', '{"projectId":"p"}', '{"__proto__":{"authority":"advisory"}}', '{"constructor":{"prototype":{"x":1}}}', '{"authority":"maybe"}', '{}', '[]', 'null', '"x"']) {
    const r = await put('/api/key', body);
    assert.equal(r.status, 400, body);
    const t = await r.text();
    assert.equal(t.includes('hunter2'), false, 'a refused value is never echoed');
    assert.equal(JSON.parse(t).error === 'invalid_key_config' || JSON.parse(t).error === 'bad_json' || JSON.parse(t).error === 'invalid_key_config', true, body);
  }
  assert.equal(({}).authority, undefined);
  assert.deepEqual([(await get('/api/key')).authority], ['enforcing']);
});

test('POST /api/run: clean passes, injection blocked by the gateway, then advisory logs it, then enforcing blocks again', async () => {
  await reset();
  const ok = await (await post('/api/run', { prompt: CLEAN })).json();
  assert.deepEqual([ok.outcome, ok.served], ['passed', true]);
  const blocked = await (await post('/api/run', { prompt: INJECTION })).json();
  assert.deepEqual([blocked.outcome, blocked.refusal.code, blocked.refusal.origin], ['blocked', 'blocked_by_inspector', 'gateway']);
  await put('/api/key', { authority: 'advisory' });
  const adv = await (await post('/api/run', { prompt: INJECTION })).json();
  assert.deepEqual([adv.outcome, adv.findings[0].action, adv.logged[0].code], ['passed', 'logged', 'finding_logged_advisory']);
  await put('/api/key', { authority: 'enforcing' });
  assert.equal((await (await post('/api/run', { prompt: INJECTION })).json()).outcome, 'blocked');
  assert.equal((await get('/api/info')).runsSinceReset, 4);
});

test('POST /api/run: fault injection through the key: unreachable and slow follow failMode, malformed is an error', async () => {
  await reset();
  await put('/api/key', { inspectorState: 'unreachable' });
  assert.equal((await (await post('/api/run', { prompt: CLEAN })).json()).refusal.code, 'inspector_unavailable');
  await put('/api/key', { failMode: 'open' });
  assert.equal((await (await post('/api/run', { prompt: INJECTION })).json()).outcome, 'passed');
  await put('/api/key', { inspectorState: 'slow', failMode: 'closed' });
  assert.equal((await (await post('/api/run', { prompt: CLEAN })).json()).refusal.code, 'inspector_timeout');
  await put('/api/key', { inspectorState: 'malformed', failMode: 'open', authority: 'advisory' });
  const m = await (await post('/api/run', { prompt: CLEAN })).json();
  assert.deepEqual([m.outcome, m.error.code], ['error', 'inspector_malformed_findings']);
  await reset();
});

test('POST /api/run: the card sample never comes back whole, in the prompt, the response, the findings or the log', async () => {
  await reset();
  await put('/api/key', { authority: 'advisory' });
  for (const prompt of [`my card is ${card()}`, 'what is on file? [[lab:reply=card]]']) {
    const t = await (await post('/api/run', { prompt })).text();
    assert.equal(t.includes(card()), false, prompt);
    assert.equal(t.includes(card().replace(/ /g, '')), false, prompt);
  }
  await reset();
});

test('POST /api/run: hostile bodies', async () => {
  await reset();
  const big = await post('/api/run', { prompt: 'x'.repeat(BOUNDS.maxPromptChars + 1) });
  assert.equal(big.status, 413);
  assert.equal((await big.json()).error, 'prompt_too_large');
  for (const body of [{}, { prompt: 5 }, { prompt: '' }, { prompt: null }, { prompt: ['a'] }, { prompt: 'a', key: {} }, { prompt: 'a', __proto__x: 1 }, []]) {
    const r = await post('/api/run', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal((await r.json()).error, 'invalid_request');
  }
  for (const body of ['"x"', '5']) assert.equal((await post('/api/run', body)).status, 400, `${body} is not an object`);
  assert.equal((await post('/api/run', '{"prompt":"a","__proto__":{"x":1}}')).status, 400);
  assert.equal((await post('/api/run', '{bad json')).status, 400);
  const huge = await post('/api/run', JSON.stringify({ prompt: 'x'.repeat(BOUNDS.maxBodyBytes) }));
  assert.equal(huge.status, 413);
  assert.equal((await get('/api/info')).runsSinceReset, 0, 'no refused request counted as a run');
});

test('POST /api/reset restores the default key and clears the runs and the clock', async () => {
  await put('/api/key', { inspector: null, authority: 'advisory' });
  await post('/api/run', { prompt: CLEAN });
  const r = await (await reset()).json();
  assert.equal(r.reset, 'ok');
  assert.ok(r.cleared >= 1);
  const k = await get('/api/key');
  assert.deepEqual([k.inspector, k.authority], ['model-armor', 'enforcing']);
  const i = await get('/api/info');
  assert.deepEqual([i.runsSinceReset, i.labClockMs], [0, 0]);
});

test('Host check: a non-loopback Host is 421; a loopback or allow-listed one is served', async () => {
  for (const host of ['evil.example', 'evil.example:80', '127.0.0.1.evil.example', 'a b']) assert.equal((await raw('GET', '/api/health', { host })).status, 421, host);
  assert.equal((await raw('GET', '/api/health', { host: `127.0.0.1:${port}` })).status, 200);
  assert.equal((await raw('GET', '/api/health', { host: 'localhost' })).status, 200);
  assert.equal((await raw('GET', '/api/health', { host: 'lab.example' })).status, 200);
});

test('same-origin writes: a cross-origin Origin or a cross-site fetch is 403; a non-JSON body is 415; GET is unaffected', async () => {
  for (const [path, method] of [['/api/run', 'POST'], ['/api/key', 'PUT'], ['/api/reset', 'POST'], ['/api/mode', 'POST'], [`/api/scenario/${SCENARIOS[0].id}`, 'POST']]) {
    assert.equal((await send(method, path, { prompt: 'x' }, { origin: 'http://evil.example' })).status, 403, `${method} ${path}`);
    assert.equal((await send(method, path, { prompt: 'x' }, { 'sec-fetch-site': 'cross-site' })).status, 403, `${method} ${path} cross-site`);
    assert.equal((await send(method, path, 'a=b', { 'content-type': 'text/plain' })).status, 415, `${method} ${path} text`);
  }
  assert.equal((await fetch(`${base}/api/info`, { headers: { origin: 'http://evil.example' } })).status, 200);
});

test('unknown API paths are a JSON 404; the error handler never leaks a stack', async () => {
  const r = await fetch(`${base}/api/nope`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'not_found');
  const bad = await post('/api/run', '{"prompt":');
  assert.equal(bad.status, 400);
  assert.equal(/at \w+ \(|node_modules|\/Users\//.test(await bad.text()), false);
});

test('the body limit covers the longest prompt: 20000 control characters (6 bytes each as JSON) is handled as a prompt, 20001 is the prompt limit, never a 413 too_large', async () => {
  await reset();
  assert.ok(BOUNDS.maxBodyBytes >= 6 * BOUNDS.maxPromptChars + 1024);
  for (const n of [12000, BOUNDS.maxPromptChars]) {
    const r = await post('/api/run', JSON.stringify({ prompt: '\u0001'.repeat(n) }));
    assert.equal(r.status, 200, `${n} control characters`);
  }
  const over = await post('/api/run', JSON.stringify({ prompt: '\u0001'.repeat(BOUNDS.maxPromptChars + 1) }));
  assert.deepEqual([over.status, (await over.json()).error], [413, 'prompt_too_large']);
  await reset();
});
