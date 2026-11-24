import { visible } from "../safeText";
import { paragraphs } from "./Paragraphs.jsx";

// The presenter's lines for a page: the talk-track items for it, as the server worded them, one <p> per paragraph.
export default function PresenterSay({ say, heading }) {
  return (
    <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track" hidden={say.length === 0}>
      {heading && <p className="kicker" data-testid="presenter-beat">{heading}</p>}
      {say.map((t) => (
        <div key={t.id} data-testid={`presenter-item-${t.id}`}>
          <h2 className="presenter-say__title">{visible(t.title)}</h2>
          {paragraphs(t.say).map((p, i) => <p key={i}>{visible(p)}</p>)}
        </div>
      ))}
    </aside>
  );
}
