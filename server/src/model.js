// The lab's model stub: the kit's mock provider, plus a lab directive so a scenario can make the model answer with something the response
// inspection must catch. A prompt that contains [[lab:reply=<name>]] gets that canned reply instead of the provider's echo. The canned
// replies are built at run time (no card number sits in the repo) and the link points at a reserved .invalid host.
import { SAMPLES } from './pii.js';

const DIRECTIVE = /\[\[lab:reply=([a-z-]{1,20})\]\]/;
const REPLIES = new Map([
  ['clean', () => 'Our refund window is thirty days from delivery.'],
  ['card', () => `The card on file is ${SAMPLES.card.valid()}.`],
  ['link', () => 'The installer is at https://download.malware.invalid/setup today.'],
]);
export const REPLY_NAMES = [...REPLIES.keys()];

export function createModel(provider) {
  return {
    id: provider.id,
    model: provider.model,
    // Same result shape as the kit provider. Advances the lab clock by the call's latency (the provider does).
    call({ prompt }) {
      const r = provider.call({ prompt });
      if (!r.ok) return r;
      const m = DIRECTIVE.exec(prompt);
      const reply = m ? REPLIES.get(m[1]) : undefined;
      return reply ? { ...r, text: reply() } : r;
    },
  };
}
