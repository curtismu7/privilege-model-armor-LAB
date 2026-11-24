import { visible } from "../safeText";

// A talk-track text is paragraphs joined by a blank line: one <p> each, so a long script reads as paragraphs and not as one block.
export const paragraphs = (text) => String(text ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

export default function Paragraphs({ text, className }) {
  return paragraphs(text).map((p, i) => <p key={i} className={className}>{visible(p)}</p>);
}
