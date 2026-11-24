import { useCallback, useEffect, useRef, useState } from "react";
import { getInfo, getObservability, getStory, postReset, postRun, postScenario, setMode } from "../api";

const say = (r, what) => r.body?.message || `${what} failed (HTTP ${r.status})`;

/**
 * The lab's one data hook. It holds the info (source, realAvailable, the banner), the story and talk track for the picked vertical, and the last run
 * (so a visitor can leave the Inspector page and come back to it) with the record the run left behind. The vertical starts as null: the first load sends
 * NO vertical, so the server answers with the configured customer vertical and cast (a default here would turn "none" into "retail" and hide them). `switchMode` is the rule 19 toggle: POST
 * /api/mode with exactly { source }, then every piece of data is loaded again. `epoch` goes up on a switch, a Reset or a new vertical so a page starts over.
 */
export default function useLab() {
  const [vertical, setVerticalState] = useState(null);
  const [info, setInfo] = useState(null);
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [modeError, setModeError] = useState(null);
  const [last, setLast] = useState(null); // { kind: "live" | "scenario", result, scenario?, runId, trace } or null before any run
  const [obs, setObs] = useState(null); // the run-observability answer for the last run
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const seq = useRef(0);

  const load = useCallback(async (v) => {
    const mine = ++seq.current; // a late answer for a vertical or a mode the visitor has left is dropped
    const [i, s] = await Promise.all([getInfo(), getStory(v)]);
    if (mine !== seq.current) return;
    const bad = [i, s].find((r) => !r.ok);
    if (bad) { setError(say(bad, "Loading the lab")); return; }
    setError(null); setInfo(i.body); setStory(s.body);
    if (s.body.vertical && s.body.vertical !== v) setVerticalState(s.body.vertical); // the configured vertical wins on the first load
  }, []);

  useEffect(() => { load(undefined); }, [load]);
  const setVertical = useCallback((v) => { setVerticalState(v); setEpoch((n) => n + 1); load(v); }, [load]);

  // Rule 19: the server decides. A 409 (Real not available) is shown as the server worded it; nothing else changes.
  const switchMode = useCallback(async (source) => {
    const r = await setMode(source);
    if (!r.ok) { setModeError(r.body?.message || `The mode did not change (HTTP ${r.status})`); return { ok: false, message: r.body?.message }; }
    setModeError(null); setLast(null); setObs(null); setEpoch((n) => n + 1);
    await load(vertical ?? undefined);
    return { ok: true };
  }, [load, vertical]);

  const refreshObs = useCallback(async () => {
    const r = await getObservability();
    setObs(r.ok ? r.body : { record: { error: r.body?.error || "run_observability_failed", message: r.body?.message || `HTTP ${r.status}` }, streams: [] });
  }, []);

  // A run is data, a refusal included. Only a transport or validation failure (4xx/5xx) is returned as { ok: false } for the page to show.
  const runLive = useCallback(async (prompt) => {
    setBusy(true);
    try {
      const r = await postRun(prompt);
      if (!r.ok) return { ok: false, status: r.status, message: say(r, "The run"), code: r.body?.error };
      const { runId, trace, ...result } = r.body;
      setLast({ kind: "live", result, runId, trace });
      await refreshObs();
      return { ok: true };
    } finally { setBusy(false); }
  }, [refreshObs]);

  const runScenario = useCallback(async (id) => {
    setBusy(true);
    try {
      const r = await postScenario(id);
      if (!r.ok) return { ok: false, status: r.status, message: say(r, "The scenario"), code: r.body?.error };
      const { runId, ...scenario } = r.body;
      setLast({ kind: "scenario", id, scenario, runId });
      await refreshObs();
      return { ok: true };
    } finally { setBusy(false); }
  }, [refreshObs]);

  const reset = useCallback(async () => {
    const r = await postReset();
    // The address may still name a scenario ("#inspector/<id>"): Reset takes it out, so the page that opens again does not run it again.
    try { window.history.replaceState(null, "", `#${window.location.hash.replace("#", "").split("/")[0] || "inspector"}`); } catch { /* ignore */ }
    setLast(null); setObs(null); setEpoch((n) => n + 1);
    await load(vertical ?? undefined);
    return r.ok;
  }, [load, vertical]);

  return { vertical, setVertical, info, story, source: info?.source || null, error, modeError, last, obs, busy, epoch, reload: () => load(vertical ?? undefined), switchMode, runLive, runScenario, reset };
}
