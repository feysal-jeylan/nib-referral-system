/**
 * features/dashboard/pages/SettingsPage.jsx
 * ──────────────────────────────────────────
 * Enterprise settings panel for Admins and Agents.
 *
 * Sections:
 *  1. Profile Section  — Read-only Username/Email, Role, and Agent ID
 *  2. Security Section — Status summary with "Update Password" action
 *  3. shadcn Dialog    — Secure modal containing Change Password form
 *
 * Props: user, isAdmin, onToast
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
} from 'lucide-react';
import useAppStore from '@/store/useAppStore';
import api from '@/services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const GOLD      = '#D4AF37';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.10)';

export default function SettingsPage({ user: propUser, onToast }) {
  const storeUser = useAppStore((s) => s.user);
  const user      = storeUser || propUser;
  const isAdmin   = user?.role === 'ADMIN';

  // Agent ID lookup (if not present on user object)
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

  // ── Modal State ─────────────────────────────────────────────────────────────
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

  return (
    <div className="p-6 space-y-6 max-w-5xl" style={{ background: IVORY }}>

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: CHOCOLATE }}>
          Account &amp; Security Settings
        </h1>
        <p className="text-xs" style={{ color: MUTED }}>
          Manage your system profile information and authentication credentials.
        </p>
      </div>

      {/* ── Two-Column Layout ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 1. Profile Section (Read-only) ─────────────────────────────────── */}
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

        {/* ── 2. Security Section ────────────────────────────────────────────── */}
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

    </div>
  );
}
