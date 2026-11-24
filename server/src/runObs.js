// Rule 27: this lab's side of the shared run-observability panel. Pure functions around the vendored collector (runObservability.js, never
// edited here): the events one run (or one scenario, several runs) leaves behind, the one stdout line each decision writes, and the record builder.
//
// Mock only: every row is `simulated` and is an event this lab's own mock computed on this run (nothing is invented; a layer the mock never
// touched says so). The lab reads no logs, so only the collector core is vendored (no readers file). Time = when the lab computed it: the
// run's wall-clock start (passed in, never read here) plus the lab clock's offsets (each hop's start and length), so the rows and the stdout
// lines carry the same instants.
import { createRunObservability, LAYERS } from './runObservability.js';

export const SERVICE = 'privilege-model-armor-lab';
export const MAX_RUNS = 20;
const ID = /[^A-Za-z0-9._:/@-]/g;
const idText = (v) => String(v == null || v === '' ? '-' : v).replace(ID, '_').slice(0, 64);

// One timestamped line per decision: actor and outcome, never a prompt or a finding's text. Words a shared matcher reads as a decision are avoided
// on purpose (the result is passed / stopped / unclear, the step is a short id).
const RESULT = { allowed: 'passed', refused: 'stopped', blocked: 'stopped', info: 'unclear' };
export const decisionLine = (e, runId) => `${e.at} ${SERVICE} decision step=${idText(e.step)} actor=${idText(e.actor)} result=${RESULT[e.outcome] || 'unclear'} run=${idText(runId)}`;

const iso = (ms) => new Date(ms).toISOString();

// What an inspection hop decided, as a row outcome. Only a clear answer is an allow; the lab's own stops are `blocked`; the rest is information.
const HOP_OUTCOME = { clear: 'allowed', blocked: 'blocked', error: 'blocked', logged: 'info', 'failed-open': 'info', skipped: 'info', ok: 'info' };
const HOP_WORDS = {
  clear: (h) => `${h.actor} found nothing (${h.detail}).`,
  blocked: (h) => `${h.actor} stopped the call: ${h.detail}.`,
  logged: (h) => `${h.actor} reported ${h.detail}.`,
  'failed-open': (h) => `${h.actor} did not answer in time: ${h.detail}; the call went on.`,
  error: (h) => `${h.actor} answered with findings the gateway cannot read (${h.detail}); the call is stopped.`,
  skipped: () => 'The key has no inspector, so nothing was inspected.',
};

// runs: [{ run, label? }] in order (a live run is one; a scenario is one per prompt step). baseMs: wall-clock ms at the start. Returns events in time order.
export function eventsFor(runs, { baseMs }) {
  const ev = [];
  let offset = 0;
  const many = runs.length > 1;
  for (const { run, label } of runs) {
    const tag = many && label ? `[${label}] ` : '';
    const push = (at, e) => ev.push({ ...e, message: `${tag}${e.message}`, at: iso(baseMs + at) });
    push(offset, { layer: 'agent', step: 'request', actor: 'app', outcome: 'info', message: 'The app called the gateway with its LLM key (key-1). The lab holds no credential for it.', detail: { key: 'key-1', inspector: run.key.inspector, authority: run.key.authority, failMode: run.key.failMode, timeoutMs: run.key.timeoutMs } });
    for (const h of run.hops) {
      const end = offset + h.atMs + h.ms;
      if (h.hop === 'model') {
        push(end, { layer: 'resource', step: 'model', actor: h.actor, outcome: 'info', message: h.result === 'ok' ? `${h.actor} answered after ${h.ms} ms (${h.detail}).` : `${h.actor} answered with an error after ${h.ms} ms (${h.detail}).`, detail: { ms: h.ms, result: h.result } });
        continue;
      }
      const words = (HOP_WORDS[h.result] || ((x) => `${x.actor}: ${x.result} (${x.detail}).`))(h);
      push(end, { layer: 'privilege', step: h.hop, actor: h.actor, outcome: HOP_OUTCOME[h.result] || 'info', message: words, detail: { direction: h.hop === 'inspect-prompt' ? 'request' : 'response', result: h.result, ms: h.ms } });
    }
    const end = offset + run.elapsedMs;
    for (const l of run.logged) push(end, { layer: 'privilege', step: 'gateway-log', actor: 'gateway', outcome: 'info', message: `Gateway log entry ${l.code} (${l.direction}): ${l.message}`, detail: { code: l.code, direction: l.direction } });
    const refusal = run.refusal || run.error;
    if (run.outcome === 'passed') push(end, { layer: 'privilege', step: 'verdict', actor: 'gateway', outcome: 'allowed', message: `The call went through: HTTP ${run.client.status}; ${run.leftBehind.tokensSpent} tokens spent.`, detail: { status: run.client.status, tokensSpent: run.leftBehind.tokensSpent } });
    else push(end, { layer: 'privilege', step: 'verdict', actor: 'gateway', outcome: 'blocked', message: `The gateway answered ${refusal.status} ${refusal.code}${run.modelCalled ? `; the model had already been called (${run.leftBehind.tokensSpent} tokens spent)` : '; the model was not called'}.`, detail: { code: refusal.code, status: refusal.status, tokensSpent: run.leftBehind.tokensSpent } });
    offset = end;
  }
  return ev;
}

const WHY = {
  person: 'This lab has no signed-in person: the key belongs to an app.',
  authorize: 'This lab has no separate authorization decision: the inspector and its authority are the only gate, shown under Privilege.',
  gateway: 'This lab has no agent gateway hop. The lab model of the LLM gateway and its AI Guard is shown under Privilege.',
  agent: 'No call was made.', privilege: 'No call was made.', resource: 'The model was not called in this run (the prompt was stopped before it).',
};
const PRODUCT = { agent: 'lab mock app', privilege: 'lab mock gateway and inspector stub', resource: 'lab mock model' };

export function mockLayers(events) {
  return LAYERS.map((layer) => ({
    layer, products: [], reason: WHY[layer],
    simulated: events.filter((e) => e.layer === layer).map((e) => ({ at: e.at, product: PRODUCT[layer], outcome: e.outcome, message: e.message, detail: e.detail })),
  }));
}

// run: { id, startedAt (ISO), endedAt (ISO), events }.
export async function buildRunRecord(run, { clock = () => 0 } = {}) {
  if (!run) return null;
  return createRunObservability({ clock }).collectRun({ runId: run.id, startedAt: run.startedAt, endedAt: run.endedAt, source: 'mock', layers: mockLayers(run.events) });
}

// Where a run leaves logs and where they could stream (rule 27: the README says the same). The lab reads no log and claims no product logged anything.
export const STREAMS = Object.freeze([
  { product: 'This lab (stdout)', lives: 'one line per decision on the lab\'s standard output (docker logs)', streams: 'a collector could ship it to a log index; this lab does not' },
  { product: 'The Privilege gateway', lives: 'not read by this lab (no Real mode yet)', streams: 'the Privilege SIEM export; whether the product logs an inspector\'s finding, and how, is UNVERIFIED' },
]);
