// The inspector setting of ONE LLM key. A key has AT MOST ONE external inspector: selecting another replaces it, and configuring two at once is refused.
//   authority: 'enforcing' (a finding blocks the call) or 'advisory' (the authority cap: the same finding is logged and the call goes through).
//   failMode:  'closed' (inspector unreachable or timed out -> the call is blocked) or 'open' (-> the call goes through). UNVERIFIED which of the two the
//              product offers; the lab shows both as two configurations.
//   timeoutMs: how long the gateway waits for the inspector, on the lab clock. UNVERIFIED: the value and whether it is settable.
// The key has no credential field: the stub inspectors need none, and a real Model Armor credential would be write-only (Real mode is not built).
import { BOUNDS } from './bounds.js';
import { INSPECTOR_IDS, INSPECTOR_STATES, createInspector } from './inspectors.js';
import { invalidKeyConfig, twoInspectors } from './errors.js';
import { noUnknown, num, objectOf, oneOf } from './validate.js';

export const AUTHORITIES = ['enforcing', 'advisory'];
export const FAIL_MODES = ['closed', 'open'];
export const DEFAULT_KEY = Object.freeze({ inspector: 'model-armor', authority: 'enforcing', failMode: 'closed', timeoutMs: BOUNDS.defaultTimeoutMs });
const FIELDS = ['inspector', 'inspectors', 'authority', 'failMode', 'timeoutMs', 'inspectorState'];

// Validates a PUT /api/key body into a patch. Nothing is applied here and nothing is half-applied: a refusal changes nothing.
export function validateKeyPatch(body) {
  const b = objectOf(body, 'key', invalidKeyConfig);
  noUnknown(b, FIELDS, 'key', invalidKeyConfig); // also refuses __proto__, constructor and any credential-like field
  if (!Object.keys(b).length) throw invalidKeyConfig('send at least one of: inspector, authority, failMode, timeoutMs, inspectorState');
  const patch = {};
  if (Object.hasOwn(b, 'inspector') && Object.hasOwn(b, 'inspectors')) throw invalidKeyConfig('send inspector or inspectors, not both');
  const id = (v) => {
    if (typeof v !== 'string' || !INSPECTOR_IDS.includes(v)) throw invalidKeyConfig(`inspector must be one of ${INSPECTOR_IDS.join(', ')} (or null for none)`);
    return v;
  };
  if (Object.hasOwn(b, 'inspector')) patch.inspector = b.inspector === null ? null : id(b.inspector);
  if (Object.hasOwn(b, 'inspectors')) {
    if (!Array.isArray(b.inspectors)) throw invalidKeyConfig('inspectors must be a list');
    if (b.inspectors.length > BOUNDS.maxInspectorsListed) throw invalidKeyConfig(`inspectors lists at most ${BOUNDS.maxInspectorsListed}`);
    if (b.inspectors.length > 1) throw twoInspectors();
    patch.inspector = b.inspectors.length ? id(b.inspectors[0]) : null;
  }
  patch.authority = oneOf(b, 'authority', 'key', AUTHORITIES, { optional: true });
  patch.failMode = oneOf(b, 'failMode', 'key', FAIL_MODES, { optional: true });
  patch.inspectorState = oneOf(b, 'inspectorState', 'key', INSPECTOR_STATES, { optional: true });
  patch.timeoutMs = num(b, 'timeoutMs', 'key', { min: BOUNDS.minTimeoutMs, max: BOUNDS.maxTimeoutMs, int: true, optional: true });
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
  return patch;
}

export function createKeyInspector() {
  let cfg = { ...DEFAULT_KEY };
  let current = createInspector(cfg.inspector);

  const view = () => ({
    inspector: current ? current.id : null,
    inspectorInfo: current ? { id: current.id, label: current.label, vendor: current.vendor, categories: [...current.categories], unverified: current.unverified } : null,
    inspectorState: current ? current.getState() : null,
    authority: cfg.authority,
    failMode: cfg.failMode,
    timeoutMs: cfg.timeoutMs,
    oneInspectorPerKey: true,
  });

  return {
    view,
    get inspector() { return current; },
    get authority() { return cfg.authority; },
    get failMode() { return cfg.failMode; },
    get timeoutMs() { return cfg.timeoutMs; },
    // `patch` comes from validateKeyPatch. Returns { replaced, view }: `replaced` is the inspector that was on the key before and is no longer.
    configure(patch) {
      const { inspector, inspectorState, ...rest } = patch;
      if (inspectorState !== undefined && (inspector === null || (inspector === undefined && !current))) throw invalidKeyConfig('there is no inspector on the key to set a state on');
      let replaced = null;
      let next = current;
      if (inspector !== undefined && inspector !== (current ? current.id : null)) {
        replaced = current ? current.id : null;
        next = inspector === null ? null : createInspector(inspector); // a newly selected inspector starts healthy
      }
      if (next && inspectorState !== undefined) next.setState(inspectorState);
      current = next;
      cfg = { ...cfg, ...rest };
      return { replaced, view: view() };
    },
    reset() { cfg = { ...DEFAULT_KEY }; current = createInspector(cfg.inspector); },
  };
}
