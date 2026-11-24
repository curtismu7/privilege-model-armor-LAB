// Text the page and the API show besides the banner (banner.js): who this lab is, what the release notes say, what is the lab's own model and what is
// not known. The Limits page draws exactly these lists; nothing is written twice.
export const LAB_ID = 'privilege-model-armor-lab';
export const LAB_NAME = 'Privilege Model Armor LAB';
export const RELEASE_NOTES_DATE = '2026-11-21';

// What the release notes say. Nothing else on any page is a statement about the product.
export const SOURCED = Object.freeze([
  `A key can use an external inspector in AI Guard; Model Armor is the one this lab models first (${RELEASE_NOTES_DATE} release notes).`,
  'A key has one external inspector.',
  'An authority setting caps the inspector: it can be held advisory, so its findings advise and do not enforce.',
  'The diagram data from diagram-studio also lists Azure AI Content Safety and Amazon Bedrock Guardrails as the other choices; the lab models both as stub alternatives.',
]);

// What the lab does on top of that: its own model, labelled as such wherever it is shown.
export const LAB_MODEL = Object.freeze([
  'Each inspector is a stub with deterministic rules (a prompt-injection phrase list, PII patterns with check digits, a short harmful-content phrase list, a list of lab-made .invalid hosts). The rules say nothing about how any real inspector detects anything.',
  'A call is inspected twice: the prompt on the way in and the model\'s answer on the way out. A blocked prompt never reaches the model (no tokens spent); a blocked response was already produced, so its tokens are spent and the answer is withheld.',
  'Enforcing: a finding blocks the call with the gateway\'s own named refusal (blocked_by_inspector, HTTP 403, origin gateway). Advisory: the same finding is written to the gateway log and the call goes through.',
  'Fail closed: an unreachable inspector (inspector_unavailable, 503) or one that does not answer within the key\'s timeout (inspector_timeout, 504) blocks the call, whatever the prompt holds. Fail open: the call goes through and the gateway log says failed_open.',
  'The timeout is on the lab clock: 500 ms by default, 50 to 10000 ms. A stub that answers in 800 ms therefore times out at 500 ms.',
  'Malformed findings are a named error (inspector_malformed_findings, 502), never a pass: the model is not called, and neither fail open nor advisory turns it into a pass.',
  'Selecting another inspector replaces the first; two at once are refused with the named error two_inspectors and the key keeps what it had.',
  'The key has nothing to log in with: the stubs need no login, and a real Model Armor login would be write-only (Real mode is not built).',
]);

// Not known. Each line is a choice the lab made without a source.
export const UNVERIFIED = Object.freeze([
  'Model Armor\'s category names follow Google\'s public overview read 2026-11-24 (prompt injection and jailbreak, sensitive data, harmful content, malicious URL). The overview lists more, which the lab does not model; re-check the names before any claim.',
  'The category names of Azure AI Content Safety and Bedrock Guardrails are lab labels, not checked against the vendors\' documents.',
  'Whether the product offers fail-open or fail-closed at all (Google\'s overview says nothing). The lab shows both as two configurations.',
  'The timeout value, and whether it is settable. The 500 ms default and the 50 to 10000 ms range are the lab\'s own.',
  'The status codes and bodies a client receives when a call is blocked, and the wording of the refusal. The lab uses 403, 503, 504 and 502 and says they are its own.',
  'Whether the response is inspected as well as the prompt.',
  'The finding shape (category, severity, location, messages) follows how the source lab describes its inspection endpoint; no product has been checked.',
  'What the gateway does with an unreadable answer from the inspector. The lab treats it as a named error, never as a pass.',
  'What a logged advisory finding looks like in the product\'s log. The lab\'s log entries are its own.',
]);

export const NOT_CLAIMED = Object.freeze([
  'Detection quality. The stub rules are deterministic phrase and pattern lists; the lab makes no claim about what Model Armor, Azure AI Content Safety or Bedrock Guardrails would find in the same text.',
]);
