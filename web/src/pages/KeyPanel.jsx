import { visible } from "../safeText";
import { Chip } from "../components/Bits.jsx";
import { AUTHORITY_TEXT, FAIL_TEXT, STATE_TEXT } from "../fmt";

// What the key setting can say, checked in the page next to the field. The server checks again and has the last word (its message is shown).
export function keyProblems(draft, bounds) {
  const out = [];
  const t = draft.timeoutMs;
  if (!Number.isInteger(t) || t < bounds.minTimeoutMs || t > bounds.maxTimeoutMs) out.push(`Timeout is a whole number from ${bounds.minTimeoutMs} to ${bounds.maxTimeoutMs} ms.`);
  return out;
}

// The patch for PUT /api/key from the form. A fault state is only sent when the key has an inspector to put it on.
export function patchFor(draft) {
  const patch = { inspector: draft.inspector || null, authority: draft.authority, failMode: draft.failMode, timeoutMs: draft.timeoutMs };
  if (draft.inspector) patch.inspectorState = draft.inspectorState;
  return patch;
}

const Pick = ({ id, label, options, value, onChange, text, testId }) => (
  <fieldset className="fieldset keyfield" data-testid={testId}>
    <legend>{label}</legend>
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)} data-testid={`${testId}-${o}`}>{o}</button>)}
    </div>
    <p className="muted" data-testid={`${testId}-text`}>{text[value]}</p>
  </fieldset>
);

// The key's one external inspector: the choice (a second one REPLACES the first; the form can only pick one), the authority cap, what the key does when the inspector
// is unavailable, the timeout, and a fault injector for the inspector (a lab control, not a product setting).
export default function KeyPanel({ view, info, draft, setDraft, onSave, saving, saveError, notice, dirty }) {
  const bounds = info.bounds;
  const problems = keyProblems(draft, bounds);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const picked = info.inspectors.find((i) => i.id === draft.inspector);
  return (
    <section className="card" data-testid="key-panel" aria-label="The key's inspector setting">
      <p className="kicker">The key</p>
      <h2 className="card__title">One external inspector, its authority and its failure mode</h2>
      <p className="muted">A key has one inspector. Choosing another replaces the first. The key holds no credential in this lab.</p>

      <fieldset className="fieldset keyfield" data-testid="key-inspector">
        <legend>Inspector</legend>
        <div className="seg" role="group" aria-label="Inspector">
          {info.inspectors.map((i) => <button key={i.id} type="button" aria-pressed={draft.inspector === i.id} onClick={() => set({ inspector: i.id, inspectorState: draft.inspector === i.id ? draft.inspectorState : "healthy" })} data-testid={`key-inspector-${i.id}`}>{visible(i.label)}</button>)}
          <button type="button" aria-pressed={!draft.inspector} onClick={() => set({ inspector: "" })} data-testid="key-inspector-none">No inspector</button>
        </div>
        {picked ? (
          <p className="muted" data-testid="key-categories">Categories the stub can return: {picked.categories.map((c, i) => <span key={c}>{i > 0 ? ", " : ""}<code>{visible(c)}</code></span>)}. <Chip state="warn" wrap>UNVERIFIED</Chip> {visible(picked.unverified)}.</p>
        ) : <p className="muted">With no inspector the gateway skips inspection: nothing is checked.</p>}
      </fieldset>

      <Pick id="authority" label="Authority" options={info.authorities} value={draft.authority} onChange={(v) => set({ authority: v })} text={AUTHORITY_TEXT} testId="key-authority" />
      <Pick id="failMode" label="Failure mode" options={info.failModes} value={draft.failMode} onChange={(v) => set({ failMode: v })} text={FAIL_TEXT} testId="key-failmode" />
      <p className="muted"><Chip state="warn">UNVERIFIED</Chip> Whether the product offers fail open or fail closed is not known; the lab shows both.</p>

      <label>Timeout (ms, lab clock; {bounds.minTimeoutMs} to {bounds.maxTimeoutMs})
        <input type="number" min={bounds.minTimeoutMs} max={bounds.maxTimeoutMs} step="1" inputMode="numeric" value={Number.isNaN(draft.timeoutMs) ? "" : draft.timeoutMs}
          onChange={(e) => set({ timeoutMs: e.target.value === "" ? NaN : Number(e.target.value) })} data-testid="key-timeout" aria-invalid={problems.length > 0 || undefined} />
      </label>

      <label>Inspector state (a lab fault injector, not a product setting)
        <select value={draft.inspector ? draft.inspectorState : ""} disabled={!draft.inspector} onChange={(e) => set({ inspectorState: e.target.value })} data-testid="key-state">
          {draft.inspector ? info.inspectorStates.map((s) => <option key={s} value={s}>{STATE_TEXT[s] || s}</option>) : <option value="">no inspector</option>}
        </select>
      </label>

      <div className="seg">
        <button type="button" className="primary" onClick={onSave} disabled={saving || problems.length > 0} data-testid="key-save">Apply to the key</button>
        {dirty ? <Chip state="warn" testId="key-dirty">unsaved changes</Chip> : <Chip state="ok" testId="key-saved">saved</Chip>}
      </div>
      {problems.map((m) => <p key={m} className="field-error" role="alert" data-testid="key-problem">{m}</p>)}
      {notice && <p className="muted" role="status" data-testid="key-notice">{visible(notice)}</p>}
      {saveError && <p className="field-error" role="alert" data-testid="key-save-error">The server refused this key: {visible(saveError)}</p>}
      <p className="muted" data-testid="key-saved-view">Saved key: {view.inspector ? visible(view.inspectorInfo.label) : "no inspector"}, {view.authority}, fail {view.failMode}, timeout {view.timeoutMs} ms{view.inspector ? `, inspector ${view.inspectorState}` : ""}.</p>
    </section>
  );
}
