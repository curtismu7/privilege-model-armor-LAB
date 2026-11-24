// Every hostile-input bound in one place. The spec lists them; tests pin them.
import { MAX_PROMPT_CHARS } from './model-gateway-sim/providerStub.js';

export const BOUNDS = Object.freeze({
  maxPromptChars: MAX_PROMPT_CHARS, // the kit provider's own limit; the lab refuses before inspecting
  maxBodyBytes: 128 * 1024,         // a prompt of maxPromptChars control characters is 6 bytes each once JSON-escaped (\u0001): 120000 plus the wrapper
  maxFindings: 50,                  // per inspection; more is malformed
  maxMessageChars: 300,
  maxMessages: 5,
  minTimeoutMs: 50,
  maxTimeoutMs: 10_000,
  defaultTimeoutMs: 500,            // UNVERIFIED: the product's timeout, if it has one, is not in the release notes
  maxInspectorsListed: 8,           // an `inspectors` list longer than this is refused unread
  maxLogKept: 100,
});
