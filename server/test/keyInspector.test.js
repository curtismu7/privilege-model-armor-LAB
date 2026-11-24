import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEY, createKeyInspector, validateKeyPatch } from '../src/keyInspector.js';
import { BOUNDS } from '../src/bounds.js';
import { code } from './helpers.js';

const apply = (k, body) => k.configure(validateKeyPatch(body));

test('a new key has the Model Armor stub, enforcing, fail closed, and a timeout on the lab clock', () => {
  const v = createKeyInspector().view();
  assert.deepEqual([v.inspector, v.authority, v.failMode, v.timeoutMs, v.inspectorState], ['model-armor', 'enforcing', 'closed', 500, 'healthy']);
  assert.deepEqual(DEFAULT_KEY, { inspector: 'model-armor', authority: 'enforcing', failMode: 'closed', timeoutMs: 500 });
  assert.equal(v.oneInspectorPerKey, true);
});

test('a key has at most one inspector: selecting a second replaces the first', () => {
  const k = createKeyInspector();
  const r = apply(k, { inspector: 'azure-content-safety' });
  assert.equal(r.replaced, 'model-armor');
  assert.equal(k.view().inspector, 'azure-content-safety');
  assert.equal(k.inspector.id, 'azure-content-safety');
  assert.equal(apply(k, { inspector: 'azure-content-safety' }).replaced, null, 'selecting the same one replaces nothing');
  assert.equal(apply(k, { inspector: null }).replaced, 'azure-content-safety');
  assert.deepEqual([k.view().inspector, k.inspector], [null, null]);
  assert.equal(apply(k, { inspectors: ['bedrock-guardrails'] }).replaced, null);
  assert.equal(k.view().inspector, 'bedrock-guardrails');
});

test('a newly selected inspector starts healthy; the old one\'s fault does not carry over', () => {
  const k = createKeyInspector();
  apply(k, { inspectorState: 'slow' });
  assert.equal(k.view().inspectorState, 'slow');
  apply(k, { inspector: 'bedrock-guardrails' });
  assert.equal(k.view().inspectorState, 'healthy');
  apply(k, { inspector: 'model-armor', inspectorState: 'unreachable' });
  assert.equal(k.view().inspectorState, 'unreachable');
});

test('two inspectors at once are refused, and a refusal changes nothing', () => {
  const k = createKeyInspector();
  for (const list of [['model-armor', 'azure-content-safety'], ['model-armor', 'model-armor'], ['a', 'b', 'c'], Array(BOUNDS.maxInspectorsListed).fill('model-armor')]) {
    assert.equal(code(() => apply(k, { inspectors: list, authority: 'advisory' })), 'two_inspectors', JSON.stringify(list));
  }
  assert.deepEqual([k.view().inspector, k.view().authority], ['model-armor', 'enforcing'], 'not even the valid authority in the same body was applied');
  assert.equal(code(() => apply(k, { inspectors: Array(BOUNDS.maxInspectorsListed + 1).fill('x') })), 'invalid_key_config');
  assert.equal(code(() => apply(k, { inspectors: [] })), null, 'an empty list is "none"');
  assert.equal(k.view().inspector, null);
});

test('authority, failMode and timeout are validated; each accepts only its values', () => {
  const k = createKeyInspector();
  apply(k, { authority: 'advisory', failMode: 'open', timeoutMs: 1000 });
  assert.deepEqual([k.authority, k.failMode, k.timeoutMs], ['advisory', 'open', 1000]);
  for (const body of [
    { authority: 'maybe' }, { authority: 1 }, { authority: null }, { failMode: 'ajar' }, { failMode: true },
    { timeoutMs: 0 }, { timeoutMs: BOUNDS.minTimeoutMs - 1 }, { timeoutMs: BOUNDS.maxTimeoutMs + 1 }, { timeoutMs: 1.5 }, { timeoutMs: '500' }, { timeoutMs: NaN }, { timeoutMs: Infinity },
    { inspector: 'unknown' }, { inspector: 5 }, { inspector: ['model-armor'] }, { inspector: '__proto__' }, { inspector: 'constructor' },
    { inspectorState: 'on-fire' }, { inspectors: 'model-armor' }, { inspectors: ['nope'] }, { inspector: 'model-armor', inspectors: ['model-armor'] },
    {}, [], null, 'x', 5,
  ]) assert.equal(code(() => validateKeyPatch(body)), 'invalid_key_config', JSON.stringify(body));
  assert.deepEqual([k.authority, k.failMode, k.timeoutMs], ['advisory', 'open', 1000], 'refusals changed nothing');
  assert.equal(validateKeyPatch({ timeoutMs: BOUNDS.minTimeoutMs }).timeoutMs, BOUNDS.minTimeoutMs);
  assert.equal(validateKeyPatch({ timeoutMs: BOUNDS.maxTimeoutMs }).timeoutMs, BOUNDS.maxTimeoutMs);
});

test('unknown fields are refused: prototype keys and any credential-like field', () => {
  for (const key of ['__proto__', 'constructor', 'prototype', 'credential', 'apiKey', 'projectId', 'secret', 'token', 'password', 'location']) {
    const body = JSON.parse(`{"${key}":"x"}`);
    assert.equal(code(() => validateKeyPatch(body)), 'invalid_key_config', key);
  }
  assert.equal(code(() => validateKeyPatch(JSON.parse('{"__proto__":{"authority":"advisory"},"failMode":"open"}'))), 'invalid_key_config');
  assert.equal(({}).authority, undefined, 'Object.prototype was not polluted');
});

test('an inspector state needs an inspector on the key', () => {
  const k = createKeyInspector();
  apply(k, { inspector: null });
  assert.equal(code(() => apply(k, { inspectorState: 'slow' })), 'invalid_key_config');
  assert.equal(code(() => apply(k, { inspector: null, inspectorState: 'slow' })), 'invalid_key_config');
  apply(k, { inspector: 'model-armor', inspectorState: 'slow' });
  assert.equal(k.view().inspectorState, 'slow');
});

test('the key view has no credential field and reset restores the defaults', () => {
  const k = createKeyInspector();
  assert.equal(/secret|credential|password|token|apikey|project/i.test(JSON.stringify(Object.keys(k.view()))), false);
  apply(k, { inspector: null, authority: 'advisory', failMode: 'open', timeoutMs: 60 });
  k.reset();
  assert.deepEqual([k.view().inspector, k.authority, k.failMode, k.timeoutMs], ['model-armor', 'enforcing', 'closed', 500]);
});
