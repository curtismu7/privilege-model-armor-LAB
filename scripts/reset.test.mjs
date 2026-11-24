import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, startHttpServer } from '../server/src/app.js';
import { validateConfig } from '../server/src/customer.js';
import { reset } from './reset.mjs';

test('npm run reset takes a workspace id, sends X-Workspace and clears that workspace only (default when none is given)', async () => {
  const app = createApp({ runChecks: () => [], customer: validateConfig({}), log: () => {}, env: {} });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app });
  const base = url.replace(/\/$/, '');
  const post = (p, ws, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-workspace': ws }, body: JSON.stringify(body) });
  const runs = async (ws) => (await (await fetch(`${base}/api/log`, { headers: { 'x-workspace': ws } })).json()).runs.length;
  try {
    for (const ws of ['default', 'w-0123456789abcdef']) await post('/api/run', ws, { prompt: 'Summarise our refund policy.' });
    const tab = await reset(base, 'w-0123456789abcdef');
    assert.deepEqual([tab.reset, tab.workspace], ['ok', 'w-0123456789abcdef']);
    assert.equal(await runs('w-0123456789abcdef'), 0, 'the tab\'s workspace was cleared');
    assert.equal(await runs('default'), 1, 'the default workspace was not');
    assert.equal((await reset(base)).workspace, 'default');
    assert.equal(await runs('default'), 0);
    await assert.rejects(() => reset(base, 'Bad Id'), /workspace id must be/);
    await assert.rejects(() => reset('http://evil.example:7846'), /loopback only/);
  } finally { await new Promise((r) => server.close(r)); }
});
