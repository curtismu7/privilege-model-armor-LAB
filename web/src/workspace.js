// Rule 13: each browser tab gets its own workspace id, kept in sessionStorage, and sends it as X-Workspace on every API call
// that touches server state. Storage can be blocked, so a failure falls back to a per-load id.
//
// Two things can go wrong with a tab's id, and this file handles both:
//  1. A DUPLICATED tab copies sessionStorage, so two tabs share one id and one tab's Reset or key change lands on the other's lab. Tabs of one browser tell each
//     other over a BroadcastChannel: a tab that starts claims its id; a tab already holding that id answers "taken", and the later tab mints a new id.
//     Residual cases (no BroadcastChannel, or two tabs starting at the same instant) are listed on the Limits page.
//  2. The server keeps a bounded number of workspaces and forgets the least recently used one (and a Reset on the command line forgets one): the tab's next call then
//     finds a brand-new lab. The server marks a workspace it just created with `X-Workspace-Fresh: 1`; a tab that remembers it already used this id knows the
//     lab it was looking at is gone, and says so (onForgotten).
const KEY = "pma.workspace";
const USED_KEY = "pma.workspace.used";
// The same pattern as the server (server/src/workspaces.js): 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit. A test compares them.
export const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Where there is no crypto object. A typed array's map() returns a NEW array and leaves the original zero, so the bytes are filled in place.
export const fallbackCrypto = { getRandomValues(a) { for (let i = 0; i < a.length; i += 1) a[i] = Math.floor(Math.random() * 256); return a; } };
// Parallel calls answered fresh by the same eviction land within this window; a later, genuinely new eviction reports again.
export const FORGOTTEN_DEDUPE_MS = 2000;
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export function createWorkspace({
  session = () => window.sessionStorage,
  makeChannel = () => (typeof BroadcastChannel === "function" ? new BroadcastChannel("pma-workspace") : null),
  random = () => window.crypto || fallbackCrypto,
  timer = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  let memo = null;
  let channel = null;
  const token = hex(random().getRandomValues(new Uint8Array(8))); // this load of this tab, never stored
  const listeners = new Set();
  let generation = 0; // goes up whenever this tab deliberately starts over (its own Reset, a new id): an answer to a request sent before that says nothing about the new state
  let lastForgottenAt = 0; // one eviction is one banner: N parallel calls answered fresh by the same eviction report once, not once each
  const read = (k) => { try { return session().getItem(k); } catch { return null; } };
  const write = (k, v) => { try { session().setItem(k, v); } catch { /* blocked */ } };
  const drop = (k) => { try { session().removeItem(k); } catch { /* blocked */ } };

  function workspaceId() {
    if (memo) return memo;
    const saved = read(KEY);
    if (saved && WORKSPACE_ID.test(saved)) return (memo = saved);
    memo = `w-${hex(random().getRandomValues(new Uint8Array(8)))}`;
    write(KEY, memo);
    return memo;
  }

  // For tests and for a duplicate: a new tab starts with a new id that no server has seen.
  function forget() { memo = null; generation += 1; lastForgottenAt = 0; drop(KEY); drop(USED_KEY); }

  // Answers another tab's claim of the id this tab holds.
  const answer = (e) => {
    const m = e?.data;
    if (m && m.type === "claim" && m.id === memo && m.token !== token) channel.postMessage({ type: "taken", id: m.id, to: m.token });
  };

  // Called once at start-up, before the first API call. Resolves to the id this tab will use (a new one when another tab already holds it).
  async function claim({ waitMs = 150 } = {}) {
    const id = workspaceId();
    if (!channel) { try { channel = makeChannel(); } catch { channel = null; } }
    if (!channel) return id;
    channel.onmessage = answer;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; channel.onmessage = answer; resolve(v); } };
      channel.onmessage = (e) => { answer(e); const m = e?.data; if (m && m.type === "taken" && m.to === token && m.id === id) { forget(); finish(workspaceId()); } };
      channel.postMessage({ type: "claim", id, token });
      timer(() => finish(id), waitMs);
    });
  }

  // A Reset on this tab's own request makes the next "fresh" answer expected, so it is not reported as a forgotten workspace.
  const markUnused = () => { generation += 1; drop(USED_KEY); };
  const onForgotten = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  // `usedWhenSent` and `generationWhenSent` are what the tab knew when the REQUEST WENT OUT, never when the answer arrived: parallel first-load calls from a brand-new
  // tab can be answered in any order, and a non-fresh answer that arrives first must not make the fresh one look like a forgotten workspace.
  // An answer to a request sent before the tab started over (generation changed) says nothing about the new state: it touches nothing and reports nothing.
  // One eviction is reported once: the parallel calls it answers all carry fresh within the same instant, and only the first fires the banner.
  function noteFresh(id, usedWhenSent, generationWhenSent) {
    if (generationWhenSent !== generation) return;
    write(USED_KEY, id);
    if (usedWhenSent && Date.now() - lastForgottenAt > FORGOTTEN_DEDUPE_MS) { lastForgottenAt = Date.now(); for (const fn of [...listeners]) fn(); }
  }

  const fetchWithWorkspace = async (url, opts = {}) => {
    const id = workspaceId();
    const usedWhenSent = read(USED_KEY) === id;
    const generationWhenSent = generation;
    const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}), "x-workspace": id } });
    // Any status: a refusal (400) that carried the header still means the server had to make a new workspace.
    if (r.headers?.get?.("x-workspace-fresh") === "1") noteFresh(id, usedWhenSent, generationWhenSent);
    // The answer to a Reset proves nothing: the workspace it names has just been thrown away, so it must not mark the id used.
    else if (r.ok && !/\/api\/reset(\?|$)/.test(String(url)) && generationWhenSent === generation && read(USED_KEY) !== id) write(USED_KEY, id);
    return r;
  };

  return { workspaceId, forget, claim, markUnused, onForgotten, fetch: fetchWithWorkspace, token: () => token };
}

const tab = createWorkspace();
export const workspaceId = tab.workspaceId;
export const workspaceFetch = tab.fetch;
export const forgetWorkspace = tab.forget;
export const claimWorkspace = tab.claim;
export const markWorkspaceUnused = tab.markUnused;
export const onWorkspaceForgotten = tab.onForgotten;
