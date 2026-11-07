/**
 * features/integration/IntegrationLogsTable.jsx
 * ───────────────────────────────────────────────
 * Read-only table of Temenos webhook events.
 * Pure display component — no fetch calls.
 * Pure Tailwind — no App.css dependency.
 *
 * Props:
 *   logs    {object[]}
 *   loading {boolean}
 */
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { IntegrationStatusPill } from '@/components/ui/Badge';

export default function IntegrationLogsTable({ logs, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spinner />
        <p className="text-text-3 text-sm">Loading integration logs…</p>
      </div>
    );
  }
  if (!logs.length) {
    return (
      <EmptyState
        icon="📡"
        title="No integration events yet"
        sub="Events appear here when Temenos sends a webhook to POST /api/integration/account-opened."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" aria-label="Temenos integration log">
        <thead>
          <tr className="bg-panel border-b border-border">
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Transaction ID</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Customer Name</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Status</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Reason / Error</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Date</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr key={log.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
              <td className="px-6 py-4 text-text-3 text-xs tabular-nums">{i + 1}</td>
              <td className="px-6 py-4">
                <code className="font-mono text-xs bg-brand-light text-brand px-2 py-0.5 rounded">
                  {log.transaction_id}
                </code>
              </td>
              <td className="px-6 py-4 text-text-1 font-medium">{log.payload?.customer_name ?? '—'}</td>
              <td className="px-6 py-4"><IntegrationStatusPill status={log.status} /></td>
              <td className="px-6 py-4 text-text-3 text-xs max-w-[220px]">
                {log.error_message
                  ? <span title={log.error_message} className="line-clamp-2">{log.error_message}</span>
                  : <span>—</span>
                }
              </td>
              <td className="px-6 py-4 text-text-2 text-xs tabular-nums whitespace-nowrap">
                {new Date(log.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
