// External inspector adapters: STUB inspectors with deterministic rules. They exist so the key / authority / fail-mode behaviour can be taught
// offline. They say NOTHING about how Google Cloud Model Armor, Azure AI Content Safety or Amazon Bedrock Guardrails detect anything:
// detection quality is a property of the real product. Category names are this lab's own labels.
//   model-armor: the four categories below follow Google's public Model Armor overview, read 2026-11-24 (prompt injection and
//   jailbreak, sensitive data, harmful content, malicious URL). Still UNVERIFIED: re-check before any claim, and the overview lists
//   more (CSAM, document screening) that this lab does not model.
//   azure-content-safety, bedrock-guardrails: category names are lab labels, not checked against the vendors' docs. UNVERIFIED.
//
// The adapter contract (the finding shape follows the source lab's /inspect response, as that lab describes it: UNVERIFIED):
//   inspector.call({ text, direction }) -> { status: 'ok' | 'unreachable', latencyMs, raw }
//   raw (when ok)  -> { findings: [{ category, severity: 'low'|'medium'|'high', location: { index }, messages: [string] }] }
// The gateway never trusts raw: readFindings() validates it and throws a named error when it is not that shape.
import { BOUNDS } from './bounds.js';
import { malformedFindings } from './errors.js';
import { fold } from './fold.js';
import { findPii } from './pii.js';
import { normalizeForDetection } from './sanitize.js';

export const INSPECTOR_STATES = ['healthy', 'unreachable', 'slow', 'malformed'];
export const SEVERITIES = ['low', 'medium', 'high'];
const LATENCY = { healthy: 80, unreachable: 20, malformed: 80, slow: 800 }; // lab ms. UNVERIFIED. slow = 10x healthy, like the kit provider's slow

// ---- shared stub detectors: text -> messages[] (empty = nothing found). A message never contains the matched text. ----
const INJECTION = [
  { id: 'instruction-override', re: /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|your)\b[^.\n]{0,30}\b(?:instructions?|rules?|prompts?|guidelines?|directions?)\b/i },
  { id: 'prompt-exfiltration', re: /\b(?:reveal|print|show|display|repeat|output|leak|tell me)\b[^.\n]{0,40}\b(?:system prompt|hidden (?:prompt|instructions?)|initial (?:prompt|instructions?)|your (?:instructions|rules|prompt))\b/i },
  { id: 'persona-switch', re: /\b(?:you are now|act as|pretend (?:to be|you are)|from now on you)\b[^.\n]{0,60}\b(?:dan|unrestricted|unfiltered|no restrictions|without (?:any )?(?:rules|restrictions|filters))\b/i },
  { id: 'do-anything-now', re: /\bdo anything now\b|\bdeveloper mode\b/i },
];
const HARM = [
  { id: 'build-weapon', re: /\b(?:build|make|assemble)\b[^.\n]{0,20}\b(?:bomb|explosives?)\b/i },
  { id: 'self-harm', re: /\bhow to (?:hurt|harm|kill) (?:myself|yourself)\b/i },
];
// Lab-made hosts only (.invalid never resolves). This is a stub list, not threat intelligence.
const BAD_HOST = /(?:^|\.)(?:malware|phish)\.invalid$/i;

