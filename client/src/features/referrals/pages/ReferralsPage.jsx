/**
 * features/referrals/pages/ReferralsPage.jsx
 * ────────────────────────────────────────────
 * Phase 2: Full referrals page with status filter + server-side pagination.
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';

import ReferralTable       from '@/features/referrals/ReferralTable';
import TableFilters        from '@/components/common/TableFilters';
import DataTablePagination from '@/components/common/DataTablePagination';
import Spinner    from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';

const STATUS_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'PENDING',    label: 'Pending'      },
  { value: 'SUCCESSFUL', label: 'Successful'   },
  { value: 'REJECTED',   label: 'Rejected'     },
];

export default function ReferralsPage({ user, isAdmin, onToast }) {
  const [data,    setData]    = useState([]);
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const debounceRef = useRef(null);
  const LIMIT = 10;

  const fetchReferrals = useCallback(async (pg, st, srch = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pg, limit: LIMIT,
        ...(st   ? { status: st }   : {}),
        ...(srch ? { search: srch } : {}),
      });
      const { data: res } = await api.get(`/referrals?${params}`);
      // Support both new { data, meta } and legacy { referrals } shapes
      setData(res.data ?? res.referrals ?? []);
      setMeta(res.meta ?? null);
    } catch {
      onToast({ type: 'error', message: '🔴 Failed to load referrals.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchReferrals(1, '', ''); }, [fetchReferrals]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchReferrals(1, status, val);
    }, 300);
  }
  function handleStatusChange(val) {
    setStatus(val); setPage(1); fetchReferrals(1, val, search);
  }
  function handlePageChange(pg) {
    setPage(pg); fetchReferrals(pg, status, search);
  }

  async function handleStatusChange_Referral(referralId, newStatus) {
    try {
      await api.patch(`/referrals/${referralId}/status`, { status: newStatus });
      fetchReferrals(page, status);
      onToast({
        type: 'success',
        message: `✅ Referral ${newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected'} successfully.`,
      });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Status update failed.' });
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
          searchPlaceholder="Search referrals…"
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
              isAdmin={isAdmin}
            />
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
          </>
        )}
      </section>
    </div>
  );
}
