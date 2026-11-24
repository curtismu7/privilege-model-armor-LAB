import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRunObservability, LAYERS, classify, defaultLayers } from '../src/runObservability.js';
import { buildRunRecord, decisionLine, eventsFor, mockLayers } from '../src/runObs.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { CLEAN, INJECTION, card, lab, run, startLab } from './helpers.js';

const BASE = Date.parse('2026-11-24T10:00:00.000Z');
const FORBIDDEN_WORDS = /refused|denied|rejected|forbidden|failed|invalid|expired|mismatch|token|audience|scope|served/i;
const iso = (ms) => new Date(ms).toISOString();

const recordFor = async (id) => {
  const out = runScenario(id);
  const runs = out.steps.filter((s) => s.run).map((s) => ({ run: s.run, label: s.label }));
  const events = eventsFor(runs, { baseMs: BASE });
  const elapsed = runs.reduce((n, r) => n + r.run.elapsedMs, 0);
  const rec = { id: 'run-1', startedAt: iso(BASE), endedAt: iso(BASE + elapsed), events };
  return { record: await buildRunRecord(rec, { clock: () => BASE }), events, out, elapsed };
};

test('every scenario leaves a record that passes the shared assertRunObservability, all rows simulated, all six layers named', async () => {
  for (const s of SCENARIOS) {
    const { record } = await recordFor(s.id);
    assert.deepEqual(assertRunObservability(record), [], s.id);
    assert.equal(record.source, 'mock');
    assert.ok(record.rows.length >= 3, s.id);
    assert.deepEqual(Object.keys(record.coverage).sort(), [...LAYERS].sort(), s.id);
    for (const r of record.rows) assert.ok(r.origin === 'simulated' || r.origin === 'not-logged', `${s.id}: ${r.origin}`);
    for (const l of ['person', 'authorize', 'gateway']) assert.equal(record.coverage[l], 'not-logged', `${s.id}: ${l} has nothing and says so`);
    assert.ok(record.reasons.person && record.reasons.gateway, 'a layer with nothing says why');
  }
});

test('the rows say what happened: a clean run is allowed, a block is a lab stop, an advisory finding is information, the model row only when it was called', async () => {
  const clean = await recordFor('clean-prompt-passes');
  assert.equal(clean.record.summary.blocked, 0);
  assert.equal(clean.record.rows.filter((r) => r.layer === 'resource').length, 1, 'one model call, one reply');
  assert.equal(clean.record.summary.allowed, 3, 'two clear inspections and the verdict');
  const injection = await recordFor('injection-blocked-when-enforcing');
  assert.equal(injection.record.coverage.resource, 'not-logged', 'the model was never called, so the resource layer is empty and says so');
  assert.match(injection.record.reasons.resource, /not called/);
  assert.ok(injection.record.rows.some((r) => r.outcome === 'blocked' && /blocked_by_inspector/.test(r.message)));
  const advisory = await recordFor('advisory-logs-then-enforcing-blocks');
  assert.ok(advisory.events.some((e) => e.step === 'gateway-log' && /finding_logged_advisory/.test(e.message)), 'the advisory log entry is a row');
  assert.ok(advisory.events.filter((e) => e.step === 'request').every((e) => /^\[(advisory|back to enforcing)\]/.test(e.message)), 'a scenario with several runs tags each step');
  const response = await recordFor('sensitive-data-in-response');
  assert.equal(response.record.rows.filter((r) => r.layer === 'resource').length, 1, 'the response block happened after the model answered');
});

test('row times are the stdout line times: one stamp per event, in time order, offsets from the lab clock', async () => {
  const { record, events, elapsed } = await recordFor('advisory-logs-then-enforcing-blocks');
  const times = record.rows.filter((r) => r.at).map((r) => r.at);
  assert.deepEqual(times, [...times].sort(), 'rows are in time order');
  assert.ok(events.every((e) => record.rows.some((r) => r.at === e.at)));
  const last = events.map((e) => Date.parse(e.at)).sort((a, b) => a - b).at(-1);
  assert.equal(last - BASE, elapsed, 'the last event is at the end of the lab-clock run');
});

test('the stdout line: one per decision, loopless vocabulary, a hostile name cannot forge a second field or a second line', () => {
  const e = { at: '2026-11-24T10:00:00.000Z', step: 'inspect-prompt', actor: 'model-armor', outcome: 'blocked' };
  assert.equal(decisionLine(e, 'run-3'), '2026-11-24T10:00:00.000Z privilege-model-armor-lab decision step=inspect-prompt actor=model-armor result=stopped run=run-3');
  const hostile = decisionLine({ ...e, actor: 'x result=passed\nrun=evil\r\n2026 forged line', step: 'a b' }, 'run 1\n');
  assert.ok(!/[\r\n]/.test(hostile));
  assert.equal(hostile.split(' ').filter((w) => w.startsWith('result=')).length, 1);
  assert.equal((hostile.match(/ run=/g) || []).length, 1);
});

