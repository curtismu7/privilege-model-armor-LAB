import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '../src/pin.js';

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const inGithub = (f) => f.includes(`${path.sep}.github${path.sep}`);
const files = () => walk(REPO_ROOT).filter((f) => /\.(js|mjs|json|md|sh|yml|sha256)$/.test(f) && !f.endsWith('package-lock.json'));
// CI workflow files and the shared attribution script name the CI tool's download host or the very strings they hunt: not shipped lab text.
const labText = () => files().filter((f) => !inGithub(f) && !f.endsWith('check-no-ai-attribution.sh'));

test('shipped text names only reserved hosts (.example, .invalid, loopback)', () => {
  const ok = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|.*\.(example|invalid)|local\.ping-devops\.com)$/i;
  const bad = [];
  for (const f of labText()) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bhttps?:\/\/([^\s/?#"'`<>\\)]+)/gi)) {
      const host = m[1].replace(/:\d+$/, '').replace(/^[^@]*@/, '');
      if (!ok.test(host) && !/[${}]/.test(host)) bad.push(`${path.relative(REPO_ROOT, f)}: ${host}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no AI attribution in any file', () => {
  const pat = /[G]enerated with \[?[C]laude Code|[C]o-[A]uthored-[B]y:/i;
  const hits = labText().filter((f) => !f.endsWith('repo.test.js') && pat.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('the server never calls the network or a timer for lab time', () => {
  const src = walk(path.join(REPO_ROOT, 'server/src')).filter((f) => f.endsWith('.js') && !f.includes('model-gateway-sim') && !f.endsWith('netguard.js') && !f.endsWith('health.js'));
  for (const f of src) {
    const t = fs.readFileSync(f, 'utf8');
    assert.equal(/setTimeout|setInterval|Date\.now|new Date\(|Math\.random|\beval\(|new Function|node:vm/.test(t), false, path.relative(REPO_ROOT, f));
  }
});

test('the only dependency is express, and the package says Node 26', () => {
  const root = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const server = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(server.dependencies), ['express']);
  assert.equal(root.engines.node, '>=26');
  assert.deepEqual(root.workspaces, ['server']);
  assert.equal(/node --test test\/\*\.test\.js$/.test(server.scripts.test), true, 'a glob, never a directory');
});

test('the fork carries none of the source lab\'s identity, apart from the honest "Fork of" line', () => {
  // The source's repo name, its old port range and its sidecar env names, built from parts so this file does not hold them whole.
  const src = ['ai', 'guard', 'sidecar'];
  const names = [src.join('-'), src.join('_'), `AI_${'GUARD'}_`, ['65', '00'].join(''), ['65', '01'].join(''), ['65', '02'].join('')];
  const hits = [];
  for (const f of labText().filter((x) => !x.endsWith('repo.test.js'))) {
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

test('the CI workflow runs test, doctor on the provisional port, forbidden-strings and gitleaks', () => {
  const ci = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  for (const job of ['test:', 'doctor:', 'forbidden-strings:', 'gitleaks:']) assert.ok(ci.includes(`\n  ${job}`), job);
  assert.match(ci, /PORT=7839 npm run doctor/);
});
