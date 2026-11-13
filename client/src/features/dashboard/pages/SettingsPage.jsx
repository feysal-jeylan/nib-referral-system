/**
 * features/dashboard/pages/SettingsPage.jsx
 * ──────────────────────────────────────────
 * Enterprise Control & Settings Center.
 *
 * Tabs:
 *  1. My Profile (Admin & Agent)
 *     - User identity, role, and agent profile ID
 *     - Security summary and "Update Password" modal dialog
 *  2. Finance & Payouts (Admin Only)
 *     - Summary liability card: "Total Outstanding Liability: X,XXX ETB"
 *     - Payout ledger table (Agent Name, Referrals, Total Earned, Status pill, Mark as Paid)
 *  3. System Configuration (Admin Only)
 *     - Reward rules / milestone tiers (Bronze, Silver, Gold)
 *     - Functional "Edit Configuration" dialog to dynamically update tier thresholds
 *
 * Props: user, onToast
 */

import { useState, useEffect } from 'react';
import {
  UserCircle,
  ShieldCheck,
  KeyRound,
  Lock,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Wallet,
  Award,
  Sliders,
  Sparkles,
  Check,
} from 'lucide-react';
import useAppStore from '@/store/useAppStore';
import api from '@/services/api';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Spinner from '@/components/ui/Spinner';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const GOLD      = '#D4AF37';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.12)';

