/**
 * components/common/TableFilters.jsx
 * ─────────────────────────────────────
 * Reusable filter bar for all data tables.
 * Renders a debounced search input + optional status dropdown.
 *
 * Props:
 *   search          string
 *   onSearchChange  (val: string) => void   — already debounced by parent
 *   searchPlaceholder string
 *   statusValue     string
 *   onStatusChange  (val: string) => void
 *   statusOptions   [{ value: string, label: string }]  — omit to hide dropdown
 *   rightSlot       ReactNode  — optional extra content on the right
 */

const BORDER    = 'rgba(138,77,31,0.18)';
const MUTED     = '#9C8577';
const CHOCOLATE = '#3E2723';
const BRAND     = '#8A4D1F';

export default function TableFilters({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  statusValue,
  onStatusChange,
  statusOptions,
  rightSlot,
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-5 py-3"
      style={{ borderBottom: `1px solid ${BORDER}`, background: '#fff' }}
    >
      {/* Search input */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        {/* magnifier icon */}
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg outline-none transition-all"
          style={{
            border: `1px solid ${BORDER}`,
            color:  CHOCOLATE,
            background: '#faf8f5',
          }}
          onFocus={e => { e.target.style.borderColor = BRAND; e.target.style.boxShadow = `0 0 0 2px rgba(138,77,31,0.10)`; }}
          onBlur={e  => { e.target.style.borderColor = BORDER; e.target.style.boxShadow = 'none'; }}
        />
      </div>

      {/* Status dropdown */}
      {statusOptions && (
        <select
          value={statusValue}
          onChange={e => onStatusChange(e.target.value)}
          className="text-sm rounded-lg px-3 py-2 outline-none transition-all"
          style={{
            border:     `1px solid ${BORDER}`,
            color:      statusValue ? CHOCOLATE : MUTED,
            background: '#faf8f5',
            cursor:     'pointer',
          }}
          onFocus={e => { e.target.style.borderColor = BRAND; }}
          onBlur={e  => { e.target.style.borderColor = BORDER; }}
        >
          {statusOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {/* Optional right slot */}
      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}

