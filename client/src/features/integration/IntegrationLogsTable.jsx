/**
 * features/integration/IntegrationLogsTable.jsx
 * ───────────────────────────────────────────────
 * Table of Temenos webhook events with:
 *   - Transaction ID, Customer Name, Status, Reason/Error, Date
 *   - Actions column (Admin only) with shadcn DropdownMenu:
 *       • View Payload
 *       • Retry Webhook (only if status === 'FAILED')
 *       • Delete Log
 *
 * Props:
 *   logs            {object[]}
 *   loading         {boolean}
 *   isAdmin         {boolean}
 *   onViewPayload   {(log: object) => void}
 *   onRetry         {(log: object) => Promise<void>}
 *   onDeleteRequest {(log: object) => void}
 *   retryingId      {number|string|null}
 */

import { MoreVertical, RotateCcw, Trash2, Eye } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { IntegrationStatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function IntegrationLogsTable({
  logs,
  loading,
  isAdmin = true,
  onViewPayload,
  onRetry,
  onDeleteRequest,
  retryingId = null,
}) {
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
    <div className="overflow-x-auto w-full">
      <table className="min-w-[850px] w-full text-sm border-collapse" aria-label="Temenos integration log">
        <thead>
          <tr className="bg-panel border-b border-border">
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Transaction ID</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Customer Name</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Status</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Reason / Error</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Date</th>
            {isAdmin && (
              <th scope="col" className="px-6 py-3 text-right text-[11px] font-semibold text-text-3 uppercase tracking-widest">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => {
            const isRetrying = retryingId === log.id;
            return (
              <tr key={log.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                <td className="px-6 py-4 text-text-3 text-xs tabular-nums">{i + 1}</td>
                <td className="px-6 py-4">
                  <code className="font-mono text-xs bg-brand-light text-brand px-2 py-0.5 rounded font-semibold">
                    {log.transaction_id}
                  </code>
                </td>
                <td className="px-6 py-4 text-text-1 font-medium">{log.payload?.customer_name ?? '—'}</td>
                <td className="px-6 py-4"><IntegrationStatusPill status={log.status} /></td>
                <td className="px-6 py-4 text-text-3 text-xs max-w-[240px]">
                  {log.error_message ? (
                    <span title={log.error_message} className="line-clamp-2 text-[#7A2518]">
                      {log.error_message}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-text-2 text-xs tabular-nums whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                {isAdmin && (
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRetrying}
                          className="h-8 w-8 p-0 text-text-3 hover:text-text-1 hover:bg-panel rounded-md"
                          aria-label={`Actions for log #${log.id}`}
                        >
                          {isRetrying ? (
                            <span className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-white border border-[#E5DED6] shadow-md z-50">
                        <DropdownMenuItem
                          onClick={() => onViewPayload?.(log)}
                          className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723] flex items-center gap-2"
                        >
                          <Eye size={14} className="text-[#8A4D1F]" />
                          <span>View Payload</span>
                        </DropdownMenuItem>

                        {log.status === 'FAILED' && (
                          <DropdownMenuItem
                            onClick={() => onRetry?.(log)}
                            disabled={isRetrying}
                            className="cursor-pointer text-[#8A4D1F] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#8A4D1F] flex items-center gap-2 font-medium"
                          >
                            <RotateCcw size={14} className="text-[#8A4D1F]" />
                            <span>Retry Webhook</span>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDeleteRequest?.(log)}
                          className="cursor-pointer text-[#C0392B] focus:text-[#C0392B] focus:bg-destructive/10 flex items-center gap-2"
                        >
                          <Trash2 size={14} className="text-[#C0392B]" />
                          <span>Delete Log</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
