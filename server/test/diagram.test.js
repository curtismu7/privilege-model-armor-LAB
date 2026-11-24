import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DIAGRAM_NAMES, buildDiagram, hasDiagram, rawDiagram, diagramProblems } from '../src/diagramData.js';
import { castFor } from '../src/cast.js';
import { startLab } from './helpers.js';

const dir = new URL('../diagrams/', import.meta.url);

test('the diagram is diagram-studio/1 data, loaded by name, valid under the studio\'s own checks, and its file matches the pin', () => {
  assert.deepEqual(DIAGRAM_NAMES, ['model-armor-inspector']);
  const doc = rawDiagram('model-armor-inspector');
  assert.deepEqual(diagramProblems(doc), []);
  assert.equal(doc.schema, 'diagram-studio/1'); assert.equal(doc.id, 'model-armor-inspector');
  const pin = fs.readFileSync(new URL('diagrams.sha256', dir), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  assert.deepEqual(pin.map(([, f]) => f), ['model-armor-inspector.json']);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('model-armor-inspector.json', dir))).digest('hex'), pin[0][0], 'the data file was edited: re-export it from diagram-studio and re-pin');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['diagrams.sha256', 'model-armor-inspector.json'], 'no other diagram file hides here');
});

test('the shape the page reads has one step per arrow, in the data\'s order, with the boxes\' own positions', () => {
  const d = buildDiagram(castFor('retail'), 'model-armor-inspector');
  const raw = rawDiagram('model-armor-inspector');
  assert.equal(d.steps.length, raw.steps.flatMap((s) => s.edges).length);
  assert.deepEqual(d.nodes.map((n) => [n.id, n.x, n.y]), raw.nodes.map((n) => [n.id, n.x, n.y]));
  for (const s of d.steps) assert.ok(d.nodes.some((n) => n.id === s.from) && d.nodes.some((n) => n.id === s.to));
  assert.ok(d.steps.every((s) => s.label && s.title && s.say));
  assert.ok(d.steps.every((s) => !/^\d/.test(s.label)), 'the page numbers the arrows, so a label carries no number of its own');
  assert.equal(d.steps[0].label, 'request');
  assert.equal(d.nodes.length, 5);
});

test('the diagram text keeps the honesty: sourced claim stated, the rest labelled lab model or UNVERIFIED', () => {
  const text = JSON.stringify(rawDiagram('model-armor-inspector'));
  assert.match(text, /release notes/); assert.match(text, /UNVERIFIED/); assert.match(text, /lab model/i);
  assert.doesNotMatch(text, /detects? (more|better|every|all)|catch(es)? (all|every)|accura/i, 'no claim that an inspector detects anything in particular');
  assert.match(text, /no claim about detection quality/, 'the data says so itself');
});

test('GET /api/diagram by name; default name; an unknown name is a 404 and never reads a path; a bad vertical is a 400', async () => {
  const lab = await startLab();
  try {
    const a = (await lab.get('/api/diagram?name=model-armor-inspector')).json;
    assert.equal(a.name, 'model-armor-inspector'); assert.equal(a.steps.length, 4);
    assert.equal((await lab.get('/api/diagram')).json.name, 'model-armor-inspector');
    for (const bad of ['nope', '../package', '..%2Fpackage', 'model-armor-inspector.json', '__proto__', 'constructor']) {
      const r = await lab.get(`/api/diagram?name=${bad}`);
      assert.deepEqual([r.status, r.json.error], [404, 'unknown_diagram'], bad);
    }
    assert.equal((await lab.get('/api/diagram?name[]=x')).status, 404);
    assert.equal((await lab.get('/api/diagram?vertical=nope')).status, 400);
    assert.equal(hasDiagram('toString'), false);
  } finally { await lab.close(); }
});

test('only the step-numbering prefix is stripped from an arrow label, and only when every label of the diagram carries one', () => {
  const doc = rawDiagram('model-armor-inspector');
  assert.ok(doc.edges.every((e) => /^\d+[a-z]?\s+/.test(e.label)));
  const d = buildDiagram(castFor('retail'), 'model-armor-inspector');
  assert.deepEqual(d.steps.map((s) => s.label), doc.steps.flatMap((s) => s.edges).map((i) => doc.edges[i].label.replace(/^\d+[a-z]?\s+/, '')));
});
