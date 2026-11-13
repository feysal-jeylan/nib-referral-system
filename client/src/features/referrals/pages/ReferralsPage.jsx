/**
 * features/referrals/pages/ReferralsPage.jsx
 * ────────────────────────────────────────────
 * Referrals page with:
 *   - Status filtering & search with debounce + server-side pagination
 *   - Inline Approve / Reject for PENDING applications
 *   - Actions dropdown with:
 *       • View Details (Customer, Agent, Campaign, Code, Date, Transaction ID)
 *       • Delete (with 403 guard on SUCCESSFUL financial records)
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';

import ReferralTable       from '@/features/referrals/ReferralTable';
import TableFilters        from '@/components/common/TableFilters';
import DataTablePagination from '@/components/common/DataTablePagination';
import Spinner             from '@/components/ui/Spinner';
import EmptyState          from '@/components/ui/EmptyState';
import { StatusPill }      from '@/components/ui/Badge';
import { Button }          from '@/components/ui/button';
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
  { value: '',           label: 'All Statuses' },
  { value: 'PENDING',    label: 'Pending'      },
  { value: 'SUCCESSFUL', label: 'Successful'   },
  { value: 'REJECTED',   label: 'Rejected'     },
];

export default function ReferralsPage({ user: _user, isAdmin, onToast }) {
  const [data,    setData]    = useState([]);
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const debounceRef = useRef(null);
  const LIMIT = 10;

  // Modal states
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [isDetailsOpen,    setIsDetailsOpen]    = useState(false);
  const [deleteTarget,     setDeleteTarget]     = useState(null);
  const [deleting,         setDeleting]         = useState(false);

  const fetchReferrals = useCallback(async (pg, st, srch = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pg, limit: LIMIT,
        ...(st   ? { status: st }   : {}),
        ...(srch ? { search: srch } : {}),
      });
      const { data: res } = await api.get(`/referrals?${params}`);
      setData(res.data ?? res.referrals ?? []);
      setMeta(res.meta ?? null);
    } catch {
      onToast?.({ type: 'error', message: '🔴 Failed to load referrals.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    fetchReferrals(1, '', '');
  }, [fetchReferrals]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchReferrals(1, status, val);
    }, 300);
  }

  function handleStatusChange(val) {
    setStatus(val);
    setPage(1);
    fetchReferrals(1, val, search);
  }

  function handlePageChange(pg) {
    setPage(pg);
    fetchReferrals(pg, status, search);
  }

  async function handleStatusChange_Referral(referralId, newStatus) {
    try {
      await api.patch(`/referrals/${referralId}/status`, { status: newStatus });
      fetchReferrals(page, status, search);
      onToast?.({
        type: 'success',
        message: `✅ Referral ${newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected'} successfully.`,
      });
    } catch (err) {
      onToast?.({ type: 'error', message: err.response?.data?.error ?? 'Status update failed.' });
    }
  }

  // ── View Details Modal ────────────────────────────────────────────────────
  function handleViewDetails(referral) {
    setSelectedReferral(referral);
    setIsDetailsOpen(true);
  }

  // ── Delete Action with Guard ──────────────────────────────────────────────
  function handleDeleteRequest(referral) {
    if (referral.status === 'SUCCESSFUL') {
      onToast?.({ type: 'error', message: 'Cannot delete successful financial records.' });
      return;
    }
    setDeleteTarget(referral);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/referrals/${deleteTarget.id}`);
      onToast?.({
        type: 'success',
        message: `🗑️ Referral #${deleteTarget.id} deleted successfully.`,
      });
      setDeleteTarget(null);
      fetchReferrals(page, status, search);
    } catch (err) {
      const msg = err.response?.status === 403
        ? 'Cannot delete successful financial records.'
        : (err.response?.data?.error ?? 'Failed to delete referral.');
      onToast?.({ type: 'error', message: msg });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6">
      {/* ── View Details Modal ─────────────────────────────────────────────── */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-border shadow-xl">
          <DialogHeader className="mb-3">
            <DialogTitle className="text-base font-bold text-text-1">Referral Details</DialogTitle>
            <DialogDescription className="text-xs text-text-3">
              Detailed breakdown of customer referral and campaign attribution.
            </DialogDescription>
          </DialogHeader>

          {selectedReferral && (
            <div className="space-y-3 py-2 text-sm">
              {/* Customer Name */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Customer Name</span>
                <span className="font-semibold text-text-1">{selectedReferral.customer_name || '—'}</span>
              </div>

              {/* Customer Phone */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Customer Phone</span>
                <span className="font-mono text-text-2">{selectedReferral.customer_phone || '—'}</span>
              </div>

              {/* Agent Name */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Agent Name</span>
                <span className="font-medium text-text-1">{selectedReferral.agent_name || '—'}</span>
              </div>

              {/* Referral Code */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Referral Code</span>
                {selectedReferral.referral_code ? (
                  <code className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-brand-light text-brand">
                    {selectedReferral.referral_code}
                  </code>
                ) : (
                  <span className="text-xs text-text-3">—</span>
                )}
              </div>

              {/* Campaign Name */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Campaign Name</span>
                <span className="font-medium text-text-2">{selectedReferral.campaign_name || '—'}</span>
              </div>

              {/* Campaign Code */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Campaign Code</span>
                {selectedReferral.campaign_code ? (
                  <code className="font-mono text-xs px-2 py-0.5 rounded bg-[#FAF8F5] border border-border text-[#4A3728] font-semibold">
                    {selectedReferral.campaign_code}
                  </code>
                ) : (
                  <span className="text-xs text-text-3">—</span>
                )}
              </div>

              {/* Status */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Status</span>
                <StatusPill status={selectedReferral.status} />
              </div>

              {/* Created Date */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Created Date</span>
                <span className="font-medium text-text-2">
                  {selectedReferral.created_at ? new Date(selectedReferral.created_at).toLocaleString() : '—'}
                </span>
              </div>

              {/* Transaction ID */}
              <div className="flex justify-between items-center py-2">
                <span className="text-xs font-semibold text-text-3 uppercase">Transaction ID</span>
                {selectedReferral.transaction_id ? (
                  <code className="font-mono text-xs text-text-1">
                    {selectedReferral.transaction_id}
                  </code>
                ) : (
                  <span className="text-xs text-text-3">—</span>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setIsDetailsOpen(false)}
              className="border-border text-text-2 hover:bg-bg"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm bg-white p-6 rounded-xl border border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#3E2723]">
              Delete Referral?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9C8577]">
              Are you sure you want to delete referral #{deleteTarget?.id} for customer{' '}
              <span className="font-semibold text-[#1C0F05]">"{deleteTarget?.customer_name}"</span>?
              Successful financial records cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="border-border text-text-2 hover:bg-bg"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDeleteConfirm}
              className="bg-[#C0392B] hover:bg-[#a93226] text-white font-semibold"
            >
              {deleting && <Spinner small />}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main Section ─────────────────────────────────────────────────── */}
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
              {isAdmin ? 'All Referrals' : 'My Referrals'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              {isAdmin
                ? 'All referrals submitted through the Core Banking integration.'
                : 'Customers you have referred through Temenos.'}
            </p>
          </div>
          {meta && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#FAF8F5', color: MUTED }}>
              {meta.total} referral{meta.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filters */}
        <TableFilters
          search={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search referrals by customer, phone, code or campaign…"
          statusValue={status}
          onStatusChange={handleStatusChange}
          statusOptions={STATUS_OPTIONS}
        />

        {/* Table / states */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-sm" style={{ color: MUTED }}>Loading referrals…</p>
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No referrals found"
            sub={status ? 'Try clearing the status filter.' : (isAdmin ? 'Referrals appear here once Temenos sends a webhook.' : 'No referrals registered under your code yet.')}
          />
        ) : (
          <>
            <ReferralTable
              referrals={data}
              loading={false}
              onStatusChange={handleStatusChange_Referral}
              onViewDetails={handleViewDetails}
              onDeleteRequest={handleDeleteRequest}
              isAdmin={isAdmin}
            />
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
          </>
        )}
      </section>
    </div>
  );
}
