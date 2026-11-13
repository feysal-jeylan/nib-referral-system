/**
 * features/integration/pages/IntegrationLogsPage.jsx
 * ────────────────────────────────────────────────────
 * Enterprise Integration Logs management interface:
 *   - Search and status filtering with debounce and server-side pagination
 *   - View Payload modal with raw JSON displayed in dark code block
 *   - Retry failed webhooks (re-evaluates rules and updates existing log)
 *   - Delete log confirmation modal
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import api from '@/services/api';

import IntegrationLogsTable from '@/features/integration/IntegrationLogsTable';
import DataTablePagination  from '@/components/common/DataTablePagination';
import TableFilters         from '@/components/common/TableFilters';
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

const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'RECEIVED',  label: 'Received'     },
  { value: 'PROCESSED', label: 'Processed'    },
  { value: 'FAILED',    label: 'Failed'       },
];

const LIMIT = 10;

export default function IntegrationLogsPage({ user: _user, isAdmin = true, onToast }) {
  const [data,       setData]       = useState([]);
  const [meta,       setMeta]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [status,     setStatus]     = useState('');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const debounceRef = useRef(null);

  // Modal & action states
  const [selectedLog,   setSelectedLog]   = useState(null);
  const [isPayloadOpen, setIsPayloadOpen] = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [retryingId,    setRetryingId]    = useState(null);
  const [copied,        setCopied]        = useState(false);

  const fetchLogs = useCallback(async (pg, st, srch = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pg, limit: LIMIT,
        ...(st   ? { status: st }   : {}),
        ...(srch ? { search: srch } : {}),
      });
      const { data: res } = await api.get(`/integration/logs?${params}`);

      setData(res.logs ?? []);
      const total    = res.total ?? res.logs?.length ?? 0;
      const resLimit = res.limit ?? LIMIT;
      setMeta({
        total,
        page:       res.page ?? pg,
        limit:      resLimit,
        totalPages: Math.ceil(total / resLimit),
      });
    } catch {
      onToast?.({ type: 'error', message: '🔴 Failed to load integration logs.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    fetchLogs(1, '', '');
  }, [fetchLogs]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLogs(1, status, val);
    }, 300);
  }

  function handleStatusChange(val) {
    setStatus(val);
    setPage(1);
    fetchLogs(1, val, search);
  }

  function handlePageChange(pg) {
    setPage(pg);
    fetchLogs(pg, status, search);
  }

  // ── Action: View Payload ──────────────────────────────────────────────────
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

  // ── Action: Retry Webhook ─────────────────────────────────────────────────
  async function handleRetry(log) {
    setRetryingId(log.id);
    try {
      const { data: res } = await api.post(`/integration/logs/${log.id}/retry`);
      onToast?.({
        type: 'success',
        message: res.message || `✅ Webhook #${log.id} retried successfully. Referral qualified.`,
      });
      fetchLogs(page, status, search);
    } catch (err) {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error || '⚠️ Retry failed: event did not qualify.',
      });
      fetchLogs(page, status, search);
    } finally {
      setRetryingId(null);
    }
  }

  // ── Action: Delete Log ────────────────────────────────────────────────────
  function handleDeleteRequest(log) {
    setDeleteTarget(log);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/integration/logs/${deleteTarget.id}`);
      onToast?.({
        type: 'success',
        message: `🗑️ Integration log #${deleteTarget.id} deleted successfully.`,
      });
      setDeleteTarget(null);
      fetchLogs(page, status, search);
    } catch (err) {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error || 'Failed to delete integration log.',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6">
      <section
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
              Integration Logs
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Temenos webhook events received by the Core Banking integration.
            </p>
          </div>
          {meta && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: '#FAF8F5', color: MUTED }}
            >
              {meta.total} event{meta.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filters */}
        <TableFilters
          search={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search by Transaction ID, Customer Name, or Error…"
          statusValue={status}
          onStatusChange={handleStatusChange}
          statusOptions={STATUS_OPTIONS}
        />

        {/* Table */}
        <IntegrationLogsTable
          logs={data}
          loading={loading}
          isAdmin={isAdmin}
          onViewPayload={handleViewPayload}
          onRetry={handleRetry}
          onDeleteRequest={handleDeleteRequest}
          retryingId={retryingId}
        />

        {/* Pagination */}
        {!loading && data.length > 0 && (
          <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
        )}
      </section>

      {/* ── View Payload Modal ────────────────────────────────────────────── */}
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

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
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
              onClick={handleDeleteConfirm}
              className="bg-[#C0392B] hover:bg-[#A93226] text-white font-semibold"
            >
              {deleting ? 'Deleting…' : 'Delete Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
