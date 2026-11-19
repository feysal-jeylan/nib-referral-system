/**
 * features/integration/pages/IntegrationLogsPage.jsx
 * ────────────────────────────────────────────────────
 * Enterprise Integration Logs management interface:
 *   - Search and status filtering with debounce and server-side pagination
 *   - View Payload modal with raw JSON displayed in dark code block
 *   - Retry failed webhooks (re-evaluates rules and updates existing log)
 *   - Delete log confirmation modal
 *
 * Data fetching: TanStack Query (useQuery + useMutation)
 * Props: user, isAdmin, onToast
 */

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Terminal, Copy, Check, Trash2, History } from 'lucide-react';
import api from '@/services/api';
import usePermissions from '@/features/auth/usePermissions';

import IntegrationLogsTable from '@/features/integration/IntegrationLogsTable';
import DataTablePagination  from '@/components/common/DataTablePagination';
import TableFilters         from '@/components/common/TableFilters';
import DataTableLayout      from '@/components/common/DataTableLayout';
import EmptyState           from '@/components/ui/EmptyState';
import { IntegrationStatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'RECEIVED',  label: 'Received'     },
  { value: 'PROCESSED', label: 'Processed'    },
  { value: 'FAILED',    label: 'Failed'       },
];

const LIMIT = 10;

// ── Query key factory (keeps invalidation calls consistent) ──────────────────
const logsKeys = {
  all:    () => ['integrationLogs'],
  list:   (page, status, search) => ['integrationLogs', page, status, search],
};

