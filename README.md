# privilege-model-armor-LAB

**Tier: Demo.** Status: step 2 of 3 (engine, API, web UI, presenter mode, talk track, content pack and Docker; the shelf entry file is written, the registry, proxy and release are step 3). Repo: https://github.com/curtismu7/privilege-model-armor-LAB.

**Fork of ai-guard-sidecar-LAB** (a lab on the guardrail sidecar contract, with a stand-in detector, a mock gateway and a fault injector). This lab keeps from it only `sanitize.js`, `fold.js` and `pii.js` (hidden-character handling and PII patterns with check digits) and the shape of its `/inspect` findings (`category`, `severity`, `location`, `messages`), **as that lab describes it: UNVERIFIED against any product**.

What changed from the source: new app id, name, port (7846, provisional) and license text; its sidecar, rules, secrets and tests were removed, and its web UI, Docker files, content pack, shelf entry and workspaces were replaced by new ones for this lab (the page layout follows the family UI standard; no identifier, test or story of the source is kept); the engine is new: three stub inspectors (Model Armor, Azure AI Content Safety, Bedrock Guardrails), a key that holds at most one of them with an authority cap and fail-open or fail-closed, a guard path (prompt, model stub, response) with the gateway's own named refusals, and eleven scenarios as data.

## What the lab shows
One **external inspector per key**, and the **authority cap**: `enforcing` blocks on a finding, `advisory` logs the same finding and lets the call through; switching back blocks again. Plus what the key does when the inspector is unreachable or too slow (`failMode` closed or open), and that unreadable findings are a named error, never a pass.

## What is simulated
Everything. The inspectors are lab stubs with deterministic rules: no Google Cloud Model Armor, no Azure AI Content Safety, no Amazon Bedrock Guardrails, no gateway, no LLM provider, no network call (a netguard with a self-test refuses any outbound attempt). **The stub rules say nothing about how any real inspector detects anything.** Only the one-inspector-per-key and authority idea comes from the 2026-11-21 release notes. Everything else is **UNVERIFIED (lab model)**: Model Armor's category names (they follow Google's public overview read 2026-11-24 and need re-checking; Azure and Bedrock names are lab labels), whether the product offers fail-open or fail-closed, the timeout, and what a client receives when blocked.

## Scenarios (data, each with an expected result, each tested and checked by `npm run doctor`)
`clean-prompt-passes`, `injection-blocked-when-enforcing`, `sensitive-data-in-prompt`, `sensitive-data-in-response`, `malicious-url-blocked`, `advisory-logs-then-enforcing-blocks`, `inspector-unreachable-closed-vs-open`, `slow-inspector-times-out`, `malformed-findings-named-error`, `second-inspector-replaces-first`, `two-inspectors-refused`.

## Run
```sh
npm install
npm run build        # the web page, into web/dist (the API serves it)
npm start            # http://127.0.0.1:7846/ (page) and /api/ (loopback only)
./scripts/run.sh     # install, build, doctor and start in one go
npm test             # server (node --test), web (vitest) and the repo scripts
npm run doctor       # preflight: every scenario, stories, diagram, netguard self-test, an HTTP pass, port free
npm run reset        # POST /api/reset on a running lab
npm run content-pack # rebuild and validate content-pack.json (Learning Hub)
```
Docker (OrbStack): `HOST_PORT=7846 docker compose up --build -d` then http://127.0.0.1:7846 (published on loopback only; the image runs as the non-root `node` user with a read-only file system and no capabilities).
Branding (rule 12): copy `customer.config.example.json` to `customer.config.json` (git-ignored). Host-run it is read from beside `package.json`; in Docker the root file system is read-only, so mount it by uncommenting the `volumes` lines in `docker-compose.yml` (`./customer.config.json:/app/customer.config.json:ro`).
Node 26. Heavy work on the Air: `air-test . -- npm test` (`git add` new files first).

API (all under `/api/`): `GET health` (demo-health/1), `GET info`, `POST mode` (`{source}`), `GET scenarios`, `POST scenario/:id` (runs on its own fresh lab), `GET key` and `PUT key` (`inspector` or `inspectors`, `authority`, `failMode`, `timeoutMs`, `inspectorState` as a lab fault injector), `POST run` (`{prompt}`), `POST reset`, `GET story` and `GET diagram?name=` (stories, talk track and the diagram), `GET run-observability`, `GET log`. A run answers with its `trace` (the exchanges the page draws with GatewayTrace). Every call belongs to a workspace (`X-Workspace`, default `default`; the number of workspaces is bounded and the least recently used is forgotten). The key has no credential field and any such field in a request is refused.

## The page
Four pages, each with the simulation banner first and a Mock / Real toggle in the header (Real is disabled with the plain reason): **Inspector** (the lesson pair, the 11 scenarios, the key panel, your own prompt, then the verdict, findings with categories, the call path, GatewayTrace, what the run left behind and the raw JSON), **Diagram** (`model-armor-inspector` loaded by name from diagram-studio data, movable boxes, Simulate, speed, Reset), **Stories and talk track** (11 stories as data with `{{cast}}` tokens, three vertical packs, `docs/talk-track.md`) and **Limits (UNVERIFIED)**. Presenter mode: the header button or the P key.

## Port
**7846 is claimed provisionally** for this lab (the repo exists) (7839 to 7843 belong to the ap-* labs), but the board, the shelf registry and the lab proxy do not know it yet. `PORT` overrides it for local use. The real port and the catalog id come from the owner's claim step (`npm run ports -- --next` in demo-shelf-LAB); `docs/shelf-entry.json` carries a placeholder catalog id.

## Mock and Real
Mock only. `GET /api/info` reports `source: "mock"`, `realAvailable: false` with the reason; `POST /api/mode` to `real` or `live` is answered 409 with that reason. Real would be owner-run and read-only, needs a tenant running the 2026-11-21 release and a Google Cloud project, and is not built.

## What step 3 adds
The rest of the ship checklist (owner-gated): the shelf registry entry, the lab-proxy route, the submodule pin and a release. Story mode is out of scope. See `docs/spec.md`.

## Observability
Nothing here is logged by a product. The run log and the gateway log are in memory and cleared by Reset (per workspace); each run says what it left behind (log entries, tokens spent, model requests). Rule 27: every run also writes one line per decision to **stdout** (`docker logs`): `<time> privilege-model-armor-lab decision step= actor= result=passed|stopped|unclear run=`, never a prompt or a finding's text, and the page's "What this run left behind" lists the same events as simulated rows (time = when the lab computed it). A collector could ship the stdout lines to a log index; this lab does not, and it reads no log. Whether the Privilege gateway logs an inspector's finding, and how, is UNVERIFIED.