export default function SettingsPage({ user: propUser, onToast }) {
  const storeUser = useAppStore((s) => s.user);
  const user      = storeUser || propUser;
  const isAdmin   = user?.role === 'ADMIN';

  // Active Tab state
  const [activeTab, setActiveTab] = useState('profile');

  // Agent ID lookup (if not present on user object for AGENT)
  const [agentId, setAgentId] = useState(user?.agent_id ?? null);

  useEffect(() => {
    if (user?.role === 'AGENT' && !agentId) {
      api.get('/agents')
        .then((res) => {
          const record = res.data?.data?.[0] ?? res.data?.agents?.[0];
          if (record?.id) setAgentId(record.id);
        })
        .catch(() => {});
    }
  }, [user, agentId]);

  // ── Tab 2: Finance Data State (Admin Only) ───────────────────────────────────
  const [financeData,  setFinanceData]  = useState(null);
  const [financeError, setFinanceError] = useState(false);
  const financeLoading = isAdmin && activeTab === 'finance' && !financeData && !financeError;

  useEffect(() => {
    if (isAdmin && activeTab === 'finance' && !financeData) {
      api.get('/dashboard/finance')
        .then((res) => setFinanceData(res.data))
        .catch(() => {
          setFinanceError(true);
          onToast?.({ type: 'error', message: '🔴 Failed to load finance data.' });
        });
    }
  }, [isAdmin, activeTab, financeData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab 3: System Config State (Admin Only) ──────────────────────────────────
  const [configData,  setConfigData]  = useState(null);
  const [configError, setConfigError] = useState(false);
  const configLoading = isAdmin && activeTab === 'system' && !configData && !configError;

  useEffect(() => {
    if (isAdmin && activeTab === 'system' && !configData) {
      api.get('/dashboard/config')
        .then((res) => setConfigData(res.data))
        .catch(() => {
          setConfigError(true);
          onToast?.({ type: 'error', message: '🔴 Failed to load system configuration.' });
        });
    }
  }, [isAdmin, activeTab, configData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modal State for Change Password ─────────────────────────────────────────
  const [modalOpen,       setModalOpen]       = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent,     setShowCurrent]     = useState(false);
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [modalError,      setModalError]      = useState('');

  function handleOpenModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setModalError('');
    setModalOpen(true);
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setModalError('');

    if (!currentPassword) {
      setModalError('Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setModalError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { newPassword });
      setModalOpen(false);
      onToast?.({ type: 'success', message: '✅ Password changed successfully.' });
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to update password. Please check your credentials.';
      setModalError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Modal State for Edit Reward Rules Configuration ─────────────────────────
  const [configModalOpen,  setConfigModalOpen]  = useState(false);
  const [bronzeVal,        setBronzeVal]        = useState('3');
  const [silverVal,        setSilverVal]        = useState('5');
  const [goldVal,          setGoldVal]          = useState('10');
  const [configModalError, setConfigModalError] = useState('');
  const [configSubmitting, setConfigSubmitting] = useState(false);

  const rewardRules = configData?.reward_rules ?? [];

  function handleOpenConfigModal() {
    const bronze = rewardRules.find((r) => r.reward_name?.toLowerCase() === 'bronze');
    const silver = rewardRules.find((r) => r.reward_name?.toLowerCase() === 'silver');
    const gold   = rewardRules.find((r) => r.reward_name?.toLowerCase() === 'gold');

    setBronzeVal(String(bronze?.min_referrals ?? 3));
    setSilverVal(String(silver?.min_referrals ?? 5));
    setGoldVal(String(gold?.min_referrals ?? 10));
    setConfigModalError('');
    setConfigModalOpen(true);
  }

  async function handleConfigSubmit(e) {
    e.preventDefault();
    setConfigModalError('');

    const b = parseInt(bronzeVal, 10);
    const s = parseInt(silverVal, 10);
    const g = parseInt(goldVal, 10);

    if (isNaN(b) || isNaN(s) || isNaN(g) || b < 0 || s < 0 || g < 0) {
      const err = 'Please enter valid non-negative numbers for all tiers.';
      setConfigModalError(err);
      onToast?.({ type: 'error', message: `❌ ${err}` });
      return;
    }

    // Strict validation: Bronze < Silver < Gold
    if (!(b < s && s < g)) {
      const err = 'Hierarchy Rule Violated: Bronze threshold must be strictly less than Silver, and Silver must be strictly less than Gold (Bronze < Silver < Gold).';
      setConfigModalError(err);
      onToast?.({ type: 'error', message: '❌ Invalid Tier Order: Bronze (< Silver) must be strictly less than Silver (< Gold).' });
      return;
    }

    const bronze = rewardRules.find((r) => r.reward_name?.toLowerCase() === 'bronze');
    const silver = rewardRules.find((r) => r.reward_name?.toLowerCase() === 'silver');
    const gold   = rewardRules.find((r) => r.reward_name?.toLowerCase() === 'gold');

    const payload = [
      { id: bronze?.id ?? 1, min_referrals: b },
      { id: silver?.id ?? 2, min_referrals: s },
      { id: gold?.id ?? 3, min_referrals: g },
    ];

    setConfigSubmitting(true);
    try {
      await api.put('/dashboard/config', payload);
      setConfigModalOpen(false);

      // Refresh config data
      const refreshed = await api.get('/dashboard/config');
      setConfigData(refreshed.data);
      onToast?.({ type: 'success', message: '✅ System reward thresholds updated successfully.' });
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to update system configuration.';
      setConfigModalError(msg);
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    } finally {
      setConfigSubmitting(false);
    }
  }

  // ── Payout Action State ─────────────────────────────────────────────────────
  const [payingAgentId, setPayingAgentId] = useState(null);

  async function handleMarkAsPaid(agent) {
    setPayingAgentId(agent.id);
    try {
      await api.patch(`/dashboard/finance/pay/${agent.id}`);
      const res = await api.get('/dashboard/finance');
      setFinanceData(res.data);
      onToast?.({ type: 'success', message: `✅ Payout for ${agent.name} marked as paid.` });
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to mark payout as paid.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    } finally {
      setPayingAgentId(null);
    }
  }

  const agentsList     = financeData?.agents ?? [];
  const totalLiability = financeData?.total_payout ?? financeData?.totalLiability ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" style={{ background: IVORY, minHeight: '100%' }}>

      {/* ── Sticky Header ────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 backdrop-blur-md pb-4 pt-1 border-b"
        style={{ borderColor: BORDER, background: `${IVORY}F0` }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: CHOCOLATE }}>
              Enterprise Control &amp; Settings
            </h1>
            <p className="text-xs" style={{ color: MUTED }}>
              Manage authentication credentials, financial liabilities, and core reward tiers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border shadow-2xs"
              style={{
                background: isAdmin ? 'rgba(138,77,31,0.10)' : 'rgba(212,175,55,0.18)',
                borderColor: isAdmin ? 'rgba(138,77,31,0.25)' : 'rgba(212,175,55,0.35)',
                color: isAdmin ? BRAND : '#8A5D00',
              }}
            >
              {isAdmin ? '🛡️ Administrator Access' : '👤 Agent Session'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tabbed Interface ─────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList
          className="inline-flex p-1 rounded-xl border bg-[#EFEAE4]/80 shadow-2xs gap-1"
          style={{ borderColor: BORDER }}
        >
          {/* Tab 1 Trigger: My Profile */}
          <TabsTrigger
            value="profile"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all data-[state=active]:bg-[#8A4D1F] data-[state=active]:text-white data-[state=active]:shadow-sm text-[#5D4037] hover:text-[#3E2723]"
          >
            <UserCircle size={15} />
            <span>My Profile</span>
          </TabsTrigger>

          {/* Tab 2 Trigger: Finance & Payouts (Admin Only) */}
          {isAdmin && (
            <TabsTrigger
              value="finance"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all data-[state=active]:bg-[#8A4D1F] data-[state=active]:text-white data-[state=active]:shadow-sm text-[#5D4037] hover:text-[#3E2723]"
            >
              <Wallet size={15} />
              <span>Finance &amp; Payouts</span>
            </TabsTrigger>
          )}

          {/* Tab 3 Trigger: System Configuration (Admin Only) */}
          {isAdmin && (
            <TabsTrigger
              value="system"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all data-[state=active]:bg-[#8A4D1F] data-[state=active]:text-white data-[state=active]:shadow-sm text-[#5D4037] hover:text-[#3E2723]"
            >
              <Sliders size={15} />
              <span>System Configuration</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: MY PROFILE (Admin & Agent)                                    */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="profile" className="space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Profile Section */}
            <section
              className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col justify-between"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div>
                <div
                  className="flex items-center gap-3 px-6 py-4"
                  style={{ borderBottom: `1px solid ${BORDER}` }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(138,77,31,0.10)', color: BRAND }}
                  >
                    <UserCircle size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
                      Profile Information
                    </h2>
                    <p className="text-xs" style={{ color: MUTED }}>
                      System identity and account attributes
                    </p>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* Username / Email */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                      Username / Email Address
                    </label>
                    <div
                      className="w-full px-3.5 py-2.5 rounded-lg border text-sm font-medium select-all"
                      style={{
                        background: '#FAF8F5',
                        borderColor: '#E8E1DC',
                        color: CHOCOLATE,
                      }}
                    >
                      {user?.username ?? '—'}
                    </div>
                  </div>

                  {/* System Role */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                      Account Role
                    </label>
                    <div
                      className="w-full px-3.5 py-2.5 rounded-lg border text-sm flex items-center justify-between"
                      style={{
                        background: '#FAF8F5',
                        borderColor: '#E8E1DC',
                      }}
                    >
                      <span className="font-medium" style={{ color: CHOCOLATE }}>
                        {isAdmin ? 'System Administrator' : 'Referral Agent'}
                      </span>
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider"
                        style={{
                          background: isAdmin ? 'rgba(138,77,31,0.12)' : 'rgba(212,175,55,0.20)',
                          color: isAdmin ? BRAND : '#8A5D00',
                        }}
                      >
                        {user?.role ?? (isAdmin ? 'ADMIN' : 'AGENT')}
                      </span>
                    </div>
                  </div>

                  {/* Agent ID (only if applicable) */}
                  {!isAdmin && (
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                        Agent Profile ID
                      </label>
                      <div
                        className="w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono font-semibold"
                        style={{
                          background: '#FAF8F5',
                          borderColor: '#E8E1DC',
                          color: BRAND,
                        }}
                      >
                        {agentId ? `#${agentId}` : 'Linked via Session Token'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="px-6 py-3 text-xs bg-stone-50 border-t"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                Profile attributes are synchronized from the Nib Core directory.
              </div>
            </section>

            {/* Security Section */}
            <section
              className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col justify-between"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div>
                <div
                  className="flex items-center gap-3 px-6 py-4"
                  style={{ borderBottom: `1px solid ${BORDER}` }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(46,125,50,0.10)', color: '#2E7D32' }}
                  >
                    <ShieldCheck size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
                      Security &amp; Credentials
                    </h2>
                    <p className="text-xs" style={{ color: MUTED }}>
                      Authentication security and password controls
                    </p>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Account Security Status */}
                  <div
                    className="p-4 rounded-xl border flex items-start gap-3"
                    style={{ background: '#FAF8F5', borderColor: '#E8E1DC' }}
                  >
                    <Lock size={18} className="text-[#2E7D32] mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-emerald-800">
                        Protected with Token Authentication
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                        Your session is encrypted using secure HTTP-only cookie tokens with bank-grade encryption.
                      </p>
                    </div>
                  </div>

                  {/* Password Management Card */}
                  <div
                    className="p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    style={{ background: '#FFFFFF', borderColor: BORDER }}
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold" style={{ color: CHOCOLATE }}>
                        Account Password
                      </p>
                      <p className="text-xs" style={{ color: MUTED }}>
                        Ensure your account is protected with a strong, distinct password.
                      </p>
                    </div>

                    <Button
                      onClick={handleOpenModal}
                      className="flex items-center gap-2 font-semibold text-white px-4 py-2 rounded-lg flex-shrink-0 transition shadow-sm"
                      style={{ background: BRAND }}
                    >
                      <KeyRound size={15} />
                      <span>Update Password</span>
                    </Button>
                  </div>
                </div>
              </div>

              <div
                className="px-6 py-3 text-xs bg-stone-50 border-t flex items-center gap-1.5"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Multi-factor readiness active · Nib Security Standard</span>
              </div>
            </section>

          </div>
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: FINANCE & PAYOUTS (Admin Only)                                */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <TabsContent value="finance" className="space-y-6 focus-visible:outline-none">

            {/* Top Liability Summary Card */}
            <div
              className="bg-white rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border"
              style={{
                borderColor: 'rgba(212,175,55,0.40)',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFDF9 100%)',
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs"
                  style={{ background: 'rgba(212,175,55,0.18)', color: '#B8860B' }}
                >
                  <Wallet size={28} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                    Total Outstanding Liability
                  </p>
                  <h3 className="text-3xl font-extrabold tracking-tight tabular-nums mt-0.5" style={{ color: CHOCOLATE }}>
                    {Number(totalLiability).toLocaleString()} ETB
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    Cumulative commission rewards accrued across approved agents.
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Pending Payout Batch</span>
                </span>
              </div>
            </div>

            {/* Payouts Data Table */}
            <div
              className="bg-white rounded-xl shadow-sm overflow-hidden"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div
                className="px-6 py-4 flex items-center justify-between border-b"
                style={{ borderColor: BORDER }}
              >
                <div>
                  <h3 className="font-bold text-sm tracking-wide" style={{ color: CHOCOLATE }}>
                    Agent Earnings &amp; Payout Ledger
                  </h3>
                  <p className="text-xs" style={{ color: MUTED }}>
                    Individual performance earnings eligible for settlement.
                  </p>
                </div>
                <span className="text-xs font-medium" style={{ color: MUTED }}>
                  {agentsList.length} approved agent{agentsList.length !== 1 ? 's' : ''}
                </span>
              </div>

              {financeLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Spinner />
                </div>
              ) : agentsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Wallet size={32} style={{ color: MUTED }} strokeWidth={1.5} />
                  <p className="text-xs" style={{ color: MUTED }}>No approved agents found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr
                        className="border-b uppercase font-semibold tracking-wider text-[11px]"
                        style={{
                          background: '#FAF8F5',
                          borderColor: BORDER,
                          color: MUTED,
                        }}
                      >
                        <th className="py-3.5 px-6">Agent</th>
                        <th className="py-3.5 px-6">Referral Code</th>
                        <th className="py-3.5 px-6 text-center">Successful Referrals</th>
                        <th className="py-3.5 px-6 text-right">Available Balance</th>
                        <th className="py-3.5 px-6 text-right">Total Paid</th>
                        <th className="py-3.5 px-6 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: BORDER }}>
                      {agentsList.map((agent) => (
                        <tr
                          key={agent.id}
                          className="hover:bg-[#FAF8F5]/60 transition-colors"
                        >
                          {/* Agent Name + Phone */}
                          <td className="py-4 px-6">
                            <p className="font-bold text-sm" style={{ color: CHOCOLATE }}>
                              {agent.name}
                            </p>
                            <p className="text-[11px]" style={{ color: MUTED }}>
                              {agent.phone || agent.email}
                            </p>
                          </td>

                          {/* Referral Code */}
                          <td className="py-4 px-6">
                            <span
                              className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md border"
                              style={{
                                background: '#FAF8F5',
                                borderColor: '#E5DED6',
                                color: BRAND,
                              }}
                            >
                              {agent.referral_code ?? '—'}
                            </span>
                          </td>

                          {/* Successful Referrals */}
                          <td className="py-4 px-6 text-center">
                            <span className="font-bold text-sm tabular-nums" style={{ color: CHOCOLATE }}>
                              {agent.successful_referrals ?? 0}
                            </span>
                          </td>

                          {/* Available Balance */}
                          <td className="py-4 px-6 text-right">
                            <span
                              className="font-bold text-sm tabular-nums"
                              style={{ color: Number(agent.available_balance ?? 0) > 0 ? '#1A5C34' : CHOCOLATE }}
                            >
                              {Number(agent.available_balance ?? 0).toLocaleString()} ETB
                            </span>
                          </td>

                          {/* Total Paid */}
                          <td className="py-4 px-6 text-right">
                            <span className="font-semibold text-sm tabular-nums" style={{ color: MUTED }}>
                              {Number(agent.total_paid ?? 0).toLocaleString()} ETB
                            </span>
                          </td>

                          {/* Action Button or Paid Badge */}
                          <td className="py-4 px-6 text-right">
                            {Number(agent.available_balance ?? 0) > 0 ? (
                              <Button
                                type="button"
                                disabled={payingAgentId === agent.id}
                                onClick={() => handleMarkAsPaid(agent)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition shadow-2xs cursor-pointer hover:opacity-90 active:scale-95"
                                style={{ background: BRAND }}
                              >
                                <Check size={13} className="mr-1" />
                                <span>{payingAgentId === agent.id ? 'Processing…' : 'Mark as Paid'}</span>
                              </Button>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200"
                              >
                                <CheckCircle2 size={12} className="text-emerald-700" />
                                <span>Paid</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </TabsContent>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: SYSTEM CONFIGURATION (Admin Only)                             */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <TabsContent value="system" className="space-y-6 focus-visible:outline-none">

            {/* Config Header Section */}
            <div
              className="bg-white rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border"
              style={{ borderColor: BORDER }}
            >
              <div>
                <h3 className="font-bold text-base" style={{ color: CHOCOLATE }}>
                  Referral Milestone Tiers &amp; Rules
                </h3>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  Engine criteria governing progressive rewards and agent tier promotions.
                </p>
              </div>

              {/* Functional Edit Configuration Button */}
              <Button
                type="button"
                onClick={handleOpenConfigModal}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
                style={{ background: BRAND }}
              >
                <Sliders size={14} />
                <span>Edit Configuration</span>
              </Button>
            </div>

            {/* 3 Premium Reward Tier Cards */}
            {configLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Tier 1: Bronze */}
                <div
                  className="bg-white rounded-2xl p-6 shadow-sm border relative overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                  style={{ borderColor: 'rgba(205,127,50,0.35)' }}
                >
                  <div
                    className="absolute -top-10 -right-10 w-28 h-28 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(205,127,50,0.15) 0%, transparent 70%)' }}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shadow-2xs"
                        style={{ background: 'rgba(205,127,50,0.15)', color: '#A0522D' }}
                      >
                        <Award size={22} strokeWidth={2.2} />
                      </div>
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(205,127,50,0.12)', color: '#8A4D1F' }}
                      >
                        Level 1
                      </span>
                    </div>

                    <h4 className="text-lg font-bold" style={{ color: CHOCOLATE }}>
                      {rewardRules.find((r) => r.reward_name?.toLowerCase() === 'bronze')?.reward_name ?? 'Bronze Tier'}
                    </h4>

                    <div className="my-4 p-3 rounded-xl bg-[#FAF8F5] border" style={{ borderColor: '#E8E1DC' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                        Qualification Milestone
                      </p>
                      <p className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: BRAND }}>
                        {rewardRules.find((r) => r.reward_name?.toLowerCase() === 'bronze')?.min_referrals ?? 3}+ Referrals
                      </p>
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                      Entry milestone unlocking official agent certification, standard commission disbursement, and basic campaign participation.
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t flex items-center gap-1.5 text-[11px] font-medium" style={{ borderColor: BORDER, color: BRAND }}>
                    <Sparkles size={13} />
                    <span>Baseline Tier Active</span>
                  </div>
                </div>

                {/* Tier 2: Silver */}
                <div
                  className="bg-white rounded-2xl p-6 shadow-sm border relative overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                  style={{ borderColor: 'rgba(100,116,139,0.35)' }}
                >
                  <div
                    className="absolute -top-10 -right-10 w-28 h-28 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(100,116,139,0.15) 0%, transparent 70%)' }}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shadow-2xs"
                        style={{ background: 'rgba(100,116,139,0.15)', color: '#475569' }}
                      >
                        <Award size={22} strokeWidth={2.2} />
                      </div>
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(100,116,139,0.12)', color: '#334155' }}
                      >
                        Level 2
                      </span>
                    </div>

                    <h4 className="text-lg font-bold" style={{ color: CHOCOLATE }}>
                      {rewardRules.find((r) => r.reward_name?.toLowerCase() === 'silver')?.reward_name ?? 'Silver Tier'}
                    </h4>

                    <div className="my-4 p-3 rounded-xl bg-[#FAF8F5] border" style={{ borderColor: '#E8E1DC' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                        Qualification Milestone
                      </p>
                      <p className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: '#475569' }}>
                        {rewardRules.find((r) => r.reward_name?.toLowerCase() === 'silver')?.min_referrals ?? 5}+ Referrals
                      </p>
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                      Advanced performance milestone granting expedited payout processing, priority lead attribution, and seasonal campaign bonuses.
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t flex items-center gap-1.5 text-[11px] font-medium" style={{ borderColor: BORDER, color: '#475569' }}>
                    <Sparkles size={13} />
                    <span>Enhanced Commission Rate</span>
                  </div>
                </div>

                {/* Tier 3: Gold */}
                <div
                  className="bg-white rounded-2xl p-6 shadow-sm border relative overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                  style={{
                    borderColor: 'rgba(212,175,55,0.45)',
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFDF8 100%)',
                  }}
                >
                  <div
                    className="absolute -top-10 -right-10 w-28 h-28 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.20) 0%, transparent 70%)' }}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shadow-2xs"
                        style={{ background: 'rgba(212,175,55,0.20)', color: '#B8860B' }}
                      >
                        <Award size={22} strokeWidth={2.2} />
                      </div>
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(212,175,55,0.18)', color: '#B8860B' }}
                      >
                        Level 3 · Elite
                      </span>
                    </div>

                    <h4 className="text-lg font-bold" style={{ color: CHOCOLATE }}>
                      {rewardRules.find((r) => r.reward_name?.toLowerCase() === 'gold')?.reward_name ?? 'Gold Tier'}
                    </h4>

                    <div className="my-4 p-3 rounded-xl bg-[#FFFDF8] border" style={{ borderColor: 'rgba(212,175,55,0.30)' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#B8860B' }}>
                        Qualification Milestone
                      </p>
                      <p className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: '#B8860B' }}>
                        {rewardRules.find((r) => r.reward_name?.toLowerCase() === 'gold')?.min_referrals ?? 10}+ Referrals
                      </p>
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                      Top executive tier rewarding institutional volume with bespoke revenue share, VIP bank concierge support, and annual gala recognition.
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t flex items-center gap-1.5 text-[11px] font-medium" style={{ borderColor: BORDER, color: '#B8860B' }}>
                    <Sparkles size={13} />
                    <span>Maximum Tier Rewards</span>
                  </div>
                </div>

              </div>
            )}

          </TabsContent>
        )}

      </Tabs>

      {/* ── 3. Update Password Dialog (shadcn Modal) ─────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="bg-white border border-[#D6CCC5]/60 text-[#3E2723] sm:max-w-md p-6 rounded-2xl shadow-xl"
        >
          <DialogHeader className="gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(138,77,31,0.10)', color: BRAND }}
              >
                <KeyRound size={17} />
              </div>
              <DialogTitle className="text-lg font-bold" style={{ color: CHOCOLATE }}>
                Update Your Password
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs" style={{ color: MUTED }}>
              Enter your current password and choose a secure new password for your account.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 my-2">
            {/* Modal Error Banner */}
            {modalError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in-50">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: CHOCOLATE }}>
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border text-sm outline-none transition"
                  style={{
                    borderColor: '#D6CCC5',
                    background: '#FAF8F5',
                    color: CHOCOLATE,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = BRAND)}
                  onBlur={(e) => (e.target.style.borderColor = '#D6CCC5')}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: CHOCOLATE }}>
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border text-sm outline-none transition"
                  style={{
                    borderColor: '#D6CCC5',
                    background: '#FAF8F5',
                    color: CHOCOLATE,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = BRAND)}
                  onBlur={(e) => (e.target.style.borderColor = '#D6CCC5')}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword.length > 0 && (
                <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-stone-100">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (newPassword.length / 14) * 100)}%`,
                      backgroundColor:
                        newPassword.length < 8 ? '#EF4444' : newPassword.length < 12 ? GOLD : '#16A34A',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: CHOCOLATE }}>
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border text-sm outline-none transition"
                  style={{
                    borderColor: confirmPassword && confirmPassword !== newPassword ? '#EF4444' : '#D6CCC5',
                    background: '#FAF8F5',
                    color: CHOCOLATE,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = BRAND)}
                  onBlur={(e) =>
                    (e.target.style.borderColor =
                      confirmPassword && confirmPassword !== newPassword ? '#EF4444' : '#D6CCC5')
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <DialogFooter className="pt-3 gap-2 flex-col sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="border-stone-300 text-stone-700 hover:bg-stone-100 text-xs py-2 px-4 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="text-white text-xs py-2 px-5 rounded-lg font-semibold transition"
                style={{ background: BRAND }}
              >
                {submitting ? 'Updating…' : 'Confirm & Update'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── 4. Edit Configuration Dialog (shadcn Modal) ──────────────────────── */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent
          className="bg-white border border-[#D6CCC5]/60 text-[#3E2723] sm:max-w-md p-6 rounded-2xl shadow-xl"
        >
          <DialogHeader className="gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(138,77,31,0.10)', color: BRAND }}
              >
                <Sliders size={17} />
              </div>
              <DialogTitle className="text-lg font-bold" style={{ color: CHOCOLATE }}>
                Edit Reward Milestone Tiers
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs" style={{ color: MUTED }}>
              Set minimum required successful referrals for each milestone level. Rules must satisfy: Bronze &lt; Silver &lt; Gold.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfigSubmit} className="space-y-4 my-2">
            {/* Modal Error Banner */}
            {configModalError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in-50">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{configModalError}</span>
              </div>
            )}

            {/* Bronze Tier Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: CHOCOLATE }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#CD7F32]" />
                  <span>Bronze Tier (Min Referrals)</span>
                </label>
                <span className="text-[10px] font-bold text-[#8A4D1F] bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E5DED6]">
                  Level 1
                </span>
              </div>
              <Input
                type="number"
                min="0"
                step="1"
                value={bronzeVal}
                onChange={(e) => setBronzeVal(e.target.value)}
                placeholder="e.g. 3"
                className="h-10 text-sm font-semibold tabular-nums border-[#D6CCC5] bg-[#FAF8F5] text-[#3E2723] focus-visible:border-[#8A4D1F]"
              />
            </div>

            {/* Silver Tier Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: CHOCOLATE }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#64748B]" />
                  <span>Silver Tier (Min Referrals)</span>
                </label>
                <span className="text-[10px] font-bold text-[#475569] bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E5DED6]">
                  Level 2
                </span>
              </div>
              <Input
                type="number"
                min="0"
                step="1"
                value={silverVal}
                onChange={(e) => setSilverVal(e.target.value)}
                placeholder="e.g. 5"
                className="h-10 text-sm font-semibold tabular-nums border-[#D6CCC5] bg-[#FAF8F5] text-[#3E2723] focus-visible:border-[#8A4D1F]"
              />
            </div>

            {/* Gold Tier Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: CHOCOLATE }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
                  <span>Gold Tier (Min Referrals)</span>
                </label>
                <span className="text-[10px] font-bold text-[#B8860B] bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E5DED6]">
                  Level 3 · Elite
                </span>
              </div>
              <Input
                type="number"
                min="0"
                step="1"
                value={goldVal}
                onChange={(e) => setGoldVal(e.target.value)}
                placeholder="e.g. 10"
                className="h-10 text-sm font-semibold tabular-nums border-[#D6CCC5] bg-[#FAF8F5] text-[#3E2723] focus-visible:border-[#8A4D1F]"
              />
            </div>

            {/* Live Hierarchy Check Display */}
            {(() => {
              const b = parseInt(bronzeVal, 10);
              const s = parseInt(silverVal, 10);
              const g = parseInt(goldVal, 10);
              const isValid = !isNaN(b) && !isNaN(s) && !isNaN(g) && b < s && s < g;

              return (
                <div
                  className="p-3 rounded-xl border text-xs flex items-center justify-between transition-colors"
                  style={{
                    background: isValid ? 'rgba(26,92,52,0.06)' : 'rgba(230,81,0,0.06)',
                    borderColor: isValid ? 'rgba(26,92,52,0.25)' : 'rgba(230,81,0,0.25)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    {isValid ? (
                      <CheckCircle2 size={16} className="text-emerald-700 flex-shrink-0" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-700 flex-shrink-0" />
                    )}
                    <span className="font-medium" style={{ color: CHOCOLATE }}>
                      Current: {b || 0} &lt; {s || 0} &lt; {g || 0} Referrals
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: isValid ? '#1A5C34' : '#E65100' }}
                  >
                    {isValid ? 'Valid Order' : 'Rule Violation'}
                  </span>
                </div>
              );
            })()}

            <DialogFooter className="pt-3 gap-2 flex-col sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfigModalOpen(false)}
                className="border-stone-300 text-stone-700 hover:bg-stone-100 text-xs py-2 px-4 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={configSubmitting}
                className="text-white text-xs py-2 px-5 rounded-lg font-semibold transition"
                style={{ background: BRAND }}
              >
                {configSubmitting ? 'Saving…' : 'Save Thresholds'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
