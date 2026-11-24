import { describe, expect, it } from "vitest";
import { createWorkspace, WORKSPACE_ID } from "../workspace.js";
import { screen, text, useLabHarness, waitFor } from "./util.jsx";
import { fireEvent } from "@testing-library/react";

// A fake browser: one in-memory BroadcastChannel bus shared by tabs, and one fake sessionStorage per tab.
function bus() {
  const chans = new Set();
  return () => {
    const c = { onmessage: null, postMessage(data) { for (const o of chans) if (o !== c && o.onmessage) Promise.resolve().then(() => o.onmessage({ data: JSON.parse(JSON.stringify(data)) })); } };
    chans.add(c);
    return c;
  };
}
const storage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), all: () => Object.fromEntries(m) }; };
const rnd = () => ({ getRandomValues: (a) => { for (let i = 0; i < a.length; i += 1) a[i] = Math.floor(Math.random() * 256); return a; } });
const tabOf = (session, makeChannel) => createWorkspace({ session: () => session, makeChannel, random: rnd, timer: (fn) => setTimeout(fn, 20) });

describe("a duplicated tab does not share its original's workspace", () => {
  it("the later tab mints a new valid id and forgets that it had used the old one; the original keeps its id", async () => {
    const mk = bus();
    const a = tabOf(storage(), mk);
    const idA = a.workspaceId();
    expect(await a.claim({ waitMs: 20 })).toBe(idA);
    const copied = storage({ ...{ "pma.workspace": idA, "pma.workspace.used": idA } }); // sessionStorage is copied when a tab is duplicated
    const b = tabOf(copied, mk);
    const idB = await b.claim({ waitMs: 80 });
    expect(idB).not.toBe(idA);
    expect(WORKSPACE_ID.test(idB)).toBe(true);
    expect(copied.all()["pma.workspace"]).toBe(idB);
    expect(copied.all()["pma.workspace.used"]).toBeUndefined();
    expect(a.workspaceId()).toBe(idA);
    // a third tab claiming the new id of the second is told to move too, and a tab with its own id is left alone
    const c = tabOf(storage(), mk);
    expect(await c.claim({ waitMs: 20 })).not.toBe(idA);
  });

  it("with no BroadcastChannel the tab keeps its id (the residual case the Limits page names); a channel that throws is the same", async () => {
    const s = storage({ "pma.workspace": "w-0011223344556677" });
    expect(await tabOf(s, () => null).claim({ waitMs: 5 })).toBe("w-0011223344556677");
    expect(await tabOf(storage({ "pma.workspace": "w-aa" }), () => { throw new Error("no channel"); }).claim({ waitMs: 5 })).toBe("w-aa");
  });

  it("two tabs that start at the same moment never end with the same id (at least the one that heard the other backs off)", async () => {
    const mk = bus();
    const s = { "pma.workspace": "w-0011223344556677" };
    const a = tabOf(storage(s), mk); const b = tabOf(storage(s), mk);
    const [ia, ib] = await Promise.all([a.claim({ waitMs: 80 }), b.claim({ waitMs: 80 })]);
    expect(ia).not.toBe(ib);
    expect([ia, ib].some((x) => x !== "w-0011223344556677")).toBe(true);
  });
});

describe("the server forgot this workspace", () => {
  const withFetch = (impl) => { const real = globalThis.fetch; globalThis.fetch = impl; return () => { globalThis.fetch = real; }; };
  const resp = (fresh) => ({ ok: true, headers: { get: (k) => (k === "x-workspace-fresh" && fresh ? "1" : null) } });

  it("the first fresh answer of a new tab is normal; a fresh answer for an id the tab already used is reported once; a Reset the tab asked for is not", async () => {
    const t = tabOf(storage(), null);
    let fresh = true; const restore = withFetch(async () => resp(fresh));
    let n = 0; t.onForgotten(() => { n += 1; });
    try {
      await t.fetch("/x"); expect(n).toBe(0);
      fresh = false; await t.fetch("/x"); expect(n).toBe(0);
      fresh = true; await t.fetch("/x"); expect(n).toBe(1);
      await t.fetch("/x"); expect(n).toBe(2); // each later "fresh" is a new forgetting
      t.markUnused(); await t.fetch("/x"); expect(n).toBe(2); // the tab's own Reset
      await t.fetch("/x"); expect(n).toBe(3);
    } finally { restore(); }
  });

  it("a duplicate that took a new id is not told its (new) workspace was forgotten on its first call", async () => {
    const t = tabOf(storage({ "pma.workspace": "w-aa", "pma.workspace.used": "w-aa" }), null);
    t.forget();
    const restore = withFetch(async () => resp(true)); let n = 0; t.onForgotten(() => { n += 1; });
    try { await t.fetch("/x"); expect(n).toBe(0); } finally { restore(); }
  });
});

