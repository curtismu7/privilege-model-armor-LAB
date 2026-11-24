import { useEffect, useRef, useState } from "react";
import { visible } from "../safeText";
import { Card, Chip, HOT, Json } from "../components/Bits.jsx";
import GatewayTrace from "../gateway-trace/GatewayTrace.jsx";
import RunObservability from "../run-observability/RunObservability.jsx";
import { hopResultText, ms } from "../fmt";

// What the page says first about one run. outcome: passed | blocked | error. A pass can still carry a logged finding (advisory) or an unchecked call (failed open).
export function verdictOf(run) {
  const logged = run.findings.filter((f) => f.action === "logged");
  const failedOpen = run.logged.some((l) => l.code === "failed_open");
  const inspected = run.hops.some((h) => h.hop !== "model" && h.result !== "skipped");
  if (run.outcome === "passed") {
    if (logged.length) return { kind: "logged", state: "warn", chip: "LOGGED, THEN PASSED", line: `The inspector reported ${logged.length} finding${logged.length > 1 ? "s" : ""} but the key's authority is advisory: ${logged.length > 1 ? "they were" : "it was"} written to the gateway log and the call went through.` };
    if (failedOpen) return { kind: "failed-open", state: "warn", chip: "PASSED, FAILED OPEN", line: "The inspector did not answer and the key fails open: the call went through unchecked, and the gateway log says so." };
    if (!inspected) return { kind: "uninspected", state: "info", chip: "PASSED, NOT INSPECTED", line: "The key has no inspector, so nothing was checked." };
    return { kind: "passed", state: "ok", chip: "PASSED", line: "The inspector found nothing in the prompt or in the answer, and the client got the answer." };
  }
  const x = run.refusal || run.error;
  if (run.outcome === "blocked") return { kind: "blocked", state: "bad", chip: "BLOCKED", line: `The gateway stopped this call itself (origin ${x.origin}), ${x.direction === "response" ? "after the model had answered: the answer is withheld" : "before the model saw the prompt"}.`, code: x.code, status: x.status };
  if (x.direction === "model") return { kind: "model-error", state: "bad", chip: "MODEL ERROR", line: `The model stub answered with an error (origin ${x.origin}, ${x.code}) after the prompt passed the inspector. The gateway passes that failure on; it is not a finding and not an inspector error.`, code: x.code, status: x.status };
  return { kind: "error", state: "bad", chip: "NAMED ERROR", line: "The inspector answered with findings the gateway cannot read. That is never a pass: the call is stopped and the model is not called.", code: x.code, status: x.status };
}

const nameOf = (run) => run.key.inspector || "no inspector";

// The verdict first, as a card.
export function Verdict({ run, kicker, label }) {
  const v = verdictOf(run);
  const x = run.refusal || run.error;
  return (
    <Card tone={v.state === "bad" ? "warn" : v.state === "ok" ? "ok" : v.state} kicker={kicker} testId="verdict">
      <h2 className="card__title">
        <Chip state={v.state} testId="verdict-chip">{v.chip}</Chip>{" "}
        {v.code && <><code data-testid="verdict-code">{visible(v.code)}</code>{" "}<span data-testid="verdict-status">HTTP {v.status}</span></>}
        {label && <span className="muted"> {visible(label)}</span>}
      </h2>
      <p data-testid="verdict-line">{visible(v.line)}</p>
      <dl className="kv">
        <dt>Inspector</dt><dd>{visible(nameOf(run))}, {run.key.authority}, fail {run.key.failMode}, timeout {run.key.timeoutMs} ms</dd>
        <dt>Findings</dt><dd data-testid="verdict-findings">{run.findingCount}</dd>
        <dt>Model called</dt><dd data-testid="verdict-model">{run.modelCalled ? "yes" : "no"}</dd>
        <dt>Tokens spent</dt><dd data-testid="verdict-tokens">{run.leftBehind.tokensSpent}</dd>
        <dt>Lab time</dt><dd>{ms(run.elapsedMs)}</dd>
        {x && <><dt>Message</dt><dd data-testid="verdict-message">{visible(x.message)}</dd></>}
        {run.outcome === "passed" && <><dt>Answer (lab mock)</dt><dd><code>{visible(run.response)}</code></dd></>}
      </dl>
      <p className="muted">The status and wording are this lab's own and UNVERIFIED against the product.</p>
    </Card>
  );
}

const CATEGORY_NOTE = {
  "model-armor": "Model Armor's category names follow Google's public overview (read 2026-11-24) and are UNVERIFIED: re-check them before any claim.",
  "azure-content-safety": "These category names are lab labels, not checked against the vendor's documents.",
  "bedrock-guardrails": "These category names are lab labels, not checked against the vendor's documents.",
};

