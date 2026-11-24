import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';
import { installNetguard, netguardSelfTest } from '../src/netguard.js';
import { createApp, startHttpServer } from '../src/app.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { INSPECTOR_IDS, INSPECTOR_STATES } from '../src/inspectors.js';
import { INJECTION, lab, run } from './helpers.js';

test('the netguard self-test: every outbound path is refused and recorded', async () => {
  const guard = installNetguard();
  const r = await netguardSelfTest();
  assert.equal(r.ok, true, r.detail);
  assert.equal(r.blocked, 6);
  assert.equal(guard.attempts.length, 0, 'self-test attempts are not counted as real');
  guard.restore();
});

test('a full run of every scenario, every inspector and the HTTP API makes zero outbound attempts', async () => {
  const guard = installNetguard();
  for (const sc of SCENARIOS) assert.equal(runScenario(sc.id).ok, true);
  for (const id of INSPECTOR_IDS) for (const state of INSPECTOR_STATES) {
    const l = lab({ inspector: id, inspectorState: state });
    run(l, INJECTION);
  }
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp() });
  try {
    const base = url.replace(/\/$/, '');
    const h = { 'content-type': 'application/json', origin: base };
    assert.equal((await fetch(`${base}/api/health`)).status, 200); // loopback is allowed
    assert.equal((await fetch(`${base}/api/scenario/clean-prompt-passes`, { method: 'POST', headers: h, body: '{}' })).status, 200);
    assert.equal((await fetch(`${base}/api/run`, { method: 'POST', headers: h, body: JSON.stringify({ prompt: INJECTION }) })).status, 200);
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(guard.attempts, []);
  await assert.rejects(() => fetch('http://self-test.invalid/'), /network blocked/);
  assert.equal(guard.attempts.length, 1, 'and the guard does record a real attempt');
  guard.restore();
});

test('a literal IP address needs no lookup (listen() does one for an opted-in bind): the lookup is allowed and recorded as nothing, connecting to it is still refused', async () => {
  const guard = installNetguard();
  try {
    for (const ip of ['192.0.2.1', '2001:db8::1']) {
      await new Promise((res, rej) => dns.lookup(ip, (e, a) => (e ? rej(e) : res(a))));
      await dns.promises.lookup(ip);
    }
    assert.deepEqual(guard.attempts, [], 'a literal IP lookup is not an outbound attempt');
    // a NAME is still refused, and so is a connection to the literal IP
    await assert.rejects(() => dns.promises.lookup('self-test.invalid'), /network blocked/);
    assert.throws(() => net.connect({ host: '192.0.2.1', port: 9 }), /network blocked/);
    assert.deepEqual(guard.attempts, ['dns:self-test.invalid', 'socket:192.0.2.1']);
  } finally { guard.restore(); }
  const g2 = installNetguard();
  const r = await netguardSelfTest();
  assert.equal(r.ok, true, r.detail);
  g2.restore();
});
