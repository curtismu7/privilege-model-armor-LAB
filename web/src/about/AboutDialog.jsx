// What the version button opens: THIS lab's own short notes. The shared ReleaseNotes dialog (vendored with TopMenu, pinned, never edited) carries another lab's
// text and is never shown here: App passes onVersion to TopMenu, which then never opens it. The claims listed are the server's own sourced list (data.js SOURCED),
// so nothing appears here that the Limits page does not say.
import FloatingDialog from "../floating-dialog/FloatingDialog";
import { visible } from "../safeText";

export default function AboutDialog({ isOpen, onClose, info, version }) {
  return (
    <FloatingDialog isOpen={isOpen} onClose={onClose} title="About this lab" ariaLabel="About this lab" defaultWidth={430} defaultHeight={null} placement="right" storageKey="about-dialog" singletonKey="about" noBackdrop testId="about-dialog">
      {info && (
        <div className="about">
          <h2>Privilege Model Armor LAB {visible(version || "")}</h2>
          <p>A Demo-tier lab. Mock only: stub inspectors, a mock gateway and a mock model on a lab clock. Nothing leaves this machine.</p>
          <p><strong>What the 2026-11-21 release notes say (the only sourced claims):</strong></p>
          <ul>{(info.sourced || []).map((t) => <li key={t}>{visible(t)}</li>)}</ul>
          <p>Everything else is this lab's own model and UNVERIFIED. The lab makes no claim about any vendor's detection quality: the stub rules say nothing about how Model Armor, Azure AI Content Safety or Bedrock Guardrails find anything. <a href="#limits" onClick={onClose} data-testid="about-limits-link">See the Limits page</a>.</p>
          <p className="muted" data-testid="about-real">{visible(info.realReason)}</p>
        </div>
      )}
    </FloatingDialog>
  );
}
