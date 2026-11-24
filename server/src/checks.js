// The lab's doctor checks: synchronous, no network, no secret. Used by `npm run doctor` and (refreshed in the background) GET /api/health.
// Every scenario is one check: the same run the tests make, with its expected result.
import fs from 'node:fs';
import { BANNER } from './banner.js';
import { nodeCheck } from './doctor.js';
import { INSPECTOR_IDS } from './inspectors.js';
import { validateKeyPatch } from './keyInspector.js';
import { checkPin, PIN_FILE } from './pin.js';
import { assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { SCENARIOS, runScenario } from './scenarios.js';
import { createLab } from './state.js';

const attempt = (id, fn) => {
  try { const r = fn(); return { id, level: r.ok ? 'pass' : 'fail', detail: r.detail }; } catch (e) { return { id, level: 'fail', detail: String(e.message).slice(0, 160) }; }
};
const refusedWith = (fn, code) => { try { fn(); return false; } catch (e) { return e?.code === code; } };

export function runChecks(env = process.env) {
  const checks = [nodeCheck(26)];
  checks.push(attempt('banner', () => ({ ok: /UNVERIFIED/.test(BANNER) && /2026-11-21/.test(BANNER) && /SIMULATED/.test(BANNER), detail: 'the banner says what is simulated and that the rest is UNVERIFIED' })));
  checks.push(attempt('bind', () => { const h = assertBindAllowed(bindHost(env), env); resolvePort(env); return { ok: true, detail: `binds ${h} (loopback unless PMA_BIND is set on purpose)` }; }));
  checks.push(fs.existsSync(PIN_FILE)
    ? attempt('kit-pin', () => { const p = checkPin(); return { ok: p.length === 0, detail: p.length ? p.join('; ') : 'the vendored model-gateway-sim files match the pin' }; })
    : { id: 'kit-pin', level: 'info', detail: 'pin file not shipped in this build; the repo tests check it' });
  checks.push(attempt('inspectors', () => ({ ok: INSPECTOR_IDS.length === 3, detail: `${INSPECTOR_IDS.join(', ')} (stubs; no vendor is called)` })));
  checks.push(attempt('key-validation', () => ({
    ok: refusedWith(() => validateKeyPatch({ inspectors: ['model-armor', 'azure-content-safety'] }), 'two_inspectors')
      && refusedWith(() => validateKeyPatch({ authority: 'maybe' }), 'invalid_key_config')
      && refusedWith(() => validateKeyPatch({ credential: 'x' }), 'invalid_key_config')
      && refusedWith(() => validateKeyPatch(JSON.parse('{"__proto__":{}}')), 'invalid_key_config'),
    detail: 'two inspectors, a bad authority, a credential field and a __proto__ key are refused with named errors',
  })));
  checks.push(attempt('key-has-no-credential-field', () => {
    const lab = createLab();
    const names = JSON.stringify([Object.keys(lab.llmKey), Object.keys(lab.keyInspector.view())]);
    return { ok: !/secret|credential|password|token|apiKey|project/i.test(names), detail: 'the key and its inspector setting carry no credential field' };
  }));
  for (const sc of SCENARIOS) {
    checks.push(attempt(`scenario:${sc.id}`, () => {
      const r = runScenario(sc.id);
      const failed = r.checks.filter((c) => !c.pass);
      return { ok: r.ok, detail: r.ok ? `${r.checks.length} expected results hold` : `failed: ${failed.map((c) => c.path).join(', ')}` };
    }));
  }
  return checks;
}
