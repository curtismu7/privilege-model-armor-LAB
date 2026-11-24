# privilege-model-armor-LAB spec (one page)

**Status:** step 2 (the engine and API of step 1, plus the web UI, presenter mode, talk track, content pack and Docker)   **Owner:** Curtis Muir (decides)   **Tier:** Demo   **Source:** the 2026-11-21 vendor release notes, the only source so far. Everything they do not say is **UNVERIFIED (lab model)** and the lab says so. Derived from "Lab 3" of `AI-DEMO-Standalone/docs/specs/2026-11-24-model-gateway-labs.md`. Fork of ai-guard-sidecar-LAB (see README).

## Goal
Show one external inspector per LLM key (Model Armor, with Azure AI Content Safety and Bedrock Guardrails as stub alternatives), the **authority cap** that holds it advisory, and what the key does when the inspector is unreachable or slow. All stubs: no vendor is called and no claim is made about any vendor's detection quality.

## What the release notes say (the only verified part)
A key can use an external inspector (Model Armor in AI Guard); an authority setting caps whether its findings enforce or only advise. Nothing more is taken as fact.

## Acceptance criteria (each is a test and a `npm run doctor` check, all on the lab clock)
1. **clean-prompt-passes**: no finding, the model answers; the trace shows inspect-prompt, model, inspect-response (80 + 400 + 80 ms).
2. **injection-blocked-when-enforcing**: finding `prompt_injection_jailbreak`; the gateway's OWN refusal `blocked_by_inspector` (403, origin gateway); the model is not called, no tokens spent.
3. **sensitive-data-in-prompt**: finding `sensitive_data`, blocked, the number masked everywhere it is shown.
4. **sensitive-data-in-response**: the prompt is clean, the model stub (told by a lab directive) answers with a card number; the response is withheld and the tokens are already spent.
5. **malicious-url-blocked**: a link to a stub-list host (`.invalid`) gives `malicious_url`, blocked.
6. **advisory-logs-then-enforcing-blocks**: authority `advisory`: the same finding is LOGGED and the call goes through; back to `enforcing`: blocked again.
7. **inspector-unreachable-closed-vs-open**: failMode `closed` blocks even a clean prompt (`inspector_unavailable` 503); `open` lets it through and the gateway log says `failed_open`.
8. **slow-inspector-times-out**: the stub answers in 800 ms, the key waits 500 ms (lab clock): `inspector_timeout` (504) when closed, `failed_open` when open, whatever the prompt holds.
9. **malformed-findings-named-error**: unreadable findings give the named error `inspector_malformed_findings` (502), the model is not called, and neither failMode `open` nor authority `advisory` turns it into a pass.
10. **second-inspector-replaces-first**: selecting another inspector replaces the first (`replaced: model-armor`); the same prompt now returns the second stub's own category.
11. **two-inspectors-refused**: `inspectors: [a, b]` is refused with `two_inspectors` and the key is unchanged.

## Unhappy paths (each has a test)
- Oversized prompt (over 20000 characters, the kit provider's limit): `prompt_too_large` 413 before any inspection; non-string, empty or extra-field run bodies: `invalid_request`.
- Key config: unknown fields (including `__proto__`, `constructor` and any credential-like field), bad authority, failMode, timeout (50 to 10000 ms, whole numbers) or inspector id, a state with no inspector: `invalid_key_config`; a refused request changes nothing.
- Inspector findings are validated (object, list of at most 50, known category, severity low/medium/high, short message list): anything else is the named malformed error.
- API: bad Host 421, cross-origin write 403, non-JSON write 415, body over 64 KB 413, `POST /api/mode` to real or live refused with a plain message. Texts shown are masked and inert; no credential field exists on the key or in any response.

## UNVERIFIED (lab model)
Model Armor's category names follow Google's public overview read 2026-11-24 (prompt injection and jailbreak, sensitive data, harmful content, malicious URL; the overview lists more, not modelled) and are to be re-checked. Azure and Bedrock category names are lab labels. Whether the product offers fail-open or fail-closed (the overview says nothing), the timeout and whether it is settable, the status codes and bodies a client receives, whether a response is inspected as well as a prompt, and the finding shape (as the source lab describes its `/inspect`).

## Out of scope
Calling Model Armor, Azure or Bedrock; Real mode (owner-run, needs a tenant on the 2026-11-21 release and a Google Cloud project; the toggle stays disabled with that reason); any outbound call. Later step (3, owner-gated): the shelf registry entry, lab-proxy route, submodule pin, release and the port claim (7839 is provisional; `docs/shelf-entry.json` carries a placeholder catalog id).

## Protected / must not break
Loopback-only bind, Host check, same-origin writes, netguard (zero outbound), the vendored kit byte-for-byte (pin test), the banner.

## Verification plan
`air-test . -- npm test` (Node 26); one test per scenario; mutation check of each core rule; `npm run doctor`; pin test; history scan 0 and gitleaks clean. No deploy or publish in this step.

## Step 2 acceptance (web)
Four pages (Inspector, Diagram, Stories and talk track, Limits), each with the simulation banner first and the Mock/Real toggle in the header (Real disabled with the plain `realReason`; the header shows the mode). The Inspector page shows the verdict first (blocked with the gateway's own named refusal, passed, logged-but-passed in advisory, or a named error), the findings with their categories (Model Armor's labelled UNVERIFIED), the call path through GatewayTrace over `run.hops`, what the run left behind (from `leftBehind` and the run-observability panel) and the enforcing-versus-advisory pair as the page's main lesson. The diagram `model-armor-inspector` is loaded by name from diagram-studio data (movable boxes, Simulate, speed, Reset restores positions). Stories are data with `{{cast}}` tokens in three vertical packs (a test fails on an undefined token), the talk track is `docs/talk-track.md`, and `customer.config.json` (rule 12) and a workspace id (rule 13) apply. Usable at 375 px in dark and light. Docker publishes `127.0.0.1:7839` only, non-root, read-only, with a healthcheck. Unhappy paths in the page: an empty or over-limit prompt, a key patch the server refuses (its message is shown), a server that is down (named, with a retry), a diagram the server cannot give.
