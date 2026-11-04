/**
 * components/ui/Spinner.jsx
 * ─────────────────────────
 * Reusable loading spinner.
 * Props:
 *   small {boolean} — renders a smaller inline variant (default: false)
 */
export default function Spinner({ small = false }) {
  return (
    <div
      className={small ? 'spinner spinner--sm' : 'spinner'}
      aria-hidden="true"
    />
  );
}

