// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERTICALS, DEFAULT_VERTICAL, fillDeep } from '../server/src/cast.js';
import { STORIES } from '../server/src/stories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function buildPack() {
  const cast = VERTICALS[DEFAULT_VERTICAL].cast;
  const stories = STORIES.map(({ file, ...s }) => ({ file, ...fillDeep(s, cast) }));
  const T = { 'clean-prompt-passes': ['external-inspector'], 'injection-blocked-when-enforcing': ['external-inspector', 'authority-cap'], 'sensitive-data-in-prompt': ['external-inspector', 'authority-cap'],
    'sensitive-data-in-response': ['external-inspector'], 'malicious-url-blocked': ['external-inspector'], 'advisory-logs-then-enforcing-blocks': ['authority-cap', 'unverified-model'],
    'inspector-unreachable-closed-vs-open': ['fail-open-closed', 'unverified-model'], 'slow-inspector-times-out': ['fail-open-closed', 'unverified-model'], 'malformed-findings-named-error': ['named-error', 'unverified-model'],
    'second-inspector-replaces-first': ['external-inspector'], 'two-inspectors-refused': ['external-inspector', 'named-error'] };
  return {
    schema: 'demo-content-pack/1',
    id: 'privilege-model-armor-lab',
    title: 'Privilege Model Armor LAB',
    version,
    demo: { id: 'privilege-model-armor-lab', name: 'Privilege Model Armor LAB', catalog: 'D000', baseUrl: 'http://localhost:7839', doctor: '/api/health', tags: ['llm', 'inspector', 'ai-guard', 'privilege', 'simulated', 'mock-only'] },
    glossary: [
      { id: 'external-inspector', term: 'External inspector', definition: 'An LLM key can use one external inspector in AI Guard; the lab models Model Armor first, with Azure AI Content Safety and Bedrock Guardrails as stub alternatives. A key has one: selecting another replaces the first. The lab\'s inspectors are stubs with fixed rules and say nothing about any vendor\'s detection.', aliases: ['Model Armor', 'inspector'] },
      { id: 'authority-cap', term: 'Authority cap', definition: 'The authority setting decides whether the inspector\'s findings enforce or only advise. Enforcing: a finding blocks the call. Advisory: the same finding is logged and the call goes through. The cap existing is from the 2026-11-21 release notes; what a blocked or logged call looks like is the lab\'s own model.', aliases: ['advisory', 'enforcing'] },
      { id: 'fail-open-closed', term: 'Fail open or closed', definition: 'What the key does when its inspector is unreachable or too slow: closed blocks the call, open lets it through and the gateway log says so. Whether the product offers either is UNVERIFIED; the lab shows both as two configurations.', aliases: ['failMode', 'timeout'] },
      { id: 'named-error', term: 'Named error', definition: 'A refusal or error that carries its own code and says it came from the gateway (blocked_by_inspector, inspector_unavailable, inspector_timeout, inspector_malformed_findings, two_inspectors). Unreadable findings are always a named error, never a pass. The codes and statuses are the lab\'s own and UNVERIFIED.', aliases: ['refusal'] },
      { id: 'unverified-model', term: 'UNVERIFIED (lab model)', definition: 'Anything the release notes do not say is the lab\'s own model and is labelled UNVERIFIED: the category names (Model Armor\'s follow Google\'s public overview and need re-checking), fail-open or fail-closed, the timeout, what a client receives, whether the response is inspected, and the finding shape.', aliases: ['lab model'] },
    ],
    sources: [],
    cards: [
      ...stories.map((s) => ({ id: `try-${s.scenario}`, label: `${s.id}: ${s.title}`, description: s.control, group: 'try-it', action: { type: 'route', href: `/#inspector/${s.scenario}` }, terms: T[s.scenario], story: s.id })),
      { id: 'concept-limits', label: 'What is sourced and what is the lab\'s model', description: 'The release-notes claims, the lab\'s own model and the list of what is UNVERIFIED.', group: 'concept', action: { type: 'route', href: '/#limits' }, terms: ['unverified-model'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    diagrams: [{ id: 'model-armor-inspector', label: 'External inspector in AI Guard: enforcing or advisory', href: '/#diagram', mode: 'mock' }],
    stories: stories.map((s) => ({ id: s.id, title: s.title, say: s.control, file: `server/src/data/stories/${s.file}` })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
}