test('no stdout line uses a word a shared matcher reads as a decision, and none is classified as a product line', async () => {
  const lines = [];
  for (const s of SCENARIOS) for (const e of (await recordFor(s.id)).events) lines.push(decisionLine(e, 'run-1').replace(/^\S+ privilege-model-armor-lab /, ''));
  assert.ok(lines.length > 40);
  for (const l of lines) assert.doesNotMatch(l, FORBIDDEN_WORDS, l);
  for (const l of lines) assert.equal(classify(`2026-11-24T10:00:00.000Z privilege-model-armor-lab ${l}`), null, l);
});

test('no row and no stdout line holds the card sample whole, a prompt or a finding\'s text', async () => {
  const l = lab();
  const out = run(l, `Please keep my card ${card()} for next time.`);
  const events = eventsFor([{ run: out, label: 'x' }], { baseMs: BASE });
  const text = JSON.stringify(events) + events.map((e) => decisionLine(e, 'run-1')).join('\n');
  assert.equal(text.includes(card()), false);
  assert.equal(text.includes(card().replace(/ /g, '')), false);
  assert.equal(text.includes('Please keep'), false);
  assert.equal(JSON.stringify(eventsFor([{ run: run(lab(), INJECTION), label: 'x' }], { baseMs: BASE })).includes('system prompt'), false);
});

test('the lab reads no logs: only the collector core is vendored, and the layers carry only simulated rows', () => {
  const layers = mockLayers(eventsFor([{ run: run(lab(), CLEAN), label: 'x' }], { baseMs: BASE }));
  assert.deepEqual(layers.map((l) => l.layer), [...LAYERS]);
  assert.ok(layers.every((l) => l.products.length === 0 && !l.responses), 'no product reader and no API response row');
  assert.ok(defaultLayers().length > 0);
});

test('API: /api/run-observability is null before any run; a live run and a scenario run each leave their record; the stdout lines match the rows', async () => {
  const lines = [];
  const l = await startLab({ log: (x) => lines.push(x), now: () => BASE });
  try {
    const empty = (await l.get('/api/run-observability')).json;
    assert.equal(empty.record, null); assert.ok(empty.streams.length >= 2);
    const out = (await l.send('POST', '/api/run', { prompt: INJECTION })).json;
    assert.match(out.runId, /^run-\d+$/);
    const live = (await l.get('/api/run-observability')).json;
    assert.equal(live.run.kind, 'live'); assert.equal(live.record.runId, out.runId);
    assert.deepEqual(assertRunObservability(live.record), []);
    assert.equal(lines.length, live.record.rows.filter((r) => r.origin === 'simulated').length, 'one stdout line per simulated row');
    for (const r of live.record.rows.filter((x) => x.origin === 'simulated')) assert.ok(lines.some((ln) => ln.startsWith(r.at)), r.message);
    const sc = (await l.send('POST', '/api/scenario/clean-prompt-passes', {})).json;
    const after = (await l.get('/api/run-observability')).json;
    assert.equal(after.run.kind, 'scenario'); assert.equal(after.run.scenarioId, 'clean-prompt-passes'); assert.equal(after.record.runId, sc.runId);
    assert.equal((await l.get('/api/info')).json.runsSinceReset, 1, 'the scenario did not touch the live lab: only the live run counts');
    assert.equal((await l.get('/api/log')).json.runs.length, 2);
    assert.equal((await l.send('POST', '/api/run-observability', {})).status, 404);
  } finally { await l.close(); }
});

test('a refused prompt leaves no run behind (nothing was decided)', async () => {
  const l = await startLab();
  try {
    assert.equal((await l.send('POST', '/api/run', { prompt: '' })).status, 400);
    assert.equal((await l.get('/api/run-observability')).json.record, null);
    assert.equal((await l.get('/api/log')).json.runs.length, 0);
  } finally { await l.close(); }
});

test('the run list is bounded', async () => {
  const l = await startLab();
  try {
    for (let i = 0; i < 25; i++) await l.send('POST', '/api/scenario/clean-prompt-passes', {});
    assert.equal((await l.get('/api/log')).json.runs.length, 20);
    assert.equal((await l.get('/api/log')).json.runs[0].runId, 'run-25');
  } finally { await l.close(); }
});
