/**
 * features/dashboard/Dashboard.jsx
 * ──────────────────────────────────
 * Main authenticated view for both ADMIN and AGENT roles.
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

        // Axios wraps the parsed body in .data
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
    <div className="app">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand">
            <span className="app-header__logo" aria-hidden="true">🏦</span>
            <div>
              <h1 className="app-header__title">
                {isAdmin ? 'Nib International Bank' : 'Agent Portal'}
              </h1>
              <p className="app-header__subtitle">
                {isAdmin
                  ? 'Internal Referral Management System'
                  : 'Nib International Bank — Your Referral Dashboard'}
              </p>
            </div>
          </div>

          <div className="header-right">
            {/* Live polling indicator */}
            <div
              className="live-indicator"
              aria-label="Live updates active"
              title="Dashboard refreshes every 5 seconds"
            >
              <span className="live-indicator__dot" aria-hidden="true" />
              <span className="live-indicator__text">Live Updates: Active</span>
            </div>

            <div className="header-user">
              <div className="header-user__info">
                <p className="header-user__name">{user.username}</p>
                <p className="header-user__role">{isAdmin ? '🛡️ Admin' : '👤 Agent'}</p>
              </div>
              <button
                id="logout-btn"
                className="btn--logout"
                onClick={handleLogout}
                aria-label="Sign out"
              >
                ↩ Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── ADMIN: Register Agent form ──────────────────────────────── */}
        {isAdmin && (
          <section className="card" aria-labelledby="agent-form-heading">
            <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
          </section>
        )}

        {/* ── Agent Dashboard — ALL roles ─────────────────────────────── */}
        <section className="card" aria-labelledby="agent-dashboard-heading">
          <div className="section-header">
            <h2 id="agent-dashboard-heading" className="section-header__title">
              {isAdmin ? 'Agent Dashboard' : 'My Profile'}
            </h2>
            <span className="section-header__count">
              {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <AgentTable agents={agents} loading={agentsLoading} isAdmin={isAdmin} />
        </section>

        {/* ── ADMIN: Pending Agent Applications ──────────────────────── */}
        {isAdmin && (
          <section className="card" aria-labelledby="pending-agents-heading">
            <div className="section-header">
              <h2 id="pending-agents-heading" className="section-header__title">
                Pending Agent Applications
              </h2>
              <span
                className={`section-header__count${pendingAgents.length > 0 ? ' section-header__count--alert' : ''}`}
              >
                {pendingAgents.length} pending
              </span>
            </div>
            {agentsLoading ? (
              <div className="state-box"><Spinner /><p>Loading applications…</p></div>
            ) : pendingAgents.length === 0 ? (
              <EmptyState
                icon="✅"
                title="No pending applications"
                sub="All agent applications have been reviewed. New applicants appear here automatically."
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table" aria-label="Pending agent applications">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Name</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Email</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map((a, i) => {
                      const busy = actioning.has(a.id);
                      return (
                        <tr key={a.id} className="data-row">
                          <td className="td--index">{i + 1}</td>
                          <td className="td--name">{a.name}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>
                            {a.phone ?? '—'}
                          </td>
                          <td style={{ color: 'var(--text-2)' }}>{a.email ?? '—'}</td>
                          <td>
                            <div className="action-group">
                              <button
                                id={`agent-approve-btn-${a.id}`}
                                className="btn btn--approve"
                                disabled={busy}
                                onClick={() => handleApprove(a.id, a.name)}
                              >
                                {busy ? <Spinner small /> : '✓ Approve'}
                              </button>
                              <button
                                id={`agent-reject-btn-${a.id}`}
                                className="btn btn--reject"
                                disabled={busy}
                                onClick={() => handleReject(a.id, a.name)}
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
          </section>
        )}

        {/* ── Core Banking Integration notice ─────────────────────────── */}
        <section className="card" aria-labelledby="temenos-info-heading">
          <div className="section-header">
            <h2 id="temenos-info-heading" className="section-header__title">
              Core Banking Integration
            </h2>
          </div>
          <div style={{ padding: '0 24px 22px' }}>
            <InfoBox
              message="Customer referrals are automatically synced from the Core Banking System (Temenos). No manual entry is required."
            />
          </div>
        </section>

        {/* ── Recent Referrals — ALL roles ────────────────────────────── */}
        <section className="card" aria-labelledby="referral-table-heading">
          <div className="section-header">
            <h2 id="referral-table-heading" className="section-header__title">
              {isAdmin ? 'Recent Referrals' : 'My Referrals'}
            </h2>
            <span className="section-header__count">
              {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ReferralTable
            referrals={referrals}
            loading={referralsLoading}
            onStatusChange={handleStatusChange}
            isAdmin={isAdmin}
          />
        </section>

        {/* ── ADMIN-ONLY sections ──────────────────────────────────────── */}
        {isAdmin && (
          <>
            {/* Campaign creation form with Rules Builder */}
            <section className="card" aria-labelledby="campaign-form-heading">
              <CampaignForm onCreated={refreshCampaigns} onToast={showToast} />
            </section>

            {/* Campaign list */}
            <section className="card" aria-labelledby="campaign-table-heading">
              <div className="section-header">
                <h2 id="campaign-table-heading" className="section-header__title">
                  Campaign Management
                </h2>
                <span className="section-header__count">
                  {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                </span>
              </div>
              <CampaignTable
                campaigns={campaigns}
                loading={campaignsLoading}
                onActivated={refreshCampaigns}
                onEdited={refreshCampaigns}
                onDeleted={refreshCampaigns}
                onToast={showToast}
              />
            </section>

            {/* Temenos Integration Logs */}
            <section className="card" aria-labelledby="integ-logs-heading">
              <div className="section-header">
                <h2 id="integ-logs-heading" className="section-header__title">
                  Temenos Integration Logs
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="section-header__count">
                    {integLogs.length} event{integLogs.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    className="btn btn--ghost"
                    onClick={refreshIntegLogs}
                    aria-label="Refresh integration logs"
                    title="Refresh"
                  >
                    ↺ Refresh
                  </button>
                </div>
              </div>
              <IntegrationLogsTable logs={integLogs} loading={integLogsLoading} />
            </section>
          </>
        )}

      </main>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

