/**
 * features/agents/pages/AgentsPage.jsx
 * ──────────────────────────────────────
 * Phase 2: Full agents page with:
 *   - AgentForm (admin only)
 *   - Debounced search + status filter
 *   - Server-side paginated AgentTable
 *   - Approve / Reject for PENDING agents (replaces the old Dashboard section)
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';

import AgentForm  from '@/features/agents/AgentForm';
import AgentTable from '@/features/agents/AgentTable';
import TableFilters        from '@/components/common/TableFilters';
import DataTablePagination from '@/components/common/DataTablePagination';
import Spinner    from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';

const STATUS_OPTIONS = [
  { value: '',         label: 'All Statuses' },
  { value: 'APPROVED', label: 'Approved'     },
  { value: 'PENDING',  label: 'Pending'      },
  { value: 'REJECTED', label: 'Rejected'     },
];

export default function AgentsPage({ user, isAdmin, onToast }) {
  const [data,     setData]     = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [actioning, setActioning] = useState(new Set());

  // Filters
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [page,     setPage]     = useState(1);
  const LIMIT = 10;

  // Debounce ref
  const debounceRef = useRef(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAgents = useCallback(async (pg, srch, st) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  pg,
        limit: LIMIT,
        ...(srch ? { search: srch } : {}),
        ...(st   ? { status: st   } : {}),
      });
      const { data: res } = await api.get(`/agents?${params}`);
      setData(res.data   ?? []);
      setMeta(res.meta   ?? null);
    } catch {
      onToast({ type: 'error', message: '🔴 Failed to load agents.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  // Initial load
  useEffect(() => { fetchAgents(1, '', ''); }, [fetchAgents]);

  // Search debounce (300 ms)
  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchAgents(1, val, status);
    }, 300);
  }

  function handleStatusChange(val) {
    setStatus(val);
    setPage(1);
    fetchAgents(1, search, val);
  }

  function handlePageChange(pg) {
    setPage(pg);
    fetchAgents(pg, search, status);
  }

  // ── Approve / Reject ──────────────────────────────────────────────────────
  async function handleApprove(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const { data: res } = await api.patch(`/agents/${id}/approve`);
      fetchAgents(page, search, status);
      onToast({ type: 'success', message: `✅ "${name}" approved — Code: ${res.referral_code}` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Approval failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function handleReject(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      await api.patch(`/agents/${id}/reject`);
      fetchAgents(page, search, status);
      onToast({ type: 'success', message: `Application from "${name}" has been rejected.` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Rejection failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  function handleAgentCreated() { fetchAgents(1, search, status); setPage(1); }

  const pendingCount = meta ? undefined : 0; // shown in filter badge only

  return (
    <div className="p-6 space-y-6">

      {/* ── Admin: Register Agent ───────────────────────────────────────── */}
      {isAdmin && (
        <section
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <AgentForm onCreated={handleAgentCreated} onToast={onToast} />
        </section>
      )}

      {/* ── Agent Table Card ────────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {/* Card header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
              {isAdmin ? 'All Agents' : 'My Profile'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              {isAdmin
                ? 'Search, filter, and manage all registered referral agents.'
                : 'Your agent profile and referral activity.'}
            </p>
          </div>
          {meta && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: '#FAF8F5', color: MUTED }}
            >
              {meta.total} agent{meta.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filters (admin only) */}
        {isAdmin && (
          <TableFilters
            search={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Search by name, phone, email or code…"
            statusValue={status}
            onStatusChange={handleStatusChange}
            statusOptions={STATUS_OPTIONS}
          />
        )}

        {/* Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-sm" style={{ color: MUTED }}>Loading agents…</p>
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="No agents found"
            sub={search || status ? 'Try clearing the filters.' : 'Register your first agent above.'}
          />
        ) : (
          <>
            <AgentTable
              agents={data}
              loading={false}
              isAdmin={isAdmin}
              actioning={actioning}
              onApprove={handleApprove}
              onReject={handleReject}
            />
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
          </>
        )}
      </section>
    </div>
  );
}
