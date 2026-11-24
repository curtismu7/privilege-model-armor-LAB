// The guard path of one call: request -> inspect the prompt -> model stub -> inspect the response -> result.
// The gateway's OWN decision is named and says where it came from (origin: 'gateway'), so it cannot be mistaken for a model failure.
//   enforcing + a finding                 -> blocked, code blocked_by_inspector (403). A blocked prompt never reaches the model; a blocked
//                                            response WAS produced (tokens spent) and is withheld.
//   advisory  + a finding                 -> the finding is LOGGED and the call goes through (the authority cap).
//   inspector unreachable or timed out    -> failMode closed: blocked (inspector_unavailable 503 / inspector_timeout 504); open: logged, call goes through.
//   inspector answers with unreadable findings -> a named ERROR (inspector_malformed_findings 502), never a pass, whatever authority and failMode say.
// Every status, code and message here is this lab's model of a gateway, UNVERIFIED against the product.
import { BOUNDS } from './bounds.js';
import { promptTooLarge, invalidRequest, LabError } from './errors.js';
import { readFindings } from './inspectors.js';
import { maskPii } from './pii.js';
import { revealText } from './sanitize.js';

// Text that leaves the lab in a result: sensitive values masked, control and invisible characters made visible, bounded.
export const safeShow = (text, max = 400) => revealText(maskPii(String(text ?? '')), max);

const REFUSAL = {
  blocked_by_inspector: { status: 403, message: 'The gateway blocked this call: the key\'s inspector reported a finding and its authority is enforcing.' },
  inspector_unavailable: { status: 503, message: 'The gateway blocked this call: the key\'s inspector is unreachable and the key fails closed.' },
  inspector_timeout: { status: 504, message: 'The gateway blocked this call: the key\'s inspector did not answer in time and the key fails closed.' },
};

const RANK = { low: 0, medium: 1, high: 2 };
// One finding per category (the inspector may send several for one category): the highest severity, the messages merged (bounded).
export function mergeByCategory(found) {
  const by = new Map();
  for (const f of found) {
    const cur = by.get(f.category);
    if (!cur) by.set(f.category, { ...f, messages: [...f.messages] });
    else { if (RANK[f.severity] > RANK[cur.severity]) cur.severity = f.severity; for (const m of f.messages) if (cur.messages.length < BOUNDS.maxMessages && !cur.messages.includes(m)) cur.messages.push(m); }
  }
  return [...by.values()];
}

