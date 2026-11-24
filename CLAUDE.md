# privilege-model-armor-LAB

Demo-tier standalone lab. Step 2 (web): inspector engine, guard path, API, web UI, presenter mode, talk track, content pack, Docker. **The repo exists (curtismu7/privilege-model-armor-LAB) and port 7846 is claimed provisionally; the board, the shelf registry, the lab proxy and any release do not know it yet (step 3, owner-gated).** Fork of ai-guard-sidecar-LAB (see README). Spec: `docs/spec.md`.

- Run `npm run build && npm start` (127.0.0.1:7846). Test `npm test` (server glob `node --test test/*.test.js`, web vitest, `scripts/*.test.mjs`). Preflight `npm run doctor`. Reset `npm run reset`. Docker: `docker compose up --build -d` (OrbStack). Node 26. Heavy work on the Air: `air-test . -- npm test` (`git add` new files first; use a unique worktree folder name).
- Layout: `server/src/inspectors.js` (three stub inspectors, finding validation), `keyInspector.js` (one inspector per key, authority, failMode, timeout, patch validation), `guardPath.js` (prompt -> model -> response), `model.js` (kit provider plus lab reply directives), `scenarios.js` (11 scenarios as data), `app.js`, `checks.js` (doctor, one per scenario), `safety.js`, `netguard.js`. `sanitize.js`, `fold.js`, `pii.js` are copied from the source lab. Web era: `workspaces.js` (rule 13, bounded, least recently used forgotten), `stories.js`/`cast.js`/`customer.js`/`talkTrack.js` (stories as data under `server/src/data`, `docs/talk-track.md`), `diagramData.js` (loads `server/diagrams/model-armor-inspector.json` by name), `runObs.js`/`runTrace.js` (run-observability events and the GatewayTrace exchanges), `web/` (React + Vite, vendored shared components).
- Rules that bite: all time is the kit's lab clock; no timers, `Date.now` or randomness in the engine (a test enforces it; only `app.js` and `runObs.js` stamp wall-clock instants on a run's log lines, through an injected `now`). The three files in `server/src/model-gateway-sim/` are vendored byte-for-byte from `AI-DEMO-Standalone/shared/model-gateway-sim/` and pinned: re-vendor, never edit. `health.js` and `doctor.js` are copies of the shared ones.
- Stub rules are deterministic and say nothing about any vendor's detection quality. Everything beyond the 2026-11-21 release notes is UNVERIFIED (lab model) and says so. Never present a stub category list as the vendor's.
- Malformed findings are always a named error, never a pass, whatever authority and failMode say. A key has at most one inspector. The key has no credential field; Real mode is not built.
- Every scenario needs a test and a doctor check (`checks.js` loops over `SCENARIOS`). Texts leave the lab masked (`safeShow`).
- Loopback bind, Host check 421, same-origin JSON writes, netguard with a self-test. Only `.example` and `.invalid` hosts in shipped text (a test scans).
- No AI attribution in commits or files. Never push, never create a repo from here; the GitHub account is `curtismu7`.
- Vendored byte for byte and pinned (re-vendor from `AI-DEMO-Standalone/shared/`, never edit): `web/src/{top-menu,floating-dialog,diagram-kit,gateway-trace,run-observability}`, `web/src/components/JsonPane*`, `web/src/standalone-ui.css` (`scripts/check-ui-standard.sh`), `server/src/{gatewayTrace,runObservability}.js`, `scripts/run-observability-checkPin.mjs`. The diagram JSON is a byte export of `MODEL_ARMOR_INSPECTOR_FLOW` from diagram-studio-LAB (pinned in `server/diagrams/diagrams.sha256`).

## Never-repeat lessons
- A Dockerfile COPY source must not be excluded by `.dockerignore`: a compose test checks the pattern, only a real OrbStack build proves it (the talk track is re-included with `!docs/talk-track.md` after `docs/*`).
- The first story and talk-track load sends no `vertical` (a default would turn "none" into retail and hide the customer's vertical and cast).
- Reset, a mode switch and a vertical change clear the `#inspector/<scenario>` hash; a page runs a hash scenario only on a deliberate navigation (a link, Show it), never on a remount.
- Pressing the active Mock button changes nothing: no request, no reload, the open result stays.
- The workspace-id pattern is the same on the client and the server (a test compares them), and the random-id fallback fills the typed array in place (`map()` leaves it zero).
- `npm run reset` takes a workspace id (a browser tab's is `w-<16 hex>`) and clears that one workspace only; Reset of a workspace the server has never seen creates nothing, so it cannot evict another.
- The netguard allows the lookup of a literal IP address (listen() on an opted-in `PMA_BIND` does one); a name is still refused and connecting to the IP is still refused.
- Every detection stub normalises text first (`normalizeForDetection`), the URL stub too: a zero-width character must not hide a bad host.
- Shortcut keys ignore modifiers, key repeats and focused controls.
- Static scans skip `.github/` workflow files and the shared attribution script, and vendored files are exempt from the host scan only because each is pinned.
- Index handles SIGTERM and SIGINT (close, exit 0) so `docker stop` is not a 10 s wait; the start-up line prints the port really bound.
- Before claiming a port check running containers and compose files (`docker ps`; the ap-* labs use 7839 to 7843), not only the registry and the board. This lab's port is 7846.
- customer.config problems are never fatal, but they are logged at start-up and shown on the Stories page.
