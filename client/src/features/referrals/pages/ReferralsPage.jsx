/**
 * features/referrals/pages/ReferralsPage.jsx
 * ────────────────────────────────────────────
 * Referrals page with status filtering, search, pagination, details modal,
 * inline status updates, and delete confirmation.
 * Data fetching: TanStack Query (useQuery + useMutation)
 * Props: user, isAdmin, onToast
 */

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import useAppStore from '@/store/useAppStore';
import usePermissions from '@/features/auth/usePermissions';

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
const LIMIT     = 10;

const STATUS_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'PENDING',    label: 'Pending'      },
  { value: 'SUCCESSFUL', label: 'Successful'   },
  { value: 'REJECTED',   label: 'Rejected'     },
];

// ── Query key factory ────────────────────────────────────────────────────────
const referralKeys = {
  all:  () => ['referrals'],
  list: (page, status, search) => ['referrals', page, status, search],
};

export default function ReferralsPage({ user: propUser, isAdmin: propIsAdmin, onToast }) {
  const storeUser = useAppStore(s => s.user);
  const user = storeUser || propUser;
  const isAgent = Boolean(user?.agent_id);
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('manage_referrals');
  const queryClient = useQueryClient();

  // ── Filter / pagination state ─────────────────────────────────────────────
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const debounceRef = useRef(null);

  // ── UI-only state ─────────────────────────────────────────────────────────
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [isDetailsOpen,    setIsDetailsOpen]    = useState(false);
  const [deleteTarget,     setDeleteTarget]     = useState(null);

  // ── useQuery: fetch referrals ─────────────────────────────────────────────
  const { data: queryData, isLoading } = useQuery({
    queryKey: referralKeys.list(page, status, search),
    queryFn: async () => {
      const params = {
        page, limit: LIMIT,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      };
      const { data: res } = await api.get('/referrals', { params });
      return {
        referrals: res.data ?? res.referrals ?? [],
        meta:      res.meta ?? null,
      };
    },
    onError: () => {
      onToast?.({ type: 'error', message: '🔴 Failed to load referrals.' });
    },
  });

  const referrals = queryData?.referrals ?? [];
  const meta      = queryData?.meta      ?? null;

  // ── Invalidation helper ───────────────────────────────────────────────────
  function invalidateReferrals() {
    queryClient.invalidateQueries({ queryKey: referralKeys.all() });
  }

  // ── useMutation: Update referral status ───────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ referralId, newStatus }) =>
      api.patch(`/referrals/${referralId}/status`, { status: newStatus }),
    onSuccess: (_, { newStatus }) => {
      onToast?.({
        type: 'success',
        message: `✅ Referral ${newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected'} successfully.`,
      });
      invalidateReferrals();
    },
    onError: (err) => {
      onToast?.({ type: 'error', message: err.response?.data?.error ?? 'Status update failed.' });
    },
  });

  // ── useMutation: Delete referral ──────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (referral) => api.delete(`/referrals/${referral.id}`),
    onSuccess: (_, referral) => {
      onToast?.({ type: 'success', message: `🗑️ Referral #${referral.id} deleted successfully.` });
      setDeleteTarget(null);
      invalidateReferrals();
    },
    onError: (err) => {
      const msg = err.response?.status === 403
        ? 'Cannot delete successful financial records.'
        : (err.response?.data?.error ?? 'Failed to delete referral.');
      onToast?.({ type: 'error', message: msg });
      setDeleteTarget(null);
    },
  });

  // ── Filter / pagination handlers ─────────────────────────────────────────
  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(val); }, 300);
  }

  function handleStatusChange(val) { setStatus(val); setPage(1); }
  function handlePageChange(pg)    { setPage(pg); }

  // ── UI handlers ───────────────────────────────────────────────────────────
  function handleViewDetails(referral) {
    setSelectedReferral(referral);
    setIsDetailsOpen(true);
  }

  function handleDeleteRequest(referral) {
    if (referral.status === 'SUCCESSFUL') {
      onToast?.({ type: 'error', message: 'Cannot delete successful financial records.' });
      return;
    }
    setDeleteTarget(referral);
  }

  const deleting = deleteMutation.isPending;

  return (
    <div className="p-6">
      {/* ── View Details Modal ──────────────────────────────────────────────── */}
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
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Customer Name</span>
                <span className="font-semibold text-text-1">{selectedReferral.customer_name || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Customer Phone</span>
                <span className="font-mono text-text-2">{selectedReferral.customer_phone || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Agent Name</span>
                <span className="font-medium text-text-1">{selectedReferral.agent_name || '—'}</span>
              </div>
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
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Campaign Name</span>
                <span className="font-medium text-text-2">{selectedReferral.campaign_name || '—'}</span>
              </div>
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
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Status</span>
                <StatusPill status={selectedReferral.status} />
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Created Date</span>
                <span className="font-medium text-text-2">
                  {selectedReferral.created_at ? new Date(selectedReferral.created_at).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs font-semibold text-text-3 uppercase">Transaction ID</span>
                {selectedReferral.transaction_id ? (
                  <code className="font-mono text-xs text-text-1">{selectedReferral.transaction_id}</code>
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

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm bg-white p-6 rounded-xl border border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#3E2723]">Delete Referral?</DialogTitle>
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
              onClick={() => deleteMutation.mutate(deleteTarget)}
              className="bg-[#C0392B] hover:bg-[#a93226] text-white font-semibold"
            >
              {deleting && <Spinner small />}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main Section ───────────────────────────────────────────────────── */}
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
              {!isAgent ? 'All Referrals' : 'My Referrals'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              {!isAgent
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
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-sm" style={{ color: MUTED }}>Loading referrals…</p>
          </div>
        ) : referrals.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No referrals found"
            sub={status ? 'Try clearing the status filter.' : (!isAgent ? 'Referrals appear here once Temenos sends a webhook.' : 'No referrals registered under your code yet.')}
          />
        ) : (
          <>
            <ReferralTable
              referrals={referrals}
              loading={false}
              onStatusChange={(referralId, newStatus) => statusMutation.mutate({ referralId, newStatus })}
              onViewDetails={handleViewDetails}
              onDeleteRequest={handleDeleteRequest}
              canManage={canManage}
            />
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={isLoading} />
          </>
        )}
      </section>
    </div>
  );
}
