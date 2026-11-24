import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, describeScenarios, evaluate, getPath, runScenario } from '../src/scenarios.js';
import { card } from './helpers.js';

const EXPECTED_IDS = [
  'clean-prompt-passes', 'injection-blocked-when-enforcing', 'sensitive-data-in-prompt', 'sensitive-data-in-response', 'malicious-url-blocked',
  'advisory-logs-then-enforcing-blocks', 'inspector-unreachable-closed-vs-open', 'slow-inspector-times-out', 'malformed-findings-named-error',
  'second-inspector-replaces-first', 'two-inspectors-refused',
];

test('the scenarios are the eleven the spec names, as data with hand-written expected results', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), EXPECTED_IDS);
  for (const s of SCENARIOS) {
    assert.ok(s.title && s.story, s.id);
    assert.ok(s.expect.length >= 3, `${s.id} has expected results`);
    assert.deepEqual(JSON.parse(JSON.stringify(s)), s, `${s.id} survives a JSON round trip (plain data)`);
    assert.ok(s.steps.length >= 1 && s.steps.every((st) => st.label && (st.prompt !== undefined || st.key)), s.id);
  }
});

for (const id of EXPECTED_IDS) {
  test(`scenario ${id}: every expected result holds`, () => {
    const r = runScenario(id);
    const failed = r.checks.filter((c) => !c.pass).map((c) => `${c.path} ${c.op} ${c.wanted} (got ${c.actual})`);
    assert.deepEqual(failed, []);
    assert.equal(r.ok, true);
    for (const c of r.checks) assert.notEqual(c.actual, undefined, `${c.path} resolves to a value`);
  });
}

test('the check evaluator is not vacuous: a wrong expectation fails', () => {
  const result = { steps: [{ run: { outcome: 'passed', n: 5 } }] };
  const out = evaluate([
    { path: 'steps.0.run.outcome', op: 'eq', value: 'blocked' }, { path: 'steps.0.run.n', op: 'gt', value: 5 }, { path: 'steps.0.run.missing', op: 'eq', value: 1 }, { path: 'steps.0.run.outcome', op: 'eq', value: 'passed' },
  ], result);
  assert.deepEqual(out.map((c) => c.pass), [false, false, false, true]);
  assert.equal(getPath({ a: 1 }, '__proto__.x'), undefined);
  assert.equal(getPath({ a: 1 }, 'constructor'), undefined);
});

test('scenarios run on their own lab: every run gives the same answer, and they never share state', () => {
  const a = JSON.stringify(runScenario('advisory-logs-then-enforcing-blocks'));
  runScenario('malformed-findings-named-error');
  assert.equal(JSON.stringify(runScenario('advisory-logs-then-enforcing-blocks')), a);
  assert.equal(runScenario('nope'), null);
  assert.equal(runScenario('__proto__'), null);
});

test('the scenario list shown to the UI never carries the whole card sample', () => {
  const json = JSON.stringify(describeScenarios());
  assert.equal(json.includes(card()), false);
  assert.equal(json.includes(card().replace(/ /g, '')), false);
  assert.equal(JSON.stringify(runScenario('sensitive-data-in-prompt')).includes(card()), false);
});

test('advisory scenario: the same prompt, the same finding, a different decision', () => {
  const [adv, enf] = runScenario('advisory-logs-then-enforcing-blocks').steps.map((s) => s.run);
  const asked = (r) => r.findings.filter((f) => f.direction === 'request').map((f) => f.category);
  assert.deepEqual(asked(adv), asked(enf));
  assert.ok(adv.findings.some((f) => f.direction === 'response'), 'advisory let the call through, so the model\'s echo of the prompt was inspected as well');
  assert.deepEqual([adv.outcome, enf.outcome], ['passed', 'blocked']);
  assert.deepEqual([adv.key.authority, enf.key.authority], ['advisory', 'enforcing']);
});

test('two-inspectors scenario: the refusal leaves the key as it was', () => {
  const [s] = runScenario('two-inspectors-refused').steps;
  assert.match(s.key.message, /at most one external inspector/);
  assert.equal(s.run.key.inspector, 'model-armor');
});