export function runGuard(lab, { prompt }) {
  if (typeof prompt !== 'string') throw invalidRequest('prompt must be a string');
  if (!prompt.trim()) throw invalidRequest('prompt must not be empty');
  if (prompt.length > BOUNDS.maxPromptChars) throw promptTooLarge(BOUNDS.maxPromptChars);

  const { clock, keyInspector: key, model, llmKey } = lab;
  const t0 = clock.now();
  const hops = []; const findings = []; const logged = [];
  let modelCalled = false; let tokensSpent = 0;
  const hop = (name, actor, startedAt, result, detail) => hops.push({ n: hops.length + 1, hop: name, actor, atMs: startedAt - t0, ms: clock.now() - startedAt, result, detail });
  const cfg = { inspector: key.inspector ? key.inspector.id : null, authority: key.authority, failMode: key.failMode, timeoutMs: key.timeoutMs };

  // Returns { stop: null } to carry on, or { stop: { outcome: 'blocked'|'error', refusal?|error? } }.
  function inspectStage(direction, text) {
    const name = direction === 'request' ? 'inspect-prompt' : 'inspect-response';
    const inspector = key.inspector;
    const startedAt = clock.now();
    if (!inspector) { hop(name, 'gateway', startedAt, 'skipped', 'the key has no inspector'); return { stop: null }; }

    const call = inspector.call({ text, direction });
    let unavailable = null; // 'inspector_unavailable' | 'inspector_timeout'
    if (call.status === 'unreachable') { clock.advance(call.latencyMs); unavailable = 'inspector_unavailable'; }
    else if (call.latencyMs >= key.timeoutMs) { clock.advance(key.timeoutMs); unavailable = 'inspector_timeout'; } // like the kit: reaching the timeout IS a timeout
    else clock.advance(call.latencyMs);

    if (unavailable) {
      if (key.failMode === 'closed') {
        hop(name, inspector.id, startedAt, 'blocked', `${unavailable}; failMode closed`);
        return { stop: { outcome: 'blocked', refusal: { origin: 'gateway', code: unavailable, direction, ...REFUSAL[unavailable] } } };
      }
      logged.push({ code: 'failed_open', direction, message: `${unavailable}; failMode open, the call went through` });
      hop(name, inspector.id, startedAt, 'failed-open', `${unavailable}; failMode open`);
      return { stop: null };
    }

    let found;
    try { found = readFindings(call.raw, inspector.id); } catch (e) {
      if (!(e instanceof LabError)) throw e;
      hop(name, inspector.id, startedAt, 'error', e.code);
      return { stop: { outcome: 'error', error: { origin: 'gateway', code: e.code, status: e.status, direction, message: e.message } } };
    }
    if (!found.length) { hop(name, inspector.id, startedAt, 'clear', '0 findings'); return { stop: null }; }

    found = mergeByCategory(found); // one finding per category and direction, whatever the inspector sent
    const action = key.authority === 'enforcing' ? 'blocked' : 'logged';
    for (const f of found) {
      findings.push({ direction, category: f.category, severity: f.severity, messages: f.messages.map((m) => revealText(m, BOUNDS.maxMessageChars)), action });
      if (action === 'logged') logged.push({ code: 'finding_logged_advisory', direction, category: f.category, message: `advisory: ${f.category} (${f.severity}) logged, the call went through` });
    }
    if (action === 'blocked') {
      hop(name, inspector.id, startedAt, 'blocked', `${found.length} finding${found.length > 1 ? 's' : ''}; authority enforcing`);
      return { stop: { outcome: 'blocked', refusal: { origin: 'gateway', code: 'blocked_by_inspector', direction, categories: [...new Set(found.map((f) => f.category))], ...REFUSAL.blocked_by_inspector } } };
    }
    hop(name, inspector.id, startedAt, 'logged', `${found.length} finding${found.length > 1 ? 's' : ''}; authority advisory, the call goes through`);
    return { stop: null };
  }

  const finish = (outcome, extra = {}) => {
    const refusal = extra.refusal ?? null; const error = extra.error ?? null; const response = extra.response ?? null;
    const client = outcome === 'passed' ? { status: 200, body: { text: safeShow(response) }, unverified: true }
      : { status: (refusal ?? error).status, body: { error: (refusal ?? error).code, message: (refusal ?? error).message }, unverified: true };
    return {
      outcome, served: outcome === 'passed', modelCalled, key: cfg,
      prompt: safeShow(prompt), response: response === null ? null : safeShow(response), refusal, error, client,
      findings, findingCount: findings.length, logged, hops, elapsedMs: clock.now() - t0,
      leftBehind: { gatewayLogEntries: logged.length, tokensSpent, modelRequests: llmKey.usage.snapshot().requests },
      note: 'Texts are masked and made inert before they are shown. Every field is the lab\'s model, UNVERIFIED against the product.',
    };
  };

  const req = inspectStage('request', prompt);
  if (req.stop) return finish(req.stop.outcome, req.stop);

  const startedAt = clock.now();
  const r = model.call({ prompt });
  modelCalled = true;
  if (!r.ok) {
    hop('model', model.id, startedAt, 'error', r.error);
    return finish('error', { error: { origin: r.origin, code: r.error, status: r.status, direction: 'model', message: `the model stub answered ${r.status} ${r.error}` } });
  }
  tokensSpent = r.usage.inputTokens + r.usage.outputTokens;
  llmKey.ledger.spend(tokensSpent); // the lab has no budget feature: the ledger is only the key's running total
  llmKey.usage.record();
  hop('model', model.id, startedAt, 'ok', `${tokensSpent} tokens`);

  const resp = inspectStage('response', r.text);
  if (resp.stop) return finish(resp.stop.outcome, resp.stop);
  return finish('passed', { response: r.text });
}
