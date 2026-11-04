/**
 * features/integration/IntegrationLogsTable.jsx
 * ───────────────────────────────────────────────
 * Read-only table of Temenos webhook events.
 * Pure display component — no fetch calls.
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
      <div className="state-box">
        <Spinner />
        <p>Loading integration logs…</p>
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
    <div className="table-wrap">
      <table className="data-table" aria-label="Temenos integration log">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Transaction ID</th>
            <th scope="col">Customer Name</th>
            <th scope="col">Status</th>
            <th scope="col">Reason / Error</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr key={log.id} className="data-row">
              <td className="td--index">{i + 1}</td>
              <td><code className="code-chip">{log.transaction_id}</code></td>
              <td className="td--name">{log.payload?.customer_name ?? '—'}</td>
              <td><IntegrationStatusPill status={log.status} /></td>
              <td style={{ color: 'var(--text-3)', fontSize: '12px', maxWidth: '220px' }}>
                {log.error_message
                  ? <span className="log-error-msg" title={log.error_message}>{log.error_message}</span>
                  : <span style={{ color: 'var(--text-3)' }}>—</span>
                }
              </td>
              <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {new Date(log.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
