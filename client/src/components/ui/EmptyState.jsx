/**
 * components/ui/EmptyState.jsx
 * ─────────────────────────────
 * Centred empty-state placeholder with icon, title and sub-text.
 * Props:
 *   icon  {string} — emoji or symbol
 *   title {string} — primary message
 *   sub   {string} — secondary hint
 */
export default function EmptyState({ icon, title, sub }) {
  return (
    <div className="state-box">
      <span className="state-box__icon" aria-hidden="true">{icon}</span>
      <p className="state-box__title">{title}</p>
      <p className="state-box__sub">{sub}</p>
    </div>
  );
}

