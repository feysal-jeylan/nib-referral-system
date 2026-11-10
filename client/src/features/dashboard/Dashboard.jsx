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

// ── SVG logout icon ───────────────────────────────────────────────────────────
function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function SectionCard({ children, ...props }) {
  return (
    <section
      className="bg-white rounded-xl shadow-sm overflow-hidden"
      style={{ border: '1px solid rgba(138,77,31,0.10)' }}
      {...props}
    >
      {children}
    </section>
  );
}

// ── Section header row ────────────────────────────────────────────────────────
function SectionHeader({ id, title, subtitle, badge, badgeAlert = false, action }) {
  return (
    <div
      className="flex items-start justify-between px-6 py-5"
      style={{ borderBottom: '1px solid rgba(138,77,31,0.08)' }}
    >
      <div>
        <h2
          id={id}
          className="font-bold text-sm tracking-tight leading-none"
          style={{ color: '#3E2723' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#7F483B' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
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
      <header
        className="bg-white sticky top-0 z-30"
        style={{ borderBottom: '1px solid rgba(138,77,31,0.15)' }}
      >
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">

          {/* Left — logo + title */}
          <div className="flex items-center gap-3">
            <img
              src="/nib-logo.png"
              alt="NIB"
              className="w-9 h-9 rounded-full object-cover shadow-sm flex-shrink-0"
            />
            <div
              className="hidden sm:block w-px h-7 self-center flex-shrink-0"
              style={{ background: 'rgba(138,77,31,0.20)' }}
              aria-hidden="true"
            />
            <div className="hidden sm:block">
              <p className="font-bold text-sm leading-none" style={{ color: '#3E2723' }}>
                NIB Referral Portal
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#9C8577' }}>
                {isAdmin ? 'Internal Referral Management System' : 'Your Referral Dashboard'}
              </p>
            </div>
          </div>

          {/* Right — user info + sign out */}
          <div className="flex items-center gap-4">
            {/* User pill */}
            <div className="text-right hidden sm:block">
              <p
                className="text-sm font-semibold leading-none"
                style={{ color: '#3E2723' }}
              >
                {user.username}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: '#9C8577' }}>
                {isAdmin ? 'Administrator' : 'Agent'}
              </p>
            </div>

            {/* Divider */}
            <div
              className="hidden sm:block w-px h-7 self-center"
              style={{ background: 'rgba(138,77,31,0.15)' }}
              aria-hidden="true"
            />

            {/* Sign out */}
            <button
              id="logout-btn"
              onClick={handleLogout}
              aria-label="Sign out"
              className="inline-flex items-center gap-1.5 text-xs font-semibold
                         px-3 py-2 rounded-lg transition-all duration-150"
              style={{ color: '#7F483B', border: '1px solid rgba(138,77,31,0.20)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(138,77,31,0.07)';
                e.currentTarget.style.borderColor = 'rgba(138,77,31,0.40)';
                e.currentTarget.style.color = '#3E2723';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '';
                e.currentTarget.style.borderColor = 'rgba(138,77,31,0.20)';
                e.currentTarget.style.color = '#7F483B';
              }}
            >
              <IconLogout />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
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
            subtitle={isAdmin ? 'All registered referral agents and their status.' : 'Your agent profile and referral activity.'}
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
              subtitle="Review and approve or reject incoming agent applications."
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
                    <tr style={{ background: '#FAF8F5', borderBottom: '1px solid rgba(138,77,31,0.10)' }}>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8A4D1F' }}>#</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8A4D1F' }}>Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8A4D1F' }}>Phone</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8A4D1F' }}>Email</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8A4D1F' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map((a, i) => {
                      const busy = actioning.has(a.id);
                      return (
                        <tr key={a.id} className="border-b border-border last:border-0 transition-colors duration-150" style={{ '--tw-bg-opacity': 1 }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FAF8F5'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        >
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
          <SectionHeader id="temenos-info-heading" title="Core Banking Integration" subtitle="Customer referrals are automatically synced from Temenos." />
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
            subtitle={isAdmin ? 'All referrals submitted through the Core Banking integration.' : 'Customers you have referred through Temenos.'}
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
                subtitle="Create, activate, and manage referral campaigns and their qualification rules."
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
                subtitle="Webhook events received from the Core Banking System."
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