export function Findings({ run }) {
  return (
    <section className="card card--neutral" data-testid="findings" aria-label="Findings">
      <p className="kicker">Findings, with their categories</p>
      {run.findings.length === 0 ? <p data-testid="findings-none"><Chip state="ok">no findings</Chip> The inspector reported nothing{run.hops.every((h) => h.hop === "model" || h.result === "skipped") ? " (there was no inspector)" : run.outcome === "passed" ? "" : ", or it was not asked"}.</p> : (
        <div className="scroll">
          <table className="tbl tbl--wide">
            <caption className="sr-only">Findings</caption>
            <thead><tr><th scope="col" className="nowrap">Where</th><th scope="col" className="nowrap">Category</th><th scope="col">Severity</th><th scope="col">What the gateway did</th><th scope="col">Inspector's message</th></tr></thead>
            <tbody>
              {run.findings.map((f, i) => (
                <tr key={i} data-testid={`finding-${i}`}>
                  <td className="nowrap">{f.direction === "request" ? "prompt" : "response"}</td>
                  <td className="nowrap"><code>{visible(f.category)}</code><br /><Chip state="warn">UNVERIFIED name</Chip></td>
                  <td>{f.severity}</td>
                  <td><Chip state={f.action === "blocked" ? "bad" : "warn"} wrap>{f.action === "blocked" ? "blocked the call" : "logged, call went on"}</Chip></td>
                  <td>{f.messages.map((m, k) => <span key={k} className="block">{visible(m)}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {CATEGORY_NOTE[run.key.inspector] && <p className="muted" data-testid="category-note">{CATEGORY_NOTE[run.key.inspector]} The stub rules say nothing about how any real inspector detects anything.</p>}
    </section>
  );
}

export function Path({ run }) {
  return (
    <section className="card card--neutral" data-testid="path" aria-label="The call path">
      <p className="kicker">The call path, step by step (lab clock)</p>
      <ol className="hops">
        {run.hops.map((h) => (
          <li key={h.n} data-testid={`hop-${h.n}`} data-hop={h.hop}>
            <span className="step-num">{h.n}</span><strong>{visible(h.hop)}</strong> by <code>{visible(h.actor)}</code>:{" "}
            <Chip state={h.result === "clear" || h.result === "ok" ? "ok" : h.result === "blocked" || h.result === "error" ? "bad" : h.result === "skipped" ? "info" : "warn"} wrap>{hopResultText(h.result)}</Chip>{" "}
            <span className="muted">at {h.atMs} ms, took {h.ms} ms. {visible(h.detail)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const BASIS = "Simulated: the lab's own mock gateway computed every decision, so each is marked checked. The hosts are .example names and the credentials shown are lab mocks, never real ones. How the real product words its response is UNVERIFIED.";

// One run in full: verdict, findings, path, trace and what it left behind.
function RunDetail({ run, exchanges, obs, source, kicker, label, showRecord }) {
  return (
    <>
      <Verdict run={run} kicker={kicker} label={label} />
      <Findings run={run} />
      <Path run={run} />
      <GatewayTrace exchanges={exchanges} source="mock" title="What the gateway did (simulated)" basisNote={BASIS} hot={["error", "ok", "refusal", "findings"]} />
      <section className="card card--neutral" data-testid="left-behind" aria-label="What this run left in the lab">
        <p className="kicker">What this run left in the lab</p>
        <dl className="kv">
          <dt>Gateway log entries</dt><dd data-testid="left-log">{run.leftBehind.gatewayLogEntries}{run.logged.length ? `: ${run.logged.map((l) => l.code).join(", ")}` : ""}</dd>
          <dt>Tokens spent</dt><dd data-testid="left-tokens">{run.leftBehind.tokensSpent}</dd>
          <dt>Model requests</dt><dd data-testid="left-requests">{run.leftBehind.modelRequests}</dd>
        </dl>
      </section>
      {showRecord && <RunObservability record={obs?.record ?? null} source={source} streams={obs?.streams || []} title="What this run left behind" />}
    </>
  );
}

// The page's main lesson: the same finding under the two authorities. Before the pair has run it says what will happen and offers the run.
export function Pair({ last, busy, onRun }) {
  const steps = last?.kind === "scenario" && last.scenario?.id === "advisory-logs-then-enforcing-blocks" ? last.scenario.steps.filter((s) => s.run) : null;
  const col = (s, title) => {
    const v = verdictOf(s.run);
    return (
      <div className={`pair__col pair__col--${v.state}`} data-testid={`pair-${title.toLowerCase()}`}>
        <h3>{title}</h3>
        <p><Chip state={v.state}>{v.chip}</Chip></p>
        <p className="muted">Finding: <code>{visible(s.run.findings[0]?.category ?? "none")}</code> ({s.run.findings[0]?.action ?? "none"}). Model called: {s.run.modelCalled ? "yes" : "no"}. Gateway log entries: {s.run.leftBehind.gatewayLogEntries}.</p>
      </div>
    );
  };
  return (
    <section className="card card--lesson" data-testid="pair-card" aria-label="Enforcing versus advisory">
      <p className="kicker">The lesson</p>
      <h2 className="card__title">Same finding, two outcomes: the authority cap</h2>
      <p>The same prompt, the same finding. With the key <strong>advisory</strong> the finding is written to the gateway log and the call goes through; with it <strong>enforcing</strong> the gateway blocks it. The cap, not the inspector, decides.</p>
      {steps && steps.length === 2 ? (
        <div className="pair" data-testid="pair-result">{col(steps[0], "Advisory")}{col(steps[1], "Enforcing")}</div>
      ) : <p className="muted" data-testid="pair-empty">Not run yet.</p>}
      <div className="seg"><button type="button" onClick={onRun} disabled={busy} data-testid="pair-run">{steps ? "Run the pair again" : "Run the pair"}</button></div>
    </section>
  );
}

// Everything one run left: the verdict, the findings, the path, the trace, what it left behind and the raw result.
export default function Result({ last, obs, source }) {
  const top = useRef(null);
  const [pick, setPick] = useState(0);
  const runId = last?.runId;
  useEffect(() => { setPick(0); }, [runId]);
  // On a narrow screen the result sits below the form: bring the verdict into view when a run finishes.
  useEffect(() => { if (runId && top.current && window.matchMedia?.("(max-width: 900px)").matches) top.current.scrollIntoView({ block: "start" }); }, [runId]);
  if (!last) {
    return (
      <Card tone="neutral" kicker="Result" title="No run yet" testId="result-empty">
        <p>Pick a scenario above or press Run on your own key. The verdict (blocked, passed, logged and passed, or a named error) appears here first, then the findings with their categories, the call path, the gateway trace and what the run left behind.</p>
        <GatewayTrace exchanges={[]} source="mock" title="What the gateway did (simulated)" basisNote={BASIS} />
        <RunObservability record={null} source={source} streams={obs?.streams || []} />
      </Card>
    );
  }
  if (last.kind === "live") {
    return (
      <div className="stack" data-testid="result" data-run={runId} ref={top}>
        <RunDetail run={last.result} exchanges={last.trace?.exchanges || []} obs={obs} source={source} kicker="Your run on the live key" showRecord />
        <details className="card card--neutral" data-testid="raw-result"><summary>The raw result</summary><Json value={last.result} label="The raw result" hot={HOT} /></details>
      </div>
    );
  }
  const sc = last.scenario;
  const runSteps = sc.steps.map((s, i) => ({ ...s, i })).filter((s) => s.run);
  const cur = runSteps[Math.min(pick, runSteps.length - 1)];
  const failed = sc.checks.filter((c) => !c.pass);
  return (
    <div className="stack" data-testid="result" data-run={runId} ref={top}>
      <Card tone={sc.ok ? "ok" : "warn"} kicker="Scenario" title={sc.title} testId="scenario-card">
        <p data-testid="expectation" className={sc.ok ? undefined : "field-error"} role={sc.ok ? undefined : "alert"}>
          <Chip state={sc.ok ? "ok" : "bad"}>{sc.ok ? "matches the expectation" : "differs from the expectation"}</Chip>{" "}
          {sc.ok ? `All ${sc.checks.length} expected results hold.` : visible(failed.map((c) => `${c.path}: wanted ${JSON.stringify(c.wanted)}, got ${JSON.stringify(c.actual)}`).join("; "))}
        </p>
        <ol className="stepslist" data-testid="scenario-steps">
          {sc.steps.map((s, i) => {
            const v = s.run ? verdictOf(s.run) : null;
            return (
              <li key={i} data-testid={`step-${i}`}>
                <span className="step-num">{i + 1}</span>{visible(s.label)}
                {s.key && <> <Chip state={s.key.ok ? "info" : "warn"} wrap testId={`step-${i}-key`}>{s.key.ok ? (s.key.replaced ? `replaced ${s.key.replaced}` : "key changed") : `key change refused: ${s.key.refused}`}</Chip></>}
                {v && <> <Chip state={v.state} wrap testId={`step-${i}-verdict`}>{v.chip}</Chip> {v.code && <code>{visible(v.code)}</code>}</>}
              </li>
            );
          })}
        </ol>
        {runSteps.length > 1 && (
          <div className="seg" role="group" aria-label="Show a step in full">
            {runSteps.map((s, k) => <button key={s.i} type="button" aria-pressed={k === pick} onClick={() => setPick(k)} data-testid={`pick-${s.i}`}>Step {s.i + 1} in full</button>)}
          </div>
        )}
      </Card>
      {cur && <RunDetail run={cur.run} exchanges={cur.trace?.exchanges || []} obs={obs} source={source} kicker={`Step ${cur.i + 1}: ${cur.label}`} showRecord />}
      <p className="muted" data-testid="obs-note">In this lab: Agent is the calling app, Privilege is the lab's model of the LLM gateway with its inspector (AI Guard), Resource server is the model. Person, Authorize and Agent gateway have nothing to log here and the panel says so. Times are when the lab computed them. A scenario's record covers all its steps.</p>
      <details className="card card--neutral" data-testid="raw-result"><summary>The raw result</summary><Json value={sc} label="The raw result" hot={HOT} /></details>
    </div>
  );
}
