/**
 * components/ui/Toast.jsx
 * ────────────────────────
 * Floating notification banner — pure Tailwind, no App.css dependency.
 * Props:
 *   toast   {{ type: 'success'|'error', message: string } | null }
 *   onDismiss {() => void}
 */
export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div
      className={[
        'fixed bottom-5 right-5 z-50 flex items-start gap-3 max-w-sm w-full',
        'rounded-lg shadow-lg border px-4 py-3.5 text-sm font-medium',
        'animate-slide-in-down',
        isSuccess
          ? 'bg-success-bg border-success-bdr text-success-txt'
          : 'bg-reject-bg border-reject-bdr text-reject-txt',
      ].join(' ')}
      role="alert"
      aria-live="assertive"
    >
      <span className="flex-1 leading-relaxed">{toast.message}</span>
      <button
        className={[
          'flex-shrink-0 text-xs font-bold opacity-60 hover:opacity-100 transition-opacity',
          'w-5 h-5 flex items-center justify-center rounded',
          isSuccess ? 'hover:bg-success-bdr/30' : 'hover:bg-reject-bdr/30',
        ].join(' ')}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