export default function IntegrationLogsPage({ user: _user, onToast }) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('manage_logs');
  const queryClient = useQueryClient();

  // ── Filter / pagination state (drives the query key) ─────────────────────
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const debounceRef = useRef(null);

  // ── UI-only state (modals, selections, clipboard) ─────────────────────────
  const [selectedLog,      setSelectedLog]      = useState(null);
  const [isPayloadOpen,    setIsPayloadOpen]    = useState(false);
  const [deleteTarget,     setDeleteTarget]     = useState(null);
  const [copied,           setCopied]           = useState(false);
  const [selectedIds,      setSelectedIds]      = useState([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isClearOldOpen,   setIsClearOldOpen]   = useState(false);

  // ── useQuery: fetch logs ──────────────────────────────────────────────────
  const { data: queryData, isLoading, isError } = useQuery({
    queryKey: logsKeys.list(page, status, search),
    queryFn: async () => {
      const params = {
        page,
        limit: LIMIT,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      };
      const { data: res } = await api.get('/integration/logs', { params });
      // Normalise the response into a consistent shape
      const total    = res.total ?? res.logs?.length ?? 0;
      const resLimit = res.limit ?? LIMIT;
      return {
        logs: res.logs ?? [],
        meta: {
          total,
          page:       res.page ?? page,
          limit:      resLimit,
          totalPages: Math.ceil(total / resLimit),
        },
      };
    },
    onError: () => {
      onToast?.({ type: 'error', message: '🔴 Failed to load integration logs.' });
    },
  });

  const logs = queryData?.logs ?? [];
  const meta = queryData?.meta ?? null;

  // ── Invalidation helper ───────────────────────────────────────────────────
  function invalidateLogs() {
    queryClient.invalidateQueries({ queryKey: logsKeys.all() });
  }

  // ── useMutation: Retry webhook ────────────────────────────────────────────
  const retryMutation = useMutation({
    mutationFn: (log) => api.post(`/integration/logs/${log.id}/retry`),
    onSuccess: (res, log) => {
      onToast?.({
        type: 'success',
        message: res.data?.message || `✅ Webhook #${log.id} retried successfully. Referral qualified.`,
      });
      invalidateLogs();
    },
    onError: (err) => {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error || '⚠️ Retry failed: event did not qualify.',
      });
      // Still refresh so the status reflects any partial update
      invalidateLogs();
    },
  });

  // ── useMutation: Delete single log ────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (log) => api.delete(`/integration/logs/${log.id}`),
    onSuccess: (_, log) => {
      onToast?.({
        type: 'success',
        message: `🗑️ Integration log #${log.id} deleted successfully.`,
      });
      setDeleteTarget(null);
      invalidateLogs();
    },
    onError: (err) => {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error || 'Failed to delete integration log.',
      });
    },
  });

  // ── useMutation: Bulk delete ──────────────────────────────────────────────
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => api.delete('/integration/logs/bulk', { data: { ids } }),
    onSuccess: (res) => {
      const count = selectedIds.length;
      onToast?.({
        type: 'success',
        message: `🗑️ ${res.data?.message || `${count} logs deleted successfully.`}`,
      });
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      invalidateLogs();
    },
    onError: (err) => {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error || 'Failed to bulk delete integration logs.',
      });
    },
  });

  // ── useMutation: Clear old logs (retention) ───────────────────────────────
  const clearOldMutation = useMutation({
    mutationFn: () => api.delete('/integration/logs/clear-old', { data: { days: 30 } }),
    onSuccess: (res) => {
      onToast?.({
        type: 'success',
        message: `${res.data?.count ?? 0} logs older than 30 days were deleted.`,
      });
      setIsClearOldOpen(false);
      setSelectedIds([]);
      invalidateLogs();
    },
    onError: (err) => {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error || 'Failed to clear old integration logs.',
      });
    },
  });

  // ── Filter / pagination handlers ─────────────────────────────────────────
  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(val);
    }, 300);
  }

  function handleStatusChange(val) {
    setStatus(val);
    setPage(1);
  }

  function handlePageChange(pg) {
    setPage(pg);
  }

  // ── UI: View Payload ──────────────────────────────────────────────────────
  function handleViewPayload(log) {
    setSelectedLog(log);
    setCopied(false);
    setIsPayloadOpen(true);
  }

  function handleCopyJson() {
    if (!selectedLog?.payload) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog.payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onToast?.({ type: 'info', message: '📋 Payload copied to clipboard.' });
  }

  // ── UI: Selection for Bulk Operations ────────────────────────────────────
  function handleSelectAll(checked) {
    if (checked) {
      const pageIds = logs.map((log) => log.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = new Set(logs.map((log) => log.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  }

  function handleSelectOne(id, checked) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)));
  }

  // ── Derived loading/busy flags from mutations ─────────────────────────────
  const retryingId   = retryMutation.isPending ? retryMutation.variables?.id : null;
  const deleting     = deleteMutation.isPending;
  const bulkDeleting = bulkDeleteMutation.isPending;
  const clearingOld  = clearOldMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <DataTableLayout
        cardTitle="Integration Logs"
        cardSubtitle="Temenos webhook events received by the Core Banking integration."
        totalRecords={meta?.total}
        recordLabel="event"
        cardActions={
          canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={() => setIsBulkDeleteOpen(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderColor: selectedIds.length > 0 ? '#C0392B' : 'rgba(138,77,31,0.2)',
                  color: selectedIds.length > 0 ? '#C0392B' : '#9C8577',
                  background: selectedIds.length > 0 ? '#FEF2F2' : '#fff',
                }}
              >
                <Trash2 size={14} className={selectedIds.length > 0 ? 'text-[#C0392B]' : ''} />
                <span>Delete Selected ({selectedIds.length})</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsClearOldOpen(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition shadow-2xs cursor-pointer hover:bg-stone-50"
                style={{
                  borderColor: 'rgba(138,77,31,0.28)',
                  color: '#8A4D1F',
                  background: '#fff',
                }}
              >
                <History size={14} style={{ color: '#8A4D1F' }} />
                <span>Clear 30+ Days</span>
              </Button>
            </>
          ) : null
        }
        filters={
          <TableFilters
            search={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Search by Transaction ID, Customer Name, or Error…"
            statusValue={status}
            onStatusChange={handleStatusChange}
            statusOptions={STATUS_OPTIONS}
          />
        }
        isLoading={isLoading}
        loadingText="Loading integration logs…"
        isEmpty={!isError && !isLoading && logs.length === 0}
        emptyState={
          <EmptyState
            icon="📡"
            title="No integration logs found"
            sub={status || search ? 'Try clearing the filters.' : 'Webhook events from Temenos will appear here.'}
          />
        }
        pagination={
          !isLoading && logs.length > 0 ? (
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={isLoading} />
          ) : null
        }
      >
        {/* Error banner */}
        {isError && !isLoading && (
          <div className="px-6 py-4 text-sm text-[#C0392B]">
            Failed to load integration logs. Please try refreshing.
          </div>
        )}
        {/* IntegrationLogsTable owns its own thead/tbody — no columns prop passed */}
        <IntegrationLogsTable
          logs={logs}
          loading={false}
          canManage={canManage}
          onViewPayload={handleViewPayload}
          onRetry={(log) => retryMutation.mutate(log)}
          onDeleteRequest={(log) => setDeleteTarget(log)}
          retryingId={retryingId}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelectOne={handleSelectOne}
        />
      </DataTableLayout>

      {/* ── View Payload Modal ──────────────────────────────────────────────── */}
      <Dialog open={isPayloadOpen} onOpenChange={setIsPayloadOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col bg-white border border-[#E5DED6] shadow-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#E5DED6] bg-[#FAF8F5]">
            <DialogTitle className="text-base font-bold text-[#3E2723] flex items-center gap-2">
              <Terminal size={18} className="text-[#8A4D1F]" />
              Integration Event Details
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9C8577]">
              Raw webhook event details received from Temenos Core Banking.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {/* Meta Row: TID & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9C8577] mb-1">
                  Transaction ID
                </p>
                <code className="font-mono text-xs bg-[#FAF8F5] border border-[#E5DED6] text-[#8A4D1F] px-2 py-1 rounded font-semibold break-all">
                  {selectedLog?.transaction_id}
                </code>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9C8577] mb-1">
                  Status
                </p>
                {selectedLog && <IntegrationStatusPill status={selectedLog.status} />}
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9C8577] mb-1">
                Timestamp
              </p>
              <p className="text-xs text-[#3E2723] font-medium">
                {selectedLog?.created_at ? new Date(selectedLog.created_at).toLocaleString() : '—'}
              </p>
            </div>

            {/* Error / Failure reason if present */}
            {selectedLog?.error_message && (
              <div className="p-3 rounded-lg bg-[#FDF3F0] border border-[#E8A090] border-l-4 border-l-[#C0392B]">
                <p className="text-[11px] font-bold text-[#7A2518] uppercase tracking-wider mb-0.5">
                  Rejection Reason / Error
                </p>
                <p className="text-xs text-[#7A2518] leading-relaxed">
                  {selectedLog.error_message}
                </p>
              </div>
            )}

            {/* Raw JSON Payload */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9C8577]">
                  Raw JSON Payload
                </p>
                {selectedLog?.payload && (
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="inline-flex items-center gap-1 text-[11px] text-[#8A4D1F] hover:text-[#5C3010] font-semibold transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check size={12} className="text-[#1A5C34]" />
                        <span className="text-[#1A5C34]">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <pre className="bg-[#1E1E1E] text-[#D4D4D4] p-4 rounded-md font-mono text-xs overflow-auto max-h-[260px] border border-[#333333] shadow-inner select-text">
                {selectedLog?.payload
                  ? JSON.stringify(selectedLog.payload, null, 2)
                  : '// No payload recorded'}
              </pre>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-[#E5DED6] bg-[#FAF8F5]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPayloadOpen(false)}
              className="border-[#D7CCC8] text-[#3E2723] hover:bg-[#F5EDE6]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md bg-white border border-[#E5DED6] shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#C0392B]">
              Delete Integration Log
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9C8577] mt-1">
              Are you sure you want to delete this log?
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="py-3 text-xs text-[#3E2723] space-y-1.5 bg-[#FAF8F5] p-3 rounded-lg border border-[#E5DED6]">
              <p>
                <strong className="text-[#9C8577]">Transaction ID:</strong>{' '}
                <code className="font-mono text-[#8A4D1F] font-semibold">{deleteTarget.transaction_id}</code>
              </p>
              <p>
                <strong className="text-[#9C8577]">Customer:</strong>{' '}
                <span>{deleteTarget.payload?.customer_name || '—'}</span>
              </p>
              <p>
                <strong className="text-[#9C8577]">Status:</strong>{' '}
                <span className="font-semibold">{deleteTarget.status}</span>
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="border-[#D7CCC8] text-[#3E2723] hover:bg-[#F5EDE6]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => deleteMutation.mutate(deleteTarget)}
              className="bg-[#C0392B] hover:bg-[#A93226] text-white font-semibold"
            >
              {deleting ? 'Deleting…' : 'Delete Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Confirmation Modal ────────────────────────────────── */}
      <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-[#E5DED6] shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#C0392B] flex items-center gap-2">
              <Trash2 size={18} className="text-[#C0392B]" />
              Bulk Delete Integration Logs
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9C8577] mt-1">
              Are you sure you want to delete {selectedIds.length} selected log{selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkDeleting}
              onClick={() => setIsBulkDeleteOpen(false)}
              className="border-[#D7CCC8] text-[#3E2723] hover:bg-[#F5EDE6]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={bulkDeleting}
              onClick={() => bulkDeleteMutation.mutate(selectedIds)}
              className="bg-[#C0392B] hover:bg-[#A93226] text-white font-semibold"
            >
              {bulkDeleting ? 'Deleting…' : `Delete (${selectedIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Clear Old Logs Confirmation Modal ─────────────────────────────── */}
      <Dialog open={isClearOldOpen} onOpenChange={setIsClearOldOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-[#E5DED6] shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#C0392B] flex items-center gap-2">
              <History size={18} className="text-[#8A4D1F]" />
              Clear Old Logs?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9C8577] mt-1">
              Are you sure you want to permanently delete all integration logs older than 30 days? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={clearingOld}
              onClick={() => setIsClearOldOpen(false)}
              className="border-[#D7CCC8] text-[#3E2723] hover:bg-[#F5EDE6]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={clearingOld}
              onClick={() => clearOldMutation.mutate()}
              className="bg-[#C0392B] hover:bg-[#A93226] text-white font-semibold"
            >
              {clearingOld ? 'Clearing…' : 'Clear Logs'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
