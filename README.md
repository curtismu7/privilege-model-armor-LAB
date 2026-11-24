# privilege-model-armor-LAB

**Tier: Demo.** Status: step 1 of 3 (core engine and API; no web UI, no Docker yet).

**Fork of ai-guard-sidecar-LAB** (a lab on the guardrail sidecar contract, with a stand-in detector, a mock gateway and a fault injector). This lab keeps from it only `sanitize.js`, `fold.js` and `pii.js` (hidden-character handling and PII patterns with check digits) and the shape of its `/inspect` findings (`category`, `severity`, `location`, `messages`), **as that lab describes it: UNVERIFIED against any product**.

What changed from the source: new app id, name, port (7839, provisional) and license text; its web UI, Docker and k8s files, content pack, shelf entry, sidecar, rules, secrets, workspaces and tests were removed (step 2 adds an adapted web); the engine is new: three stub inspectors (Model Armor, Azure AI Content Safety, Bedrock Guardrails), a key that holds at most one of them with an authority cap and fail-open or fail-closed, a guard path (prompt, model stub, response) with the gateway's own named refusals, and eleven scenarios as data.

## What the lab shows
One **external inspector per key**, and the **authority cap**: `enforcing` blocks on a finding, `advisory` logs the same finding and lets the call through; switching back blocks again. Plus what the key does when the inspector is unreachable or too slow (`failMode` closed or open), and that unreadable findings are a named error, never a pass.

## What is simulated
Everything. The inspectors are lab stubs with deterministic rules: no Google Cloud Model Armor, no Azure AI Content Safety, no Amazon Bedrock Guardrails, no gateway, no LLM provider, no network call (a netguard with a self-test refuses any outbound attempt). **The stub rules say nothing about how any real inspector detects anything.** Only the one-inspector-per-key and authority idea comes from the 2026-11-21 release notes. Everything else is **UNVERIFIED (lab model)**: Model Armor's category names (they follow Google's public overview read 2026-11-24 and need re-checking; Azure and Bedrock names are lab labels), whether the product offers fail-open or fail-closed, the timeout, and what a client receives when blocked.

## Scenarios (data, each with an expected result, each tested and checked by `npm run doctor`)
`clean-prompt-passes`, `injection-blocked-when-enforcing`, `sensitive-data-in-prompt`, `sensitive-data-in-response`, `malicious-url-blocked`, `advisory-logs-then-enforcing-blocks`, `inspector-unreachable-closed-vs-open`, `slow-inspector-times-out`, `malformed-findings-named-error`, `second-inspector-replaces-first`, `two-inspectors-refused`.

## Run
```sh
npm install
npm start            # API at http://127.0.0.1:7839/api/ (loopback only)
npm test             # node --test test/*.test.js (a glob)
npm run doctor       # preflight: every scenario, netguard self-test, an HTTP pass, port free
npm run reset        # POST /api/reset on a running lab
```
Node 26. Heavy work on the Air: `air-test . -- npm test` (`git add` new files first).

API (all under `/api/`): `GET health` (demo-health/1), `GET info`, `POST mode` (`{source}`), `GET scenarios`, `POST scenario/:id` (runs on its own fresh lab), `GET key` and `PUT key` (`inspector` or `inspectors`, `authority`, `failMode`, `timeoutMs`, `inspectorState` as a lab fault injector), `POST run` (`{prompt}`), `POST reset`. The key has no credential field and any such field in a request is refused.

## Port
**7839 is PROVISIONAL and not claimed yet** (the board, the shelf registry and the lab proxy do not know this lab). `PORT` overrides it for local use. The real port comes from `npm run ports -- --next` in demo-shelf-LAB when the owner claims it.

## Mock and Real
Mock only. `GET /api/info` reports `source: "mock"`, `realAvailable: false` with the reason; `POST /api/mode` to `real` or `live` is answered 409 with that reason. Real would be owner-run and read-only, needs a tenant running the 2026-11-21 release and a Google Cloud project, and is not built.

## What the later steps add
Step 2: the web UI (banner, scenario picker, key panel, GatewayTrace, JsonPane, Mock/Real toggle, presenter mode, diagram loaded by name). Step 3: Docker and the rest of the ship checklist. See `docs/spec.md`.

## Observability
Nothing here is logged by a product. The run log and the gateway log are in memory and cleared by Reset; each run says what it left behind (log entries, tokens spent, model requests).