const byRules = (rules) => (text) => {
  const t = normalizeForDetection(text);
  return rules.filter((r) => r.re.test(t)).map((r) => `stub rule ${r.id} matched`);
};
const injection = byRules(INJECTION);
const harm = byRules(HARM);
const sensitive = (text) => {
  const spans = findPii(fold(normalizeForDetection(text)).norm);
  if (!spans.length) return { messages: [], severity: 'low' };
  return { messages: [`stub PII rule matched: ${[...new Set(spans.map((s) => s.kind))].join(', ')}`], severity: spans.some((s) => s.severity === 'high') ? 'high' : 'medium' };
};
const badUrl = (text) => {
  let n = 0;
  for (const m of String(text).matchAll(/\bhttps?:\/\/([^\s/?#"'`<>\\)]{1,253})/gi)) {
    const host = m[1].replace(/:\d+$/, '').replace(/^[^@]*@/, '');
    if (BAD_HOST.test(host)) n += 1;
  }
  return n ? [`stub URL list matched ${n} link${n > 1 ? 's' : ''}`] : [];
};
const plain = (detect, severity) => (text) => ({ messages: detect(text), severity });

// ---- the three inspectors: id, label, vendor, the categories each can return, and the rule per category ----
const DEFS = [
  {
    id: 'model-armor', label: 'Model Armor (stub)', vendor: 'Google Cloud', unverified: 'category names follow the public overview of 2026-11-24; the rules are this lab\'s own',
    rules: [
      { category: 'prompt_injection_jailbreak', run: plain(injection, 'high') },
      { category: 'sensitive_data', run: sensitive },
      { category: 'harmful_content', run: plain(harm, 'high') },
      { category: 'malicious_url', run: plain(badUrl, 'high') },
    ],
  },
  {
    id: 'azure-content-safety', label: 'Azure AI Content Safety (stub)', vendor: 'Microsoft', unverified: 'category names are lab labels, not checked against the vendor docs',
    rules: [
      { category: 'prompt_attack', run: plain(injection, 'high') },
      { category: 'harmful_content', run: plain(harm, 'high') },
    ],
  },
  {
    id: 'bedrock-guardrails', label: 'Bedrock Guardrails (stub)', vendor: 'Amazon', unverified: 'category names are lab labels, not checked against the vendor docs',
    rules: [
      { category: 'prompt_attack', run: plain(injection, 'high') },
      { category: 'sensitive_information', run: sensitive },
      { category: 'harmful_content', run: plain(harm, 'high') },
    ],
  },
];

export const INSPECTOR_IDS = DEFS.map((d) => d.id);
export const describeInspectors = () => DEFS.map((d) => ({ id: d.id, label: d.label, vendor: d.vendor, categories: d.rules.map((r) => r.category), unverified: d.unverified }));
const categoriesOf = (id) => DEFS.find((d) => d.id === id).rules.map((r) => r.category);

export function createInspector(id) {
  const def = DEFS.find((d) => d.id === id);
  if (!def) throw new RangeError('unknown inspector');
  let state = 'healthy';
  return {
    id,
    label: def.label,
    vendor: def.vendor,
    categories: def.rules.map((r) => r.category),
    unverified: def.unverified,
    getState: () => state,
    setState(next) {
      if (!INSPECTOR_STATES.includes(next)) throw new RangeError('unknown inspector state');
      state = next;
    },
    // Never touches the network. `latencyMs` is lab time the caller advances the clock by (and caps at its timeout).
    call({ text, direction } = {}) {
      if (typeof text !== 'string') throw new TypeError('text must be a string');
      if (direction !== 'request' && direction !== 'response') throw new TypeError('direction must be request or response');
      const latencyMs = LATENCY[state];
      if (state === 'unreachable') return { status: 'unreachable', latencyMs, raw: null };
      if (state === 'malformed') {
        // Findings the contract does not allow: an unknown severity and messages that is not a list.
        return { status: 'ok', latencyMs, raw: { findings: [{ category: def.rules[0].category, severity: 'catastrophic', messages: 'not-a-list' }] } };
      }
      const findings = [];
      for (const rule of def.rules) {
        const r = rule.run(text);
        for (const message of r.messages) findings.push({ category: rule.category, severity: r.severity, location: { index: 0 }, messages: [message] });
      }
      return { status: 'ok', latencyMs, raw: { findings } };
    },
  };
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bad = (why) => { throw malformedFindings(why); };

// Validates what an inspector returned. Returns clean findings ({ category, severity, messages }) or throws the named error.
// Unknown fields are dropped (never passed on), an unknown category is malformed: a pass is never the answer to a shape it cannot read.
export function readFindings(raw, inspectorId) {
  if (!isPlain(raw)) bad('the answer is not an object');
  if (!Object.hasOwn(raw, 'findings') || !Array.isArray(raw.findings)) bad('findings is not a list');
  if (raw.findings.length > BOUNDS.maxFindings) bad(`more than ${BOUNDS.maxFindings} findings`);
  const allowed = categoriesOf(inspectorId);
  return raw.findings.map((f, i) => {
    if (!isPlain(f)) bad(`finding ${i} is not an object`);
    if (typeof f.category !== 'string' || !allowed.includes(f.category)) bad(`finding ${i} has no category this inspector returns`);
    if (!SEVERITIES.includes(f.severity)) bad(`finding ${i} has an unknown severity`);
    if (!Array.isArray(f.messages) || f.messages.length > BOUNDS.maxMessages || !f.messages.every((m) => typeof m === 'string' && m.length <= BOUNDS.maxMessageChars)) bad(`finding ${i} messages are not a short list of strings`);
    return { category: f.category, severity: f.severity, messages: [...f.messages] };
  });
}
