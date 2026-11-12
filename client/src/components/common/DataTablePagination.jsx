/**
 * components/common/DataTablePagination.jsx
 * ──────────────────────────────────────────
 * Reusable pagination bar for all server-side paginated tables.
 *
 * Props:
 *   meta         { total, page, limit, totalPages }
 *   onPageChange (newPage: number) => void
 *   loading      boolean  — disables buttons while fetching
 */

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.15)';

export default function DataTablePagination({ meta, onPageChange, loading = false }) {
  if (!meta || meta.totalPages <= 1) return null;

  const { total, page, limit, totalPages } = meta;
  const from = Math.min((page - 1) * limit + 1, total);
  const to   = Math.min(page * limit, total);

  // Build visible page numbers: always show first, last, and ±1 around current
  function getPages() {
    const pages = new Set([1, totalPages, page - 1, page, page + 1]);
    return [...pages]
      .filter(p => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }

  const pages = getPages();

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs"
      style={{ borderTop: `1px solid ${BORDER}`, background: IVORY }}
    >
      {/* Count */}
      <span style={{ color: MUTED }}>
        Showing <strong style={{ color: CHOCOLATE }}>{from}–{to}</strong> of{' '}
        <strong style={{ color: CHOCOLATE }}>{total}</strong> records
      </span>

      {/* Page buttons */}
      <div className="flex items-center gap-1">
        {/* Previous */}
        <PageBtn
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          label="← Prev"
        />

        {/* Page numbers with ellipsis gaps */}
        {pages.map((p, i) => {
          const prev = pages[i - 1];
          return (
            <span key={p} className="flex items-center gap-1">
              {prev && p - prev > 1 && (
                <span style={{ color: MUTED }} className="px-1">…</span>
              )}
              <PageBtn
                onClick={() => onPageChange(p)}
                disabled={loading}
                active={p === page}
                label={String(p)}
              />
            </span>
          );
        })}

        {/* Next */}
        <PageBtn
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          label="Next →"
        />
      </div>
    </div>
  );
}

function PageBtn({ onClick, disabled, active = false, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1.5 rounded font-medium transition-all duration-100 outline-none"
      style={{
        background:  active ? BRAND : 'transparent',
        color:       active ? '#fff' : disabled ? '#ccc' : MUTED,
        border:      `1px solid ${active ? BRAND : 'rgba(138,77,31,0.15)'}`,
        cursor:      disabled ? 'not-allowed' : 'pointer',
        minWidth:    '32px',
      }}
      onMouseEnter={e => { if (!disabled && !active) e.currentTarget.style.background = 'rgba(138,77,31,0.07)'; }}
      onMouseLeave={e => { if (!disabled && !active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
