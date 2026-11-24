import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS } from '../src/bounds.js';
import { runGuard, safeShow } from '../src/guardPath.js';
import { CLEAN, INJECTION, card, code, lab, run } from './helpers.js';

const CARD_REPLY = 'What is on file? [[lab:reply=card]]';
const LINK_REPLY = 'What is the installer? [[lab:reply=link]]';

test('a clean call passes: prompt inspected, model called, response inspected, the lab clock shows what each hop cost', () => {
  const l = lab();
  const r = run(l, CLEAN);
  assert.deepEqual([r.outcome, r.served, r.modelCalled, r.findingCount], ['passed', true, true, 0]);
  assert.deepEqual(r.hops.map((h) => [h.hop, h.result, h.atMs, h.ms]), [['inspect-prompt', 'clear', 0, 80], ['model', 'ok', 80, 400], ['inspect-response', 'clear', 480, 80]]);
  assert.equal(r.elapsedMs, 560);
  assert.equal(l.clock.now(), 560);
  assert.deepEqual(r.client.body.text, r.response);
  assert.equal(r.client.status, 200);
  assert.equal(r.client.unverified, true);
});

test('enforcing: a finding in the prompt is the gateway\'s own named refusal, and the model is never called', () => {
  const l = lab();
  const r = run(l, INJECTION);
  assert.deepEqual([r.outcome, r.served, r.modelCalled, r.response], ['blocked', false, false, null]);
  assert.deepEqual([r.refusal.origin, r.refusal.code, r.refusal.status, r.refusal.direction], ['gateway', 'blocked_by_inspector', 403, 'request']);
  assert.deepEqual(r.refusal.categories, ['prompt_injection_jailbreak']);
  assert.equal(r.findings.every((f) => f.action === 'blocked'), true);
  assert.deepEqual(r.client.body.error, 'blocked_by_inspector');
  assert.equal(l.llmKey.usage.snapshot().requests, 0);
  assert.equal(r.leftBehind.tokensSpent, 0);
});

test('authority switch: advisory logs the same finding and the call goes through; enforcing blocks again', () => {
  const l = lab();
  assert.equal(run(l, INJECTION).outcome, 'blocked');
  l.keyInspector.configure({ authority: 'advisory' });
  const adv = run(l, INJECTION);
  assert.deepEqual([adv.outcome, adv.served, adv.modelCalled, adv.refusal], ['passed', true, true, null]);
  assert.deepEqual([...new Set(adv.findings.map((f) => f.category))], ['prompt_injection_jailbreak']);
  assert.equal(adv.findings.every((f) => f.action === 'logged'), true);
  assert.equal(adv.logged.length, adv.findings.length);
  assert.equal(adv.logged[0].code, 'finding_logged_advisory');
  assert.equal(adv.leftBehind.gatewayLogEntries, adv.logged.length);
  l.keyInspector.configure({ authority: 'enforcing' });
  assert.equal(run(l, INJECTION).outcome, 'blocked');
});

test('the response is inspected too: sensitive data and a malicious link in the model\'s answer are withheld, and the tokens are already spent', () => {
  for (const [prompt, category] of [[CARD_REPLY, 'sensitive_data'], [LINK_REPLY, 'malicious_url']]) {
    const l = lab();
    const r = run(l, prompt);
    assert.deepEqual([r.outcome, r.modelCalled, r.response, r.served], ['blocked', true, null, false], prompt);
    assert.deepEqual([r.refusal.direction, r.findings[0].category, r.findings[0].direction], ['response', category, 'response']);
    assert.ok(r.leftBehind.tokensSpent > 0);
    assert.equal(l.llmKey.usage.snapshot().requests, 1);
    assert.equal(r.hops.at(-1).hop, 'inspect-response');
  }
});

test('advisory on a response finding: logged, and the client receives the (masked) answer', () => {
  const r = run(lab({ authority: 'advisory' }), CARD_REPLY);
  assert.deepEqual([r.outcome, r.findings[0].action, r.findings[0].direction], ['passed', 'logged', 'response']);
  assert.equal(r.response.includes(card()), false);
  assert.match(r.response, /\*\*\*\* \*\*\*\* \*\*\*\* /);
});

test('inspector unreachable: fail closed blocks a harmless prompt; fail open lets it through and says so', () => {
  const closed = run(lab({ inspectorState: 'unreachable', failMode: 'closed' }), CLEAN);
  assert.deepEqual([closed.outcome, closed.refusal.code, closed.refusal.status, closed.refusal.origin, closed.modelCalled], ['blocked', 'inspector_unavailable', 503, 'gateway', false]);
  const open = run(lab({ inspectorState: 'unreachable', failMode: 'open' }), INJECTION);
  assert.deepEqual([open.outcome, open.modelCalled, open.findingCount], ['passed', true, 0], 'an injection goes through unchecked: that is what fail-open means');
  assert.deepEqual(open.logged.map((x) => x.code), ['failed_open', 'failed_open'], 'both directions say so');
  assert.deepEqual(open.hops.map((h) => h.result), ['failed-open', 'ok', 'failed-open']);
});

