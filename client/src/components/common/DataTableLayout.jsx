/**
 * components/common/DataTableLayout.jsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Reusable shell for every data-table page in the Nib Bank admin portal.
 *
 * Layout it renders:
 *
 *   [Optional outer page header]
 *     <h1> title  /  <p> subtitle  /  headerActions slot
 *
 *   <section>  ← the white card (rounded-xl, shadow, border)
 *     [Optional card header]  (rendered when cardTitle is provided)
 *       <h2> cardTitle  /  <p> cardSubtitle  /  cardActions + record badge
 *
 *     [filters slot]
 *
 *     ┌─ isLoading  → centred Spinner
 *     ├─ isEmpty    → emptyState ReactNode
 *     └─ otherwise:
 *         ┌─ columns provided & non-empty
 *         │    <div overflow-x-auto>
 *         │      <table>
 *         │        <thead> generated from columns[]
 *         │        <tbody>{children}</tbody>
 *         │      </table>
 *         │    </div>
 *         └─ no columns
 *              {children}  ← full sub-component (e.g. ReferralTable)
 *         [pagination slot]
 *
 * Props — all optional except `children`:
 *
 *   Outer page header
 *     title          ReactNode
 *     subtitle       ReactNode
 *     headerActions  ReactNode   (top-right buttons)
 *
 *   Card header
 *     cardTitle      ReactNode
 *     cardSubtitle   ReactNode
 *     cardActions    ReactNode   (right side of card header, e.g. bulk buttons)
 *     totalRecords   number|null  (renders "N <recordLabel>s" badge)
 *     recordLabel    string       default: 'item'
 *
 *   Content
 *     filters        ReactNode   (TableFilters instance)
 *     isLoading      boolean
 *     loadingText    string      default: 'Loading…'
 *     isEmpty        boolean
 *     emptyState     ReactNode
 *
 *   Table (optional — omit to pass a full sub-component as children)
 *     columns        Array<{ key, header, align?, width?, hidden? }>
 *     tableMinWidth  string      default: '800px'
 *     ariaLabel      string
 *
 *   Footer
 *     pagination     ReactNode   (DataTablePagination instance)
 *
 *   children         ReactNode   (required)
 */

import Spinner from '@/components/ui/Spinner';

// ── Brand tokens (Nib Bank) ───────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.10)';

export default function DataTableLayout({
  // Outer page header
  title,
  subtitle,
  headerActions,

  // Card header
  cardTitle,
  cardSubtitle,
  cardActions,
  totalRecords,
  recordLabel = 'item',

  // Content
  filters,
  isLoading = false,
  loadingText = 'Loading…',
  isEmpty = false,
  emptyState,

  // Table (optional)
  columns,
  tableMinWidth = '800px',
  ariaLabel,

  // Footer
  pagination,

  // Children — tbody rows when columns provided, or a full sub-component
  children,
}) {
  const hasColumns = Array.isArray(columns) && columns.length > 0;

  // ── Record badge label ──────────────────────────────────────────────────────
  function recordBadge() {
    if (totalRecords == null) return null;
    const noun = totalRecords === 1 ? recordLabel : `${recordLabel}s`;
    return (
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ background: IVORY, color: MUTED }}
      >
        {totalRecords} {noun}
      </span>
    );
  }

  return (
    <>
      {/* ── Optional outer page header ──────────────────────────────────────── */}
      {(title || subtitle || headerActions) && (
        <div className="flex items-start justify-between mb-6">
          <div>
            {title && (
              <h1 className="text-xl font-bold" style={{ color: CHOCOLATE }}>
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm mt-1" style={{ color: MUTED }}>
                {subtitle}
              </p>
            )}
          </div>
          {headerActions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerActions}
            </div>
          )}
        </div>
      )}

      {/* ── Main table card ─────────────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {/* ── Optional card header ─────────────────────────────────────────── */}
        {cardTitle && (
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            <div>
              <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
                {cardTitle}
              </h2>
              {cardSubtitle && (
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {cardSubtitle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {cardActions}
              {recordBadge()}
            </div>
          </div>
        )}

        {/* ── Filters slot ─────────────────────────────────────────────────── */}
        {filters}

        {/* ── Loading state ────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-sm" style={{ color: MUTED }}>
              {loadingText}
            </p>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!isLoading && isEmpty && emptyState}

        {/* ── Table content ────────────────────────────────────────────────── */}
        {!isLoading && !isEmpty && (
          <>
            {hasColumns ? (
              /* Generated table with declarative columns */
              <div className="overflow-x-auto w-full">
                <table
                  className={`min-w-[${tableMinWidth}] w-full text-sm border-collapse`}
                  aria-label={ariaLabel}
                >
                  <thead>
                    <tr className="bg-panel border-b border-border">
                      {columns
                        .filter((col) => !col.hidden)
                        .map((col) => (
                          <th
                            key={col.key}
                            scope="col"
                            style={col.width ? { width: col.width } : undefined}
                            className={[
                              'px-6 py-3 text-[11px] font-semibold text-text-3 uppercase tracking-widest',
                              col.align === 'right'  ? 'text-right'  :
                              col.align === 'center' ? 'text-center' :
                                                       'text-left',
                            ].join(' ')}
                          >
                            {col.header}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>{children}</tbody>
                </table>
              </div>
            ) : (
              /* Pass-through — full sub-component owns its own table */
              children
            )}

            {/* ── Pagination slot ────────────────────────────────────────── */}
            {pagination}
          </>
        )}
      </section>
    </>
  );
}

