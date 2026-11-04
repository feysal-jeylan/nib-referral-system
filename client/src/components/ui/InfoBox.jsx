/**
 * components/ui/InfoBox.jsx
 * ──────────────────────────
 * Informational callout box.
 * Props:
 *   message {string}
 */
export default function InfoBox({ message }) {
  return (
    <div className="info-box" role="note">
      <span className="info-box__icon" aria-hidden="true">ℹ</span>
      <p className="info-box__text">{message}</p>
    </div>
  );
}

