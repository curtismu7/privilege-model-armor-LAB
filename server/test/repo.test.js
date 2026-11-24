import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '../src/pin.js';

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const inGithub = (f) => f.includes(`${path.sep}.github${path.sep}`);
const files = () => walk(REPO_ROOT).filter((f) => /\.(js|mjs|json|md|sh|yml|sha256)$/.test(f) && !f.endsWith('package-lock.json'));
// CI workflow files and the shared attribution script name the CI tool's download host or the very strings they hunt: not shipped lab text.
const labText = () => files().filter((f) => !inGithub(f) && !f.endsWith('check-no-ai-attribution.sh'));
// Files copied byte for byte from the family's shared components (each pinned by its own test) or from a shared tool: their text is not this lab's.
const VENDORED = [/web\/src\/(diagram-kit|top-menu|floating-dialog|gateway-trace|run-observability|talk-track)\//, /web\/src\/components\/(JsonPane|jsonpane)/, /web\/src\/standalone-ui\.css$/,
  /server\/src\/(gatewayTrace|runObservability|diagramStudioValidate|health)\.js$/, /scripts\/(run-observability-checkPin|check-ui-standard)\./, /docs\/content-pack\.schema\.json$/];
const own = (f) => !VENDORED.some((re) => re.test(f.split(path.sep).join('/')));
const OWN_REPO = /^github\.com\/curtismu7\/privilege-model-armor-LAB(?![\w-])/i;

test('shipped text names only reserved hosts (.example, .invalid, loopback) or this lab\'s own repo', () => {
  const ok = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|.*\.(example|invalid)|local\.ping-devops\.com)$/i;
  const bad = [];
  for (const f of labText().filter(own)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bhttps?:\/\/([^\s"'`<>\\)#?]+)/gi)) {
      const whole = m[1].replace(/:\d+(?=\/|$)/, '');
      const host = whole.split('/')[0].replace(/^[^@]*@/, '');
      if (!ok.test(host) && !/[${}]/.test(host) && !OWN_REPO.test(whole)) bad.push(`${path.relative(REPO_ROOT, f)}: ${host}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no AI attribution in any file', () => {
  const pat = /[G]enerated with \[?[C]laude Code|[C]o-[A]uthored-[B]y:/i;
  const hits = labText().filter((f) => !f.endsWith('repo.test.js') && pat.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

// Lab time is the kit's clock. Two web-era files stamp WALL-CLOCK instants on a run's log lines (what the stdout line says happened, and when): app.js takes
// `now` as a parameter (Date.now by default) and runObs.js turns the instant it is given into a string. The vendored files are pinned by their own tests.
const WALL_CLOCK = ['app.js', 'runObs.js', 'runObservability.js', 'gatewayTrace.js', 'diagramStudioValidate.js'];
test('the engine never calls the network or a timer for lab time; only the files that stamp a run\'s log lines read a wall clock', () => {
  const src = walk(path.join(REPO_ROOT, 'server/src')).filter((f) => f.endsWith('.js') && !f.includes('model-gateway-sim') && !f.endsWith('netguard.js') && !f.endsWith('health.js'));
  assert.ok(src.length > 20);
  for (const f of src) {
    const t = fs.readFileSync(f, 'utf8');
    const wall = WALL_CLOCK.includes(path.basename(f));
    assert.equal(/setTimeout|setInterval|Math\.random|\beval\(|new Function|node:vm/.test(t), false, path.relative(REPO_ROOT, f));
    if (!wall) assert.equal(/Date\.now|new Date\(/.test(t), false, `${path.relative(REPO_ROOT, f)}: the engine reads no wall clock`);
  }
  // the guard path, the inspectors, the key and the scenarios are the engine: they must not be on the list
  for (const f of ['guardPath.js', 'inspectors.js', 'keyInspector.js', 'scenarios.js', 'state.js', 'model.js']) assert.ok(!WALL_CLOCK.includes(f));
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'server/src/runObs.js'), 'utf8'), /new Date\(ms\)\.toISOString\(\)/, 'runObs only formats the instant it is given');
});

test('the only dependency is express, and the package says Node 26', () => {
  const root = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const server = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(server.dependencies), ['express']);
  assert.equal(root.engines.node, '>=26');
  assert.deepEqual(root.workspaces, ['server', 'web']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'web/package.json'), 'utf8')).dependencies).sort(), ['@xyflow/react', 'react', 'react-dom']);
  assert.equal(/node --test test\/\*\.test\.js$/.test(server.scripts.test), true, 'a glob, never a directory');
});

test('the fork carries none of the source lab\'s identity, apart from the honest "Fork of" line', () => {
  // The source's repo name, its old port range and its sidecar env names, built from parts so this file does not hold them whole.
  const src = ['ai', 'guard', 'sidecar'];
  const names = [src.join('-'), src.join('_'), `AI_${'GUARD'}_`, ['65', '00'].join(''), ['65', '01'].join(''), ['65', '02'].join('')];
  const hits = [];
  for (const f of labText().filter((x) => !x.endsWith('repo.test.js') && !x.endsWith('.sha256'))) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (names.some((n) => line.toLowerCase().includes(n.toLowerCase())) && !/Fork of /.test(line)) hits.push(`${path.relative(REPO_ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('the attribution check script passes in a git checkout', { skip: !fs.existsSync(path.join(REPO_ROOT, '.git')) }, () => {
  execFileSync('bash', [path.join(REPO_ROOT, 'scripts/check-no-ai-attribution.sh')], { stdio: 'pipe' });
});

test('the CI workflow runs build, test with the UI-standard check, doctor on the provisional port with the content pack, forbidden-strings and gitleaks', () => {
  const ci = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  for (const job of ['build:', 'test:', 'doctor:', 'forbidden-strings:', 'gitleaks:']) assert.ok(ci.includes(`\n  ${job}`), job);
  assert.match(ci, /PORT=7839 npm run doctor/);
  assert.match(ci, /run: npm run build/);
  assert.match(ci, /run: bash scripts\/check-ui-standard\.sh/);
  assert.match(ci, /validate-content-pack\.mjs/);
});
