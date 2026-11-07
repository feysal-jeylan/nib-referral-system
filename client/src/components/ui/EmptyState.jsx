/**
 * components/ui/EmptyState.jsx
 * ─────────────────────────────
 * Centred empty-state placeholder — pure Tailwind, no App.css dependency.
 * Props:
 *   icon  {string} — emoji or symbol
 *   title {string} — primary message
 *   sub   {string} — secondary hint
 */
export default function EmptyState({ icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <span className="text-4xl" aria-hidden="true">{icon}</span>
      <p className="text-text-1 font-semibold text-sm">{title}</p>
      <p className="text-text-3 text-xs max-w-[32ch] leading-relaxed">{sub}</p>
    </div>
  );
}
