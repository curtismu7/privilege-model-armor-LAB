// Navigation helpers kept apart from the components so they can be tested on their own.
export const PAGE_IDS = ["inspector", "diagram", "stories", "limits"];

// "#inspector/<scenario>" opens the Inspector page and runs that scenario: the page is the part before the slash.
export const pageFromHash = () => { const h = window.location.hash.replace("#", "").split("/")[0]; return PAGE_IDS.includes(h) ? h : "inspector"; };

// What a key press means for presenter mode: "toggle" (P), "leave" (Escape) or null. P typed into a field, pressed on a button, link or other control,
// held down (repeat), or combined with Ctrl, Meta or Alt (Ctrl+P is the browser's print) is never a shortcut. Escape only leaves, so it needs no such guard
// beyond the modifiers.
export function shortcutTarget(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (e.key === "Escape") return "leave";
  if (e.key !== "p" && e.key !== "P") return null;
  const t = e.target;
  if (t && typeof t.tagName === "string" && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(t.tagName) || t.isContentEditable)) return null;
  return "toggle";
}
