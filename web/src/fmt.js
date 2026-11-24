// Plain words for the engine's codes, shown beside the code so a presenter and the table say the same thing.
export const HOP_RESULT = {
  clear: "clear: no finding",
  blocked: "blocked by the gateway",
  logged: "finding logged, call goes on",
  "failed-open": "inspector unavailable, failed open",
  error: "named error",
  skipped: "skipped: no inspector",
  ok: "answered",
};
export const hopResultText = (r) => HOP_RESULT[r] || String(r);
export const ms = (n) => `${n} ms`;
export const AUTHORITY_TEXT = { enforcing: "enforcing: a finding blocks the call", advisory: "advisory: a finding is logged and the call goes through" };
export const FAIL_TEXT = { closed: "closed: an unavailable inspector blocks the call", open: "open: an unavailable inspector lets the call through" };
export const STATE_TEXT = { healthy: "healthy", unreachable: "unreachable", slow: "slow (800 ms)", malformed: "malformed findings" };
