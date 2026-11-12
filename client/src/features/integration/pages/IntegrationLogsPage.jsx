/**
 * features/integration/pages/IntegrationLogsPage.jsx
 * ────────────────────────────────────────────────────
 * Phase 2: Full integration logs page with status filter + server-side pagination.
 *
 * Props: user, isAdmin, onToast
 *
 * Backend returns: { total, page, limit, logs: [...] }  (NOT { data, meta })
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';

import IntegrationLogsTable from '@/features/integration/IntegrationLogsTable';
import DataTablePagination  from '@/components/common/DataTablePagination';
import TableFilters         from '@/components/common/TableFilters';

const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';

const STATUS_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'RECEIVED',   label: 'Received'     },
  { value: 'PROCESSED',  label: 'Processed'    },
  { value: 'FAILED',     label: 'Failed'       },
];

const LIMIT = 10;

export default function IntegrationLogsPage({ user, isAdmin, onToast }) {
  const [data,    setData]    = useState([]);
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const debounceRef = useRef(null);

  const fetchLogs = useCallback(async (pg, st, srch = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pg, limit: LIMIT,
        ...(st   ? { status: st }   : {}),
        ...(srch ? { search: srch } : {}),
      });
      const { data: res } = await api.get(`/integration/logs?${params}`);

      // Backend returns legacy shape: { total, page, limit, logs: [...] }
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
      onToast({ type: 'error', message: '🔴 Failed to load integration logs.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchLogs(1, '', ''); }, [fetchLogs]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLogs(1, status, val);
    }, 300);
  }
  function handleStatusChange(val) {
    setStatus(val); setPage(1); fetchLogs(1, val, search);
  }
  function handlePageChange(pg) {
    setPage(pg); fetchLogs(pg, status, search);
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
          searchPlaceholder="Search logs…"
          statusValue={status}
          onStatusChange={handleStatusChange}
          statusOptions={STATUS_OPTIONS}
        />

        {/* Table / pagination */}
        <IntegrationLogsTable logs={data} loading={loading} />

        {!loading && data.length > 0 && (
          <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
        )}
      </section>
    </div>
  );
}
