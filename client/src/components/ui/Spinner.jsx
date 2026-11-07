/**
 * components/ui/Spinner.jsx
 * ─────────────────────────
 * Reusable loading spinner — pure Tailwind, no App.css dependency.
 * Props:
 *   small {boolean} — renders a smaller inline variant (default: false)
 */
export default function Spinner({ small = false }) {
  return (
    <span
      className={
        small
          ? 'inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0'
          : 'inline-block w-6 h-6 border-2 border-border border-t-brand rounded-full animate-spin'
      }
      aria-hidden="true"
    />
  );
}
