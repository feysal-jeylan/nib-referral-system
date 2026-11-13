/**
 * features/agents/pages/AgentsPage.jsx
 * ──────────────────────────────────────
 * Enterprise Agent Management interface for Admins:
 *   - Page header with "+ Register Agent" modal trigger
 *   - Register Agent Dialog (shadcn Dialog) hosting AgentForm
 *   - Search and status filtering with debounce and pagination
 *   - Data table with inline Approve / Reject for PENDING applications
 *   - Three-dot DropdownMenu actions on each row:
 *       • View Details (expanded modal with Date Joined, Referrals, Tier)
 *       • Edit Profile (opens EditAgentModal with PUT /api/agents/:id)
 *       • Suspend / Activate Agent (PATCH /suspend or /activate)
 *       • Delete Agent (Confirmation modal with 409 referral protection)
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import api from '@/services/api';

import AgentForm           from '@/features/agents/AgentForm';
import EditAgentModal      from '@/features/agents/EditAgentModal';
import TableFilters        from '@/components/common/TableFilters';
import DataTablePagination from '@/components/common/DataTablePagination';
import Spinner             from '@/components/ui/Spinner';
import EmptyState          from '@/components/ui/EmptyState';
import { RewardBadge, AgentStatusPill } from '@/components/ui/Badge';
import { Button }          from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';
const IVORY     = '#FAF8F5';

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'APPROVED',  label: 'Approved'     },
  { value: 'PENDING',   label: 'Pending'      },
  { value: 'SUSPENDED', label: 'Suspended'    },
  { value: 'REJECTED',  label: 'Rejected'     },
];

export default function AgentsPage({ _user, isAdmin, onToast }) {
  const [data,      setData]      = useState([]);
  const [meta,      setMeta]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [actioning, setActioning] = useState(new Set());

  // Modal states
  const [isFormOpen,     setIsFormOpen]     = useState(false);
  const [isDetailsOpen,  setIsDetailsOpen]  = useState(false);
  const [selectedAgent,  setSelectedAgent]  = useState(null);
  const [isEditOpen,     setIsEditOpen]     = useState(false);
  const [agentToEdit,    setAgentToEdit]    = useState(null);
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [deleting,       setDeleting]       = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page,   setPage]   = useState(1);
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
      const rows = Array.isArray(res) ? res : (res.data ?? []);
      setData(rows);
      setMeta(res.meta ?? null);
    } catch {
      onToast?.({ type: 'error', message: '🔴 Failed to load agents.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  // Initial load
  useEffect(() => {
    fetchAgents(1, '', '');
  }, [fetchAgents]);

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
      onToast?.({ type: 'success', message: `✅ "${name}" approved — Code: ${res.referral_code}` });
    } catch (err) {
      onToast?.({ type: 'error', message: err.response?.data?.error ?? 'Approval failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function handleReject(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      await api.patch(`/agents/${id}/reject`);
      fetchAgents(page, search, status);
      onToast?.({ type: 'success', message: `Application from "${name}" has been rejected.` });
    } catch (err) {
      onToast?.({ type: 'error', message: err.response?.data?.error ?? 'Rejection failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  function handleAgentCreated() {
    fetchAgents(1, search, status);
    setPage(1);
  }

  // ── Action 1: View Details ────────────────────────────────────────────────
  function handleViewDetails(agent) {
    setSelectedAgent(agent);
    setIsDetailsOpen(true);
  }

  // ── Action 2: Edit Profile ────────────────────────────────────────────────
  function handleEditProfile(agent) {
    setAgentToEdit(agent);
    setIsEditOpen(true);
  }

  function handleEditSuccess() {
    fetchAgents(page, search, status);
  }

  // ── Action 3: Suspend / Activate ──────────────────────────────────────────
  async function handleToggleSuspend(agent) {
    const isApproved = agent.status === 'APPROVED';
    const endpoint   = isApproved ? `/agents/${agent.id}/suspend` : `/agents/${agent.id}/activate`;
    const actionName = isApproved ? 'suspended' : 'activated';
    setActioning(prev => new Set(prev).add(agent.id));
    try {
      await api.patch(endpoint);
      fetchAgents(page, search, status);
      onToast?.({
        type: 'success',
        message: `✅ Agent "${agent.name}" has been ${actionName}.`,
      });
    } catch (err) {
      onToast?.({
        type: 'error',
        message: err.response?.data?.error ?? `Failed to ${isApproved ? 'suspend' : 'activate'} agent.`,
      });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(agent.id); return s; });
    }
  }

  // ── Action 4: Delete Agent (with 409 referral guard) ───────────────────────
  function handleDeleteRequest(agent) {
    setDeleteTarget(agent);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/agents/${deleteTarget.id}`);
      onToast?.({
        type: 'success',
        message: `🗑️ Agent "${deleteTarget.name}" deleted successfully.`,
      });
      setDeleteTarget(null);
      fetchAgents(page, search, status);
    } catch (err) {
      const msg = err.response?.status === 409
        ? 'Cannot delete agent with existing referrals'
        : (err.response?.data?.error ?? 'Failed to delete agent.');
      onToast?.({ type: 'error', message: msg });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── 1. Page Header with "+ Register Agent" CTA ────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: CHOCOLATE }}>
            Agent Management
          </h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            Search, filter, and manage all registered referral agents.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setIsFormOpen(true)}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-md shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            + Register Agent
          </Button>
        )}
      </div>

      {/* ── 2. Modal Dialog for AgentForm ─────────────────────────────────── */}
      {isAdmin && (
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-white p-6 rounded-xl border border-border shadow-xl">
            <DialogHeader className="mb-2">
              <DialogTitle className="text-base font-bold text-text-1">Register New Agent</DialogTitle>
              <DialogDescription className="text-xs text-text-3">
                Enter agent details to generate their account and unique referral code.
              </DialogDescription>
            </DialogHeader>
            <AgentForm
              key={isFormOpen ? 'open' : 'closed'}
              onCreated={handleAgentCreated}
              onSuccess={() => setIsFormOpen(false)}
              onToast={onToast}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── 3. Edit Agent Modal ───────────────────────────────────────────── */}
      {isAdmin && (
        <EditAgentModal
          agent={agentToEdit}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSuccess={handleEditSuccess}
          onToast={onToast}
        />
      )}

      {/* ── 4. Delete Confirmation Dialog ─────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm bg-white p-6 rounded-xl border border-[#E5DED6] shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#3E2723]">
              Delete Agent?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9C8577]">
              Are you sure you want to delete <span className="font-semibold text-[#1C0F05]">"{deleteTarget?.name}"</span>?
              This action will permanently delete the agent and their linked user account. Agents with existing referrals cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="border-[#E5DED6] text-[#3E2723] hover:bg-[#FAF8F5]"
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

      {/* ── 5. Expanded Modal Dialog for Agent Details ───────────────────── */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-border shadow-xl">
          <DialogHeader className="mb-3">
            <DialogTitle className="text-base font-bold text-text-1">Agent Details</DialogTitle>
            <DialogDescription className="text-xs text-text-3">
              Full profile information and referral performance for this agent.
            </DialogDescription>
          </DialogHeader>

          {selectedAgent && (
            <div className="space-y-3 py-2 text-sm">
              {/* Name */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Name</span>
                <span className="font-semibold text-text-1">{selectedAgent.name}</span>
              </div>

              {/* Phone */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Phone</span>
                <span className="font-mono text-text-2">{selectedAgent.phone || '—'}</span>
              </div>

              {/* Email */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Email</span>
                <span className="text-text-2">{selectedAgent.email || '—'}</span>
              </div>

              {/* Status */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Status</span>
                <AgentStatusPill status={selectedAgent.status} />
              </div>

              {/* Referral Code */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Referral Code</span>
                {selectedAgent.referral_code ? (
                  <code className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-brand-light text-brand">
                    {selectedAgent.referral_code}
                  </code>
                ) : (
                  <span className="text-xs text-text-3">—</span>
                )}
              </div>

              {/* Date Joined */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Date Joined</span>
                <span className="font-medium text-text-2">
                  {selectedAgent.created_at ? new Date(selectedAgent.created_at).toLocaleDateString() : '—'}
                </span>
              </div>

              {/* Total Referrals */}
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-3 uppercase">Total Referrals</span>
                <span className="font-semibold text-text-1">
                  {selectedAgent.total_referrals ?? selectedAgent.successful_referrals ?? 0}
                </span>
              </div>

              {/* Successful Referrals */}
              {selectedAgent.successful_referrals !== undefined && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-xs font-semibold text-text-3 uppercase">Successful Referrals</span>
                  <span className="font-semibold text-text-1">{selectedAgent.successful_referrals}</span>
                </div>
              )}

              {/* Reward Tier */}
              {selectedAgent.current_reward && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-semibold text-text-3 uppercase">Reward Tier</span>
                  <RewardBadge tier={selectedAgent.current_reward} />
                </div>
              )}
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

      {/* ── 6. Agent Table Card ───────────────────────────────────────────── */}
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
              style={{ background: IVORY, color: MUTED }}
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
            sub={search || status ? 'Try clearing the filters.' : 'Click "+ Register Agent" above to register your first agent.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto w-full">
              <table className="min-w-[800px] w-full text-sm border-collapse" aria-label="Agent list">
                <thead>
                  <tr style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
                    {['#', 'Name', 'Referral Code', 'Referrals', 'Reward Tier', 'Status',
                      ...(isAdmin ? ['Actions'] : [])
                    ].map(h => (
                      <th
                        key={h}
                        scope="col"
                        className={`px-6 py-3 text-[11px] font-semibold uppercase tracking-wider ${
                          h === 'Actions' ? 'text-right' : 'text-left'
                        }`}
                        style={{ color: MUTED }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((a, i) => {
                    const busy = actioning.has(a.id);
                    return (
                      <tr
                        key={a.id}
                        className="transition-colors duration-100"
                        style={{ borderBottom: `1px solid ${BORDER}` }}
                        onMouseEnter={e => { e.currentTarget.style.background = IVORY; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                      >
                        <td className="px-6 py-4 text-xs tabular-nums" style={{ color: MUTED }}>
                          {(page - 1) * LIMIT + i + 1}
                        </td>

                        <td className="px-6 py-4 font-medium" style={{ color: CHOCOLATE }}>
                          {a.name}
                        </td>

                        <td className="px-6 py-4">
                          {a.referral_code ? (
                            <code
                              className="font-mono text-xs px-2 py-0.5 rounded"
                              style={{ background: 'rgba(138,77,31,0.08)', color: BRAND }}
                            >
                              {a.referral_code}
                            </code>
                          ) : (
                            <span className="text-xs" style={{ color: MUTED }}>—</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full text-xs font-bold px-2"
                            style={{ background: 'rgba(212,175,55,0.15)', color: '#7C5900' }}
                            title="Successful referrals"
                          >
                            {a.successful_referrals ?? 0}
                          </span>
                        </td>

                        <td className="px-6 py-4"><RewardBadge tier={a.current_reward} /></td>

                        <td className="px-6 py-4"><AgentStatusPill status={a.status} /></td>

                        {isAdmin && (
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {a.status === 'PENDING' && (
                                <div className="flex items-center gap-1.5 mr-1">
                                  <button
                                    disabled={busy}
                                    onClick={() => handleApprove(a.id, a.name)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                                    style={{ background: 'rgba(46,125,50,0.10)', color: '#2E7D32', border: '1px solid rgba(46,125,50,0.25)' }}
                                    title="Approve agent"
                                  >
                                    {busy ? <Spinner small /> : '✓ Approve'}
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => handleReject(a.id, a.name)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                                    style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.25)' }}
                                    title="Reject agent"
                                  >
                                    {busy ? <Spinner small /> : '✕ Reject'}
                                  </button>
                                </div>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-text-3 hover:text-text-1 hover:bg-[#FAF8F5] rounded-md"
                                    aria-label={`Actions for ${a.name}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44 bg-white border border-[#E5DED6] shadow-md z-50">
                                  <DropdownMenuItem
                                    onClick={() => handleViewDetails(a)}
                                    className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723]"
                                  >
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleEditProfile(a)}
                                    className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723]"
                                  >
                                    Edit Profile
                                  </DropdownMenuItem>

                                  {a.status === 'APPROVED' && (
                                    <DropdownMenuItem
                                      onClick={() => handleToggleSuspend(a)}
                                      className="cursor-pointer text-[#7A2518] hover:bg-[#FDF3F0] focus:bg-[#FDF3F0] focus:text-[#7A2518]"
                                    >
                                      Suspend Agent
                                    </DropdownMenuItem>
                                  )}

                                  {a.status === 'SUSPENDED' && (
                                    <DropdownMenuItem
                                      onClick={() => handleToggleSuspend(a)}
                                      className="cursor-pointer text-[#1A5C34] hover:bg-[#F2FAF4] focus:bg-[#F2FAF4] focus:text-[#1A5C34]"
                                    >
                                      Activate Agent
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => handleDeleteRequest(a)}
                                    className="cursor-pointer text-[#C0392B] focus:text-[#C0392B] focus:bg-destructive/10"
                                  >
                                    Delete Agent
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
          </>
        )}
      </section>
    </div>
  );
}
