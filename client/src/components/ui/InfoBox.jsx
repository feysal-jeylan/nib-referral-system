/**
 * components/ui/InfoBox.jsx
 * ──────────────────────────
 * Informational callout box — pure Tailwind, no App.css dependency.
 * Props:
 *   message {string}
 */
export default function InfoBox({ message }) {
  return (
    <div
      className="flex items-start gap-3 bg-gold-light border border-l-4 border-gold/30 border-l-gold rounded-lg p-4"
      role="note"
    >
      <span className="text-gold flex-shrink-0 text-base mt-0.5" aria-hidden="true">ℹ</span>
      <p className="text-text-2 text-sm leading-relaxed">{message}</p>
    </div>
  );
}
