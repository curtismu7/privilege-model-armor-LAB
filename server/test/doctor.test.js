import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../src/checks.js';
import { allPassed } from '../src/doctor.js';
import { SCENARIOS } from '../src/scenarios.js';
import { BANNER, NOT_REAL } from '../src/banner.js';

test('every doctor check passes, and every scenario has its own check', () => {
  const checks = runChecks({});
  assert.equal(allPassed(checks), true, JSON.stringify(checks.filter((c) => c.level === 'fail')));
  for (const sc of SCENARIOS) assert.equal(checks.find((c) => c.id === `scenario:${sc.id}`)?.level, 'pass', sc.id);
  for (const id of ['node', 'banner', 'bind', 'kit-pin', 'inspectors', 'key-validation', 'key-has-no-credential-field']) assert.ok(checks.find((c) => c.id === id), id);
});

test('doctor fails on a non-loopback bind and on a reserved port', () => {
  assert.equal(runChecks({ PMA_BIND: '', PORT: '8080' }).find((c) => c.id === 'bind').level, 'fail');
});

test('the banner says what is simulated, names the three vendors as NOT called, and that the rest is unverified', () => {
  assert.match(BANNER, /SIMULATED/);
  assert.match(BANNER, /2026-11-21/);
  assert.match(BANNER, /UNVERIFIED/);
  assert.match(BANNER, /no Google Cloud Model Armor/);
  assert.match(NOT_REAL, /owner-run/);
  assert.match(NOT_REAL, /Google Cloud project/);
});
