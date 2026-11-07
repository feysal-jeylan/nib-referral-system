/**
 * features/dashboard/Dashboard.jsx
 * ──────────────────────────────────
 * Main authenticated view for both ADMIN and AGENT roles.
 * Phase 5b — Full Nib Bank warm brown / honey gold Tailwind redesign.
 * No App.css dependency.
 *
 * Owns ALL data-fetching state:
 *   agents, referrals, campaigns, integLogs (+ their loading flags)
 *   toast, actioning (Set of ids currently being acted on)
 *
 * Live polling: setInterval(5 s) calls the refresh helpers silently in the
 * background. The polling useEffect is cleaned up on unmount.
 *
 * Props:
 *   user   {{ username: string, role: 'ADMIN'|'AGENT' }}
 *   logout {() => Promise<void>}
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';

import Toast      from '@/components/ui/Toast';
import Spinner    from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import InfoBox    from '@/components/ui/InfoBox';
import { AgentStatusPill } from '@/components/ui/Badge';

import AgentForm    from '@/features/agents/AgentForm';
import AgentTable   from '@/features/agents/AgentTable';
import ReferralTable from '@/features/referrals/ReferralTable';
import CampaignForm  from '@/features/campaigns/CampaignForm';
import CampaignTable from '@/features/campaigns/CampaignTable';
import IntegrationLogsTable from '@/features/integration/IntegrationLogsTable';

// ── NIB monogram — matches Login left panel ───────────────────────────────────
function NibMonogram() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-gold flex items-center justify-center shadow-sm flex-shrink-0">
        <span className="text-white text-base font-black tracking-tight select-none">N</span>
      </div>
      <div>
        <p className="text-white font-bold text-sm leading-none tracking-tight">NIB</p>
        <p className="text-gold text-[10px] tracking-[0.18em] uppercase font-medium mt-0.5">
          International Bank
        </p>
      </div>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function SectionCard({ children, ...props }) {
  return (
    <section
      className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden"
      {...props}
    >
      {children}
    </section>
  );
}

// ── Section header row ────────────────────────────────────────────────────────
function SectionHeader({ id, title, badge, badgeAlert = false, action }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 id={id} className="text-text-1 font-bold text-sm tracking-tight">{title}</h2>
      <div className="flex items-center gap-2">
        {badge !== undefined && (
          <span
            className={[
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              badgeAlert
                ? 'bg-pending-bg text-pending-txt border border-pending-bdr'
                : 'bg-panel text-text-3',
            ].join(' ')}
          >
            {badge}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard({ user, logout }) {
  const isAdmin = user.role === 'ADMIN';

  // ── State ────────────────────────────────────────────────────────────────
  const [agents,           setAgents]           = useState([]);
  const [referrals,        setReferrals]        = useState([]);
  const [campaigns,        setCampaigns]        = useState([]);
  const [integLogs,        setIntegLogs]        = useState([]);
  const [agentsLoading,    setAgentsLoading]    = useState(true);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [integLogsLoading, setIntegLogsLoading] = useState(true);
  const [actioning,        setActioning]        = useState(new Set());
  const [toast,            setToast]            = useState(null);
  const toastTimer = useRef(null);

  // ── Toast helper ─────────────────────────────────────────────────────────
  function showToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const fetches = [
          api.get('/agents'),
          api.get('/referrals'),
        ];
        if (isAdmin) {
          fetches.push(api.get('/campaigns'));
          fetches.push(api.get('/integration/logs'));
        }

        const results = await Promise.all(fetches);

        setAgents(Array.isArray(results[0].data) ? results[0].data : []);
        setReferrals(
          Array.isArray(results[1].data)
            ? results[1].data
            : (results[1].data?.referrals ?? [])
        );

        if (isAdmin) {
          setCampaigns(
            Array.isArray(results[2].data?.campaigns) ? results[2].data.campaigns : []
          );
          setIntegLogs(
            Array.isArray(results[3].data?.logs) ? results[3].data.logs : []
          );
        }
      } catch {
        showToast({ type: 'error', message: '🔴 Failed to load data. Is the API running?' });
      } finally {
        setAgentsLoading(false);
        setReferralsLoading(false);
        setCampaignsLoading(false);
        setIntegLogsLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refresh helpers (stable useCallback refs — safe polling deps) ─────────
  const refreshAgents = useCallback(async () => {
    try {
      const { data } = await api.get('/agents');
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      // silent — polling should not spam error toasts
    }
  }, []);

  const refreshReferrals = useCallback(async () => {
    try {
      const { data } = await api.get('/referrals');
      setReferrals(Array.isArray(data) ? data : (data?.referrals ?? []));
    } catch {
      // silent
    }
  }, []);

  const refreshCampaigns = useCallback(async () => {
    try {
      const { data } = await api.get('/campaigns');
      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
    } catch {
      // silent
    }
  }, []);

  const refreshIntegLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/integration/logs');
      setIntegLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch {
      showToast({ type: 'error', message: '🔴 Could not refresh integration logs.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live polling — silent auto-refresh every 5 s ─────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      refreshAgents();
      refreshReferrals();
      if (isAdmin) {
        refreshCampaigns();
        refreshIntegLogs();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [isAdmin, refreshAgents, refreshReferrals, refreshCampaigns, refreshIntegLogs]);

  // ── Agent actions ────────────────────────────────────────────────────────
  function handleAgentCreated(newAgent) {
    setAgents(prev => [newAgent, ...prev]);
  }

  async function handleApprove(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const { data } = await api.patch(`/agents/${id}/approve`);
      await refreshAgents();
      showToast({
        type: 'success',
        message: `✅ "${name}" approved — Code: ${data.referral_code} · Temp Password: ${data.temp_password}`,
      });
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.error ?? 'Approval failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function handleReject(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const { data } = await api.patch(`/agents/${id}/reject`);
      if (data) await refreshAgents();
      showToast({ type: 'success', message: `Application from "${name}" has been rejected.` });
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.error ?? 'Rejection failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Referral status change ───────────────────────────────────────────────
  async function handleStatusChange(referralId, newStatus) {
    try {
      await api.patch(`/referrals/${referralId}/status`, { status: newStatus });
      setReferrals(prev =>
        prev.map(r => r.id === referralId ? { ...r, status: newStatus } : r)
      );
      if (newStatus === 'SUCCESSFUL') {
        await refreshAgents();
      }
      showToast({
        type: 'success',
        message: `✅ Referral ${newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected'} successfully.`,
      });
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.error ?? 'Status update failed.' });
    }
  }

  async function handleLogout() { await logout(); }

  const pendingAgents = agents.filter(a => a.status === 'PENDING');

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-brand shadow-md" style={{ borderBottom: '3px solid #D4AF37' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-4">
            <NibMonogram />
            <div className="hidden sm:block h-6 w-px bg-white/20" aria-hidden="true" />
            <p className="hidden sm:block text-white/70 text-xs tracking-wide">
              {isAdmin
                ? 'Internal Referral Management System'
                : 'Your Referral Dashboard'}
            </p>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Live polling indicator */}
            <div
              className="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full"
              aria-label="Live updates active"
              title="Dashboard refreshes every 5 seconds"
            >
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
              <span className="text-white/80 text-xs font-medium">Live</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-white font-semibold text-sm leading-none">{user.username}</p>
                <p className="text-white/60 text-[11px] mt-0.5">{isAdmin ? '🛡️ Admin' : '👤 Agent'}</p>
              </div>
              <button
                id="logout-btn"
                className="bg-transparent border border-white/25 text-white/80 hover:border-white/50 hover:text-white px-4 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer"
                onClick={handleLogout}
                aria-label="Sign out"
              >
                ↩ Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">

        {/* ── ADMIN: Register Agent form ──────────────────────────────── */}
        {isAdmin && (
          <SectionCard aria-labelledby="agent-form-heading">
            <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
          </SectionCard>
        )}

        {/* ── Agent Dashboard — ALL roles ─────────────────────────────── */}
        <SectionCard aria-labelledby="agent-dashboard-heading">
          <SectionHeader
            id="agent-dashboard-heading"
            title={isAdmin ? 'Agent Dashboard' : 'My Profile'}
            badge={`${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
          />
          <AgentTable agents={agents} loading={agentsLoading} isAdmin={isAdmin} />
        </SectionCard>

        {/* ── ADMIN: Pending Agent Applications ──────────────────────── */}
        {isAdmin && (
          <SectionCard aria-labelledby="pending-agents-heading">
            <SectionHeader
              id="pending-agents-heading"
              title="Pending Agent Applications"
              badge={`${pendingAgents.length} pending`}
              badgeAlert={pendingAgents.length > 0}
            />
            {agentsLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Spinner />
                <p className="text-text-3 text-sm">Loading applications…</p>
              </div>
            ) : pendingAgents.length === 0 ? (
              <EmptyState
                icon="✅"
                title="No pending applications"
                sub="All agent applications have been reviewed. New applicants appear here automatically."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse" aria-label="Pending agent applications">
                  <thead>
                    <tr className="bg-panel border-b border-border">
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Phone</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Email</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map((a, i) => {
                      const busy = actioning.has(a.id);
                      return (
                        <tr key={a.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                          <td className="px-6 py-4 text-text-3 text-xs tabular-nums">{i + 1}</td>
                          <td className="px-6 py-4 text-text-1 font-medium">{a.name}</td>
                          <td className="px-6 py-4 text-text-2 tabular-nums">{a.phone ?? '—'}</td>
                          <td className="px-6 py-4 text-text-2">{a.email ?? '—'}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                id={`agent-approve-btn-${a.id}`}
                                disabled={busy}
                                onClick={() => handleApprove(a.id, a.name)}
                                className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {busy ? <Spinner small /> : '✓ Approve'}
                              </button>
                              <button
                                id={`agent-reject-btn-${a.id}`}
                                disabled={busy}
                                onClick={() => handleReject(a.id, a.name)}
                                className="inline-flex items-center gap-1.5 bg-reject-bg text-reject-txt border border-reject-bdr text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[#f9e5e1] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {busy ? <Spinner small /> : '✕ Reject'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Core Banking Integration notice ─────────────────────────── */}
        <SectionCard aria-labelledby="temenos-info-heading">
          <SectionHeader id="temenos-info-heading" title="Core Banking Integration" />
          <div className="px-6 pb-5 pt-4">
            <InfoBox
              message="Customer referrals are automatically synced from the Core Banking System (Temenos). No manual entry is required."
            />
          </div>
        </SectionCard>

        {/* ── Recent Referrals — ALL roles ────────────────────────────── */}
        <SectionCard aria-labelledby="referral-table-heading">
          <SectionHeader
            id="referral-table-heading"
            title={isAdmin ? 'Recent Referrals' : 'My Referrals'}
            badge={`${referrals.length} referral${referrals.length !== 1 ? 's' : ''}`}
          />
          <ReferralTable
            referrals={referrals}
            loading={referralsLoading}
            onStatusChange={handleStatusChange}
            isAdmin={isAdmin}
          />
        </SectionCard>

        {/* ── ADMIN-ONLY sections ──────────────────────────────────────── */}
        {isAdmin && (
          <>
            {/* Campaign creation form with Rules Builder */}
            <SectionCard aria-labelledby="campaign-form-heading">
              <CampaignForm onCreated={refreshCampaigns} onToast={showToast} />
            </SectionCard>

            {/* Campaign list */}
            <SectionCard aria-labelledby="campaign-table-heading">
              <SectionHeader
                id="campaign-table-heading"
                title="Campaign Management"
                badge={`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
              />
              <CampaignTable
                campaigns={campaigns}
                loading={campaignsLoading}
                onActivated={refreshCampaigns}
                onEdited={refreshCampaigns}
                onDeleted={refreshCampaigns}
                onToast={showToast}
              />
            </SectionCard>

            {/* Temenos Integration Logs */}
            <SectionCard aria-labelledby="integ-logs-heading">
              <SectionHeader
                id="integ-logs-heading"
                title="Temenos Integration Logs"
                badge={`${integLogs.length} event${integLogs.length !== 1 ? 's' : ''}`}
                action={
                  <button
                    className="text-xs font-semibold text-text-3 border border-border rounded px-3 py-1 hover:border-border-dark hover:text-text-2 transition-colors"
                    onClick={refreshIntegLogs}
                    aria-label="Refresh integration logs"
                    title="Refresh"
                  >
                    ↺ Refresh
                  </button>
                }
              />
              <IntegrationLogsTable logs={integLogs} loading={integLogsLoading} />
            </SectionCard>
          </>
        )}

      </main>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
