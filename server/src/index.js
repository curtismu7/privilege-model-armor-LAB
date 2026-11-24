import { installNetguard } from './netguard.js';
import { createApp, startHttpServer } from './app.js';
import { allPassed } from './doctor.js';
import { runChecks } from './checks.js';
import { loadCustomerConfig } from './customer.js';
import { DEFAULT_PORT, allowedExtraHosts, assertBindAllowed, bindHost, resolvePort } from './safety.js';

// Zero real outbound: install before anything else can open a socket.
installNetguard();

try { allowedExtraHosts(process.env); } catch (e) { console.error(`[privilege-model-armor-lab] refusing to start: ${e.message}`); process.exit(1); }
const checks = runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[privilege-model-armor-lab] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
const host = assertBindAllowed(bindHost(), process.env);
// customer.config.json problems are never fatal (a bad field falls back to its default) but they are said here, once, and on the Stories page.
const customer = loadCustomerConfig({ env: process.env });
for (const w of customer.warnings) console.warn(`[privilege-model-armor-lab] customer.config: ${w}`);
const app = createApp({ customer });
const port = resolvePort();
const { server, url } = await startHttpServer({ port, host, app });
const bound = server.address().port;
console.log(`[privilege-model-armor-lab] API at ${url}api/ (Mock only; bound to ${host}:${bound}${bound === DEFAULT_PORT ? '; port 7846 is claimed provisionally' : ''}; no outbound call)`);
console.log(`[privilege-model-armor-lab] health: ${url}api/health`);

// docker stop sends SIGTERM: close the server and leave at once (as PID 1 the process would otherwise ignore it and be killed after 10 s).
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[privilege-model-armor-lab] ${sig}: closing`);
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
