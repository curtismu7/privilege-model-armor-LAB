# privilege-model-armor-LAB

Demo-tier standalone lab. Step 1 (core) only: inspector engine, guard path, API, tests. **No claim on the board, no repo, no shelf entry, port 7839 is PROVISIONAL.** Fork of ai-guard-sidecar-LAB (see README). Spec: `docs/spec.md`.

- Run `npm start` (127.0.0.1:7839). Test `npm test` (glob `node --test test/*.test.js`). Preflight `npm run doctor`. Reset `npm run reset`. Node 26. Heavy work on the Air: `air-test . -- npm test` (`git add` new files first).
- Layout: `server/src/inspectors.js` (three stub inspectors, finding validation), `keyInspector.js` (one inspector per key, authority, failMode, timeout, patch validation), `guardPath.js` (prompt -> model -> response), `model.js` (kit provider plus lab reply directives), `scenarios.js` (11 scenarios as data), `app.js`, `checks.js` (doctor, one per scenario), `safety.js`, `netguard.js`. `sanitize.js`, `fold.js`, `pii.js` are copied from the source lab.
- Rules that bite: all time is the kit's lab clock; no timers, `Date.now` or randomness in `server/src` (a test enforces it). The three files in `server/src/model-gateway-sim/` are vendored byte-for-byte from `AI-DEMO-Standalone/shared/model-gateway-sim/` and pinned: re-vendor, never edit. `health.js` and `doctor.js` are copies of the shared ones.
- Stub rules are deterministic and say nothing about any vendor's detection quality. Everything beyond the 2026-11-21 release notes is UNVERIFIED (lab model) and says so. Never present a stub category list as the vendor's.
- Malformed findings are always a named error, never a pass, whatever authority and failMode say. A key has at most one inspector. The key has no credential field; Real mode is not built.
- Every scenario needs a test and a doctor check (`checks.js` loops over `SCENARIOS`). Texts leave the lab masked (`safeShow`).
- Loopback bind, Host check 421, same-origin JSON writes, netguard with a self-test. Only `.example` and `.invalid` hosts in shipped text (a test scans).
- No AI attribution in commits or files. Never push, never create a repo from here; the GitHub account is `curtismu7`.
