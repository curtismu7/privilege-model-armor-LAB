// The "What Privilege did" trace for one run (rule 25), built from the guard path's result with the vendored gatewayTrace.js (mockTrace).
// Step 1 is the app's call to the lab's mock gateway; its decisions are the run's hops, in order. Every call the gateway made on the way is its own
// step with its own request and response: one per inspection (prompt, response) and one to the model. The lab's gateway computed every decision,
// so every basis is `checked`. Hosts are .example. The values shown as credentials are labelled lab mocks: the lab holds no credential for a key.
// Texts shown are the ones the run already masked (safeShow): a card number never appears whole.
import { mockTrace } from './gatewayTrace.js';

const GATEWAY_URL = 'https://gateway.lab.example/v1/chat';
const INSPECTOR_URL = 'https://inspector.lab.example/v1/inspect';
const MODEL_URL = 'https://model.lab.example/v1/chat';
const MOCK_KEY = 'Bearer MOCK-key-1 (a lab mock value, not a credential)';
const MOCK_INSPECTOR = 'Bearer MOCK-inspector (a lab mock value, not a credential)';
const WITHHELD = '[the model\'s answer: withheld by the gateway, so not shown]';

const OUTCOME = { clear: 'pass', ok: 'pass', blocked: 'fail', error: 'fail', logged: 'info', 'failed-open': 'info', skipped: 'skipped' };
const LABEL = { 'inspect-prompt': 'Inspect the prompt', 'inspect-response': 'Inspect the response', model: 'Call the model' };

const decisionOf = (h) => ({ id: `${h.n}-${h.hop}`, label: LABEL[h.hop] || h.hop, outcome: OUTCOME[h.result] || 'info', evidence: `${h.actor}: ${h.result} (${h.detail}); ${h.ms} ms of lab time.` });

// The inspector's own reply for one inspection hop, as the stub gave it (never more than the run kept: category, severity, the lab's message).
function inspectorReply(run, hop) {
  const direction = hop.hop === 'inspect-prompt' ? 'request' : 'response';
  if (/inspector_unavailable/.test(hop.detail)) return { status: 503, body: { error: 'unreachable', note: 'The stub did not answer; this is what the gateway saw.' } };
  if (/inspector_timeout|did not answer/.test(hop.detail)) return { status: 504, body: { error: 'no answer in time', note: `The gateway gave up after ${hop.ms} ms of lab time; the stub sent nothing.` } };
  if (hop.result === 'error') return { status: 200, body: { findings: 'not in a shape the gateway can read (lab stub)' } };
  return { status: 200, body: { findings: run.findings.filter((f) => f.direction === direction).map(({ category, severity, messages }) => ({ category, severity, messages })) } };
}

export function exchangesFor(run) {
  const decisions = run.hops.map(decisionOf);
  const ok = run.outcome === 'passed';
  const verdict = ok ? { id: 'verdict', label: 'Result', outcome: 'pass', evidence: `The call went through: HTTP ${run.client.status}.` }
    : { id: 'verdict', label: 'Result', outcome: 'fail', evidence: `The gateway answered HTTP ${run.client.status} (${run.client.body.error}); origin ${(run.refusal || run.error).origin}.` };
  const first = {
    step: 1, title: `App to gateway: ${ok ? 'answered' : `${run.client.status} ${run.client.body.error}`}`, status: run.client.status,
    trace: mockTrace({
      url: GATEWAY_URL, authorization: MOCK_KEY, requestHeaders: { accept: null }, rpc: { messages: [{ role: 'user', content: run.prompt }] },
      status: run.client.status, body: { ...run.client.body, note: 'Lab model: the real status and body a client receives are UNVERIFIED.' }, decisions: [...decisions, verdict],
    }),
  };
  const calls = run.hops.filter((h) => h.result !== 'skipped').map((h, i) => {
    if (h.hop === 'model') {
      const status = run.error?.direction === 'model' ? run.error.status : 200;
      return {
        step: i + 2, title: `Gateway to model: ${status === 200 ? 'answered' : `HTTP ${status}`}`, status,
        trace: mockTrace({
          url: MODEL_URL, authorization: MOCK_KEY, requestHeaders: { accept: null }, rpc: { model: 'stub-model', messages: [{ role: 'user', content: run.prompt }] }, status,
          body: status === 200 ? { text: run.response ?? WITHHELD, usage: { note: 'lab mock', tokens: run.leftBehind.tokensSpent } } : { error: h.detail },
          decisions: [{ id: 'reply', label: status === 200 ? 'The model answered' : 'The model could not answer', outcome: status === 200 ? 'pass' : 'fail', evidence: `HTTP ${status} after ${h.ms} ms (lab mock model).` }],
        }),
      };
    }
    const direction = h.hop === 'inspect-prompt' ? 'request' : 'response';
    const reply = inspectorReply(run, h);
    return {
      step: i + 2, title: `Gateway to inspector (${direction}): ${h.result}`, status: reply.status,
      trace: mockTrace({
        url: INSPECTOR_URL, authorization: MOCK_INSPECTOR, requestHeaders: { accept: null },
        rpc: { inspector: run.key.inspector, direction, text: direction === 'request' ? run.prompt : (run.response ?? WITHHELD) }, status: reply.status, body: reply.body, decisions: [decisionOf(h)],
      }),
    };
  });
  return [first, ...calls];
}