test('a slow inspector hits the timeout on the lab clock; a faster timeout is a timeout, a longer one is not', () => {
  const l = lab({ inspectorState: 'slow' }); // 800 ms against a 500 ms timeout
  const r = run(l, INJECTION);
  assert.deepEqual([r.outcome, r.refusal.code, r.refusal.status, r.elapsedMs, r.findingCount], ['blocked', 'inspector_timeout', 504, 500, 0]);
  const open = run(lab({ inspectorState: 'slow', failMode: 'open' }), INJECTION);
  assert.deepEqual([open.outcome, open.logged[0].code, open.findingCount], ['passed', 'failed_open', 0]);
  const patient = run(lab({ inspectorState: 'slow', timeoutMs: 1000 }), INJECTION);
  assert.deepEqual([patient.outcome, patient.refusal.code, patient.elapsedMs], ['blocked', 'blocked_by_inspector', 800], 'with a 1000 ms timeout the slow answer is read: a finding, not a timeout');
  const edge = run(lab({ inspectorState: 'slow', timeoutMs: 800 }), CLEAN);
  assert.equal(edge.refusal.code, 'inspector_timeout', 'reaching the timeout IS a timeout (as in the kit)');
});

test('malformed findings are a named error and never a pass, whatever authority and failMode say', () => {
  for (const patch of [{ inspectorState: 'malformed' }, { failMode: 'open' }, { authority: 'advisory' }, { authority: 'advisory', failMode: 'open' }]) {
    const l = lab({ inspectorState: 'malformed' });
    l.keyInspector.configure(patch.inspectorState ? {} : patch);
    const r = run(l, CLEAN);
    assert.deepEqual([r.outcome, r.served, r.modelCalled, r.refusal], ['error', false, false, null], JSON.stringify(patch));
    assert.deepEqual([r.error.code, r.error.origin, r.error.status, r.error.direction], ['inspector_malformed_findings', 'gateway', 502, 'request']);
    assert.equal(r.client.status, 502);
    assert.equal(r.response, null);
  }
});

test('no inspector on the key: both inspections are skipped and the call passes (the trace says so)', () => {
  const r = run(lab({ inspector: null }), INJECTION);
  assert.deepEqual([r.outcome, r.findingCount], ['passed', 0]);
  assert.deepEqual(r.hops.map((h) => h.result), ['skipped', 'ok', 'skipped']);
});

test('a second inspector replaces the first on the guard path: the same prompt yields the second stub\'s categories', () => {
  const l = lab();
  assert.equal(run(l, INJECTION).findings[0].category, 'prompt_injection_jailbreak');
  l.keyInspector.configure({ inspector: 'bedrock-guardrails' });
  const r = run(l, INJECTION);
  assert.equal(r.findings[0].category, 'prompt_attack');
  assert.equal(r.key.inspector, 'bedrock-guardrails');
  assert.ok(r.hops.every((h) => h.actor !== 'model-armor'));
});

test('a model failure is the model\'s, not the gateway\'s (origin provider), and the response is not inspected', () => {
  const l = lab();
  l.model.call = () => ({ ok: false, origin: 'provider', status: 503, error: 'provider_unavailable' });
  const r = run(l, CLEAN);
  assert.deepEqual([r.outcome, r.error.origin, r.error.code, r.error.direction], ['error', 'provider', 'provider_unavailable', 'model']);
  assert.deepEqual(r.hops.map((h) => h.hop), ['inspect-prompt', 'model']);
});

test('hostile prompts: non-string, empty and oversized are refused before any inspection; the limit itself is allowed', () => {
  const l = lab();
  for (const p of [undefined, null, 5, {}, [], ['a'], '', '   ']) assert.equal(code(() => runGuard(l, { prompt: p })), 'invalid_request', String(p));
  assert.equal(code(() => runGuard(l, { prompt: 'x'.repeat(BOUNDS.maxPromptChars + 1) })), 'prompt_too_large');
  assert.equal(l.clock.now(), 0, 'nothing was inspected: the lab clock did not move');
  assert.equal(runGuard(l, { prompt: 'a '.repeat(BOUNDS.maxPromptChars / 2) }).outcome, 'passed');
});

test('texts leave the lab masked and inert: a card number is never in a result, control characters are visible', () => {
  const r = run(lab(), `pay with ${card()} please‮\u0007`);
  const json = JSON.stringify(r);
  assert.equal(json.includes(card()), false);
  assert.equal(json.includes(card().replace(/ /g, '')), false);
  assert.match(r.prompt, /\[U\+202E\]/);
  assert.equal(safeShow('x'.repeat(5000)).length <= 401, true);
});

test('lab directives pick a canned reply; an unknown one or a lookalike is just text', () => {
  for (const p of ['hi [[lab:reply=nope]]', 'hi [[lab:reply=__proto__]]', 'hi [[lab:reply=constructor]]', 'hi [lab:reply=card]']) {
    const r = run(lab(), p);
    assert.equal(r.outcome, 'passed', p);
    assert.match(r.response, /answer to: hi/, p);
  }
  assert.match(run(lab(), 'hi [[lab:reply=clean]]').response, /refund window/);
});
