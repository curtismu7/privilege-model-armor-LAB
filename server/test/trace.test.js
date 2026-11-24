import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTrace } from '../src/gatewayTrace.js';
import { exchangesFor } from '../src/runTrace.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { CLEAN, INJECTION, card, lab, run, startLab } from './helpers.js';

const runsOf = (id) => runScenario(id).steps.filter((s) => s.run).map((s) => s.run);

test('every scenario produces traces that pass assertTrace, all mock, every decision checked', () => {
  for (const s of SCENARIOS) {
    for (const r of runsOf(s.id)) {
      const ex = exchangesFor(r);
      assert.ok(ex.length >= 1, s.id);
      ex.forEach((e, i) => { assert.equal(e.step, i + 1); assert.deepEqual(assertTrace(e.trace), [], `${s.id} step ${e.step}`); assert.equal(e.trace.source, 'mock'); });
      for (const e of ex) for (const d of e.trace.decisions) assert.equal(d.basis, 'checked', `${s.id}: ${d.id}`);
    }
  }
});

test('one step for the app\'s call, then one per call the gateway really made: a clean run has two inspections and a model call, a blocked prompt only one inspection', () => {
  assert.equal(exchangesFor(run(lab(), CLEAN)).length, 4);
  const blocked = exchangesFor(run(lab(), INJECTION));
  assert.equal(blocked.length, 2, 'the model was never called');
  assert.equal(blocked[0].status, 403);
  assert.match(blocked[0].title, /403 blocked_by_inspector/);
  assert.equal(exchangesFor(run(lab({ inspector: null }), CLEAN)).length, 2, 'no inspector: only the model call');
});

test('the inspector\'s unreachable and slow states are the status the gateway saw, and a malformed answer is not a pass', () => {
  assert.equal(exchangesFor(run(lab({ inspectorState: 'unreachable' }), CLEAN))[1].status, 503);
  assert.equal(exchangesFor(run(lab({ inspectorState: 'slow' }), CLEAN))[1].status, 504);
  const bad = exchangesFor(run(lab({ inspectorState: 'malformed' }), CLEAN));
  assert.equal(bad.length, 2);
  assert.equal(bad[0].status, 502);
  assert.ok(bad[1].trace.decisions.some((d) => d.outcome === 'fail'));
});

test('an advisory finding is information in the trace, not a failure; a block is the failure', () => {
  const advisory = exchangesFor(run(lab({ authority: 'advisory' }), INJECTION))[0].trace.decisions;
  assert.equal(advisory.filter((d) => d.outcome === 'fail').length, 0);
  assert.ok(advisory.some((d) => d.outcome === 'info' && /logged/.test(d.evidence)));
  const enforcing = exchangesFor(run(lab(), INJECTION))[0].trace.decisions;
  assert.ok(enforcing.some((d) => d.outcome === 'fail'));
});

test('nothing secret and nothing real in a trace: .example hosts, labelled mock credentials, no token-shaped value, the card sample never whole', () => {
  const all = [run(lab(), `my card ${card()}`), run(lab(), 'What is on file? [[lab:reply=card]]'), run(lab({ authority: 'advisory' }), `my card ${card()}`)];
  for (const r of all) {
    const text = JSON.stringify(exchangesFor(r));
    for (const m of text.matchAll(/https?:\/\/([^/"\\]+)/g)) assert.match(m[1], /\.example$/, m[1]);
    assert.match(text, /a lab mock value, not a credential/);
    assert.doesNotMatch(text, /eyJ[\w-]{8,}\.|sk-[A-Za-z0-9]{8,}/);
    assert.equal(text.includes(card()), false);
    assert.equal(text.includes(card().replace(/ /g, '')), false);
  }
});

test('the API returns the trace with the run and per scenario step', async () => {
  const l = await startLab();
  try {
    const r = (await l.send('POST', '/api/run', { prompt: CLEAN })).json;
    assert.equal(r.trace.exchanges.length, 4);
    const sc = (await l.send('POST', '/api/scenario/advisory-logs-then-enforcing-blocks', {})).json;
    assert.equal(sc.steps[0].trace.exchanges[0].status, 200);
    assert.equal(sc.steps[1].trace.exchanges[0].status, 403);
    assert.ok(sc.ok);
  } finally { await l.close(); }
});
