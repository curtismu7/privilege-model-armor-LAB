// The diagram is diagram-studio/1 DATA (server/diagrams/model-armor-inspector.json), loaded BY NAME and checked with the studio's own validator copy
// (diagramStudioValidate.js). Nothing here builds a node or an edge by hand: the page draws exactly the boxes and arrows the file lists.
// The file is a byte copy of MODEL_ARMOR_INSPECTOR_FLOW from diagram-studio-LAB (see server/diagrams/diagrams.sha256 for the source commit).
// Each step walks its arrows in order; the page's Simulate steps through them one arrow at a time.
import fs from 'node:fs';
import { fillDeep } from './cast.js';
import { validateDiagram } from './diagramStudioValidate.js';

// (HERE is a variable on purpose: Vite rewrites a literal `new URL('./x', import.meta.url)` into an asset URL, which would break the web tests that load this module.)
const HERE = import.meta.url;
const DIR = new URL('../diagrams/', HERE);
export const DIAGRAM_NAMES = Object.freeze(['model-armor-inspector']);
export const diagramProblems = (doc) => validateDiagram(doc);

function load(name) {
  const doc = JSON.parse(fs.readFileSync(new URL(`${name}.json`, DIR), 'utf8'));
  const problems = diagramProblems(doc);
  if (problems.length) throw new Error(`diagram ${name} is not valid diagram-studio/1: ${problems.join('; ')}`);
  return doc;
}
const DOCS = Object.freeze(Object.fromEntries(DIAGRAM_NAMES.map((n) => [n, load(n)])));
export const rawDiagram = (name) => (typeof name === 'string' && Object.hasOwn(DOCS, name) ? DOCS[name] : null);
export const hasDiagram = (name) => rawDiagram(name) !== null;

// The data numbers its arrow labels itself ("1 request", "3a finding ..."); the page numbers the arrows in walk order. The number is stripped only when EVERY
// label of the diagram follows that convention, and only the numbering prefix (digits, an optional letter, a space), so a label such as "100 requests" in another
// diagram keeps its own words.
const NUMBERING = /^\d+[a-z]?\s+/;

// The shape the page reads: { name, title, intro, nodes: [{id, label, kind, x, y}], steps: [{from, to, label, title, say}] } (one step per arrow).
export function buildDiagram(cast, name) {
  const d = fillDeep(DOCS[name], cast);
  const numbered = d.edges.every((e) => NUMBERING.test(e.label || ''));
  return {
    name: d.id,
    title: d.title,
    intro: d.lede,
    nodes: d.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.group, x: n.x, y: n.y })),
    steps: d.steps.flatMap((s) => s.edges.map((i) => {
      const e = d.edges[i];
      const label = e.label || s.title;
      return { from: e.source, to: e.target, label: numbered && e.label ? label.replace(NUMBERING, '') : label, title: s.title, say: [s.what, s.why].filter(Boolean).join(' ') };
    })),
  };
}
