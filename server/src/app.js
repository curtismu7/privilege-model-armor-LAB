// The Express API. Everything under /api/. No static files yet (the web UI is a later step).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { BANNER, NOT_REAL } from './banner.js';
import { BOUNDS } from './bounds.js';
import { runChecks as defaultChecks } from './checks.js';
import { allPassed } from './doctor.js';
import { LabError, invalidRequest } from './errors.js';
import { runGuard } from './guardPath.js';
import { createHealth } from './health.js';
import { INSPECTOR_STATES, describeInspectors } from './inspectors.js';
import { AUTHORITIES, FAIL_MODES, validateKeyPatch } from './keyInspector.js';
import { REPLY_NAMES } from './model.js';
import { jsonWritesOnly, makeHostCheck, sameOriginWrites } from './safety.js';
import { SCENARIOS, describeScenarios, findScenario, runScenario } from './scenarios.js';
import { createLab } from './state.js';

const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));

export function createApp({ env = process.env, runChecks = () => defaultChecks(env) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(makeHostCheck(env));
  app.use(sameOriginWrites);
  app.use(jsonWritesOnly);
  app.use(express.json({ limit: BOUNDS.maxBodyBytes, strict: true }));

  let lab = createLab();

  const health = createHealth({ demoId: 'privilege-model-armor-lab', demoName: 'Privilege Model Armor LAB', version, runChecks, allPassed, mockOnly: () => true });
  app.use('/api/health', health.router);

  app.get('/api/info', (_req, res) => {
    res.json({
      app: 'privilege-model-armor-lab', version, tier: 'Demo',
      source: 'mock', mode: 'mock', realAvailable: false, realReason: NOT_REAL,
      banner: BANNER, inspectors: describeInspectors(), authorities: AUTHORITIES, failModes: FAIL_MODES, inspectorStates: INSPECTOR_STATES,
      modelReplyDirectives: REPLY_NAMES, bounds: BOUNDS, scenarios: SCENARIOS.map((s) => s.id), runsSinceReset: lab.runs.length, labClockMs: lab.clock.now(),
    });
  });

  app.post('/api/mode', (req, res) => {
    const body = req.body;
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    if (keys.length !== 1 || keys[0] !== 'source' || typeof body.source !== 'string') {
      return res.status(400).json({ error: 'bad_request', message: 'send exactly { "source": "mock" } or { "source": "real" }' });
    }
    if (body.source === 'mock') return res.json({ source: 'mock', realAvailable: false });
    if (body.source === 'real' || body.source === 'live') return res.status(409).json({ error: 'real_not_available', message: NOT_REAL });
    return res.status(400).json({ error: 'bad_request', message: 'source must be "mock" or "real"' });
  });

  app.get('/api/scenarios', (_req, res) => res.json({ banner: BANNER, scenarios: describeScenarios() }));

  // A scenario runs on its own fresh lab: the live key below is never touched by it.
  app.post('/api/scenario/:id', (req, res) => {
    if (!findScenario(req.params.id)) return res.status(404).json({ error: 'unknown_scenario', message: 'no such scenario' });
    res.json(runScenario(req.params.id));
  });

  app.get('/api/key', (_req, res) => res.json(lab.keyInspector.view()));
  app.put('/api/key', (req, res) => {
    const { replaced, view } = lab.keyInspector.configure(validateKeyPatch(req.body));
    res.json({ ...view, replaced });
  });

  app.post('/api/run', (req, res) => {
    const b = req.body;
    const keys = b && typeof b === 'object' && !Array.isArray(b) ? Object.keys(b) : null;
    if (!keys || keys.length !== 1 || keys[0] !== 'prompt') throw invalidRequest('send exactly { "prompt": "..." }');
    const out = runGuard(lab, { prompt: b.prompt });
    lab.record(out);
    res.json(out);
  });

  app.post('/api/reset', (_req, res) => {
    const cleared = lab.runs.length + lab.gatewayLog.length;
    lab = createLab();
    res.json({ reset: 'ok', cleared });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'no such endpoint' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof LabError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'the body is not valid JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: `the body is over ${BOUNDS.maxBodyBytes} bytes` });
    return res.status(500).json({ error: 'internal_error', message: 'something went wrong in the lab' });
  });

  app.locals.health = health;
  return app;
}

export function startHttpServer({ port, host, app }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const a = server.address();
      resolve({ server, url: `http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}/` });
    });
    server.once('error', reject);
  });
}
