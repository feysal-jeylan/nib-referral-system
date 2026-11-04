/**
 * components/ui/Toast.jsx
 * ────────────────────────
 * Floating notification banner.
 * Props:
 *   toast   {{ type: 'success'|'error', message: string } | null }
 *   onDismiss {() => void}
 */
export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div
      className={`toast toast--${toast.type}`}
      role="alert"
      aria-live="assertive"
    >
      <span>{toast.message}</span>
      <button
        className="toast__close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

