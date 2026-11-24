// Rule 13: each browser tab gets its own workspace id, kept in sessionStorage, and sends it as X-Workspace on every API call
// that touches server state. Storage can be blocked, so a failure falls back to a per-load id.
const KEY = "pma.workspace";
// The same pattern as the server (server/src/workspaces.js): 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit. A test compares them.
export const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
let memo = null;
// Where there is no crypto object. A typed array's map() returns a NEW array and leaves the original zero, so the bytes are filled in place.
export const fallbackCrypto = { getRandomValues(a) { for (let i = 0; i < a.length; i += 1) a[i] = Math.floor(Math.random() * 256); return a; } };

export function workspaceId() {
  if (memo) return memo;
  try { const saved = window.sessionStorage.getItem(KEY); if (saved && WORKSPACE_ID.test(saved)) return (memo = saved); } catch { /* blocked */ }
  const bytes = new Uint8Array(8);
  (window.crypto || fallbackCrypto).getRandomValues(bytes);
  memo = `w-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  try { window.sessionStorage.setItem(KEY, memo); } catch { /* blocked */ }
  return memo;
}

export const workspaceFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}), "x-workspace": workspaceId() } });

// For tests: a new tab starts with a new id.
export function forgetWorkspace() { memo = null; try { window.sessionStorage.removeItem(KEY); } catch { /* blocked */ } }