describe("the page shows it", () => {
  const h = useLabHarness();
  it("when the server has forgotten the tab's workspace, the page says so in plain words, reloads its state and the key is back to the default", async () => {
    const user = await h.mount();
    await screen.findByTestId("key-panel");
    await user.click(screen.getByTestId("key-authority-advisory"));
    await user.click(screen.getByTestId("key-save"));
    await waitFor(() => expect(text("key-saved-view")).toMatch(/advisory/));
    await user.click(screen.getByTestId("scenario-clean-prompt-passes"));
    await screen.findByTestId("verdict");
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
    await h.lab.forgetServerSide();
    await user.click(screen.getByTestId("scenario-injection-blocked-when-enforcing"));
    const note = await screen.findByTestId("workspace-forgotten");
    expect(note).toHaveTextContent(/The server forgot this workspace/);
    expect(note).toHaveTextContent(/reset to its defaults/);
    await waitFor(() => expect(text("key-saved-view")).toMatch(/enforcing/), { timeout: 8000 });
    await user.click(screen.getByTestId("workspace-forgotten-dismiss"));
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
  });

  it("the page's own Reset takes the banner away", async () => {
    const user = await h.mount();
    await user.click(await screen.findByTestId("scenario-clean-prompt-passes"));
    await screen.findByTestId("verdict");
    await h.lab.forgetServerSide();
    await user.click(screen.getByTestId("scenario-injection-blocked-when-enforcing"));
    await screen.findByTestId("workspace-forgotten");
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("workspace-forgotten")).toBeNull());
  });

  it("the page's own Reset never shows it, and neither does a first visit", async () => {
    const user = await h.mount();
    await user.click(await screen.findByTestId("scenario-clean-prompt-passes"));
    await screen.findByTestId("verdict");
    await user.click(screen.getByTestId("reset"));
    await screen.findByTestId("result-empty");
    await screen.findByTestId("scenarios");
    await user.click(screen.getByTestId("scenario-clean-prompt-passes"));
    await screen.findByTestId("verdict");
    expect(screen.queryByTestId("workspace-forgotten")).toBeNull();
  });
});

describe("the diagram box handles keys only on itself", () => {
  const h = useLabHarness();
  it("Enter on the box opens it; Enter on a button inside the opened box does not close it", async () => {
    await h.mount({ page: "diagram" });
    const node = await screen.findByTestId("pat-node-gw");
    fireEvent.keyDown(node, { key: "Enter" });
    await waitFor(() => expect(node).toHaveAttribute("aria-expanded", "true"));
    const inner = node.querySelector("button");
    expect(inner).not.toBeNull();
    fireEvent.keyDown(inner, { key: "Enter" });
    fireEvent.keyDown(inner, { key: " " });
    expect(node).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(node, { key: " " });
    await waitFor(() => expect(node).toHaveAttribute("aria-expanded", "false"));
  });
});

describe("verdict wording for a model-stub error", () => {
  it("says a model error, not a named inspector error", async () => {
    const { verdictOf } = await import("../pages/Result.jsx");
    const run = { outcome: "error", findings: [], logged: [], hops: [{ hop: "inspect-prompt", result: "clear" }, { hop: "model", result: "error" }], error: { origin: "provider", code: "provider_unavailable", status: 503, direction: "model", message: "x" } };
    const v = verdictOf(run);
    expect(v.chip).toBe("MODEL ERROR"); expect(v.line).toMatch(/model stub answered with an error/); expect(v.code).toBe("provider_unavailable");
    expect(verdictOf({ ...run, error: { ...run.error, direction: "request", origin: "gateway", code: "inspector_malformed_findings" } }).chip).toBe("NAMED ERROR");
  });
});
