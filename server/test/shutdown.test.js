import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { REPO_ROOT } from '../src/pin.js';

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

// Started like the image starts it. Waits for the "health:" line, then asks it to stop.
async function startAndStop(signal) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'server/src/index.js')], { env: { ...process.env, PORT: String(port), CUSTOMER_CONFIG: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  await new Promise((resolve, reject) => { const t = setInterval(() => { if (/health:/.test(out)) { clearInterval(t); resolve(); } }, 20); child.once('exit', () => { clearInterval(t); reject(new Error(`exited early: ${out}`)); }); });
  const started = Date.now();
  const exit = new Promise((resolve) => child.once('exit', (code, sig) => resolve({ code, sig })));
  child.kill(signal);
  const r = await Promise.race([exit, new Promise((resolve) => { const t = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: 'timeout' }); }, 4000); t.unref(); })]);
  return { ...r, ms: Date.now() - started, out, port };
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`${signal} closes the server and exits 0 at once (docker stop does not wait its 10 s)`, async () => {
    const r = await startAndStop(signal);
    assert.equal(r.code, 0, r.out);
    assert.ok(r.ms < 3000, `exited in ${r.ms} ms`);
    assert.match(r.out, new RegExp(`${signal}: closing`));
    assert.match(r.out, new RegExp(`bound to 127\\.0\\.0\\.1:${r.port}`), 'the line names the port really bound');
    assert.doesNotMatch(r.out, /claimed provisionally/, 'the provisional note is only for the default port');
  });
}
