#!/usr/bin/env node
// Reset a running lab. Usage: node scripts/reset.mjs [base-url] [workspace]   (base-url default http://localhost:${PORT:-7846}; workspace from the
// argument, else PMA_WORKSPACE, else "default").
// What it clears: ONE workspace (rule 13), the one it names. That workspace's key and inspector setting go back to the default (Model Armor stub, enforcing,
// fail closed, 500 ms), its lab clock goes to zero, its run log, gateway log and last run (what "What this run left behind" shows) are emptied and its
// slot is given back. Other workspaces are not touched. A browser tab uses its own id, "w-" and 16 hex digits (sessionStorage key pma.workspace, and
// `workspace` in GET /api/info with that tab's X-Workspace header); the id "default" is what curl and the doctor use. To clear a tab, pass its id.
// Loopback only: refuses any other host. Needs the server already running; sends the same-origin header the server requires.
import { pathToFileURL } from 'node:url';
import { isLoopbackHost } from '../server/src/safety.js';
import { validWorkspace } from '../server/src/workspaces.js';

export async function reset(base = `http://localhost:${process.env.PORT || 7846}`, workspace = process.env.PMA_WORKSPACE || 'default') {
  const u = new URL(base);
  if (!isLoopbackHost(u.hostname)) throw new Error(`refusing ${u.hostname}: loopback only`);
  if (!validWorkspace(workspace)) throw new Error('the workspace id must be 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit');
  const r = await fetch(new URL('/api/reset', u), { method: 'POST', headers: { 'content-type': 'application/json', origin: u.origin, 'x-workspace': workspace }, body: '{}' });
  if (!r.ok) throw new Error(`reset failed: HTTP ${r.status}`);
  return r.json();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reset(process.argv[2], process.argv[3] || undefined).then((j) => console.log(`reset: ${j.reset} (workspace ${j.workspace}, ${j.cleared} entries cleared)`), (e) => { console.error(e.message); process.exit(1); });
}
