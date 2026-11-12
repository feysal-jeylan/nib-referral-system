/**
 * features/dashboard/pages/SettingsPage.jsx
 * ──────────────────────────────────────────
 * Account settings and password management for both Admin and Agent users.
 *
 * Props: user, isAdmin, onToast
 */

import { useState } from 'react';
import { KeyRound, ShieldCheck, UserCircle, CheckCircle2 } from 'lucide-react';
import api from '@/services/api';

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.10)';

export default function SettingsPage({ user, isAdmin, onToast }) {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving,          setSaving]          = useState(false);
  const [errorMsg,        setErrorMsg]        = useState('');
  const [successMsg,      setSuccessMsg]      = useState('');

  async function handlePasswordChange(e) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newPassword || newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', { newPassword });
      setSuccessMsg('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
      onToast?.({ type: 'success', message: '✅ Password changed successfully.' });
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to update password.';
      setErrorMsg(msg);
      onToast?.({ type: 'error', message: `🔴 ${msg}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl" style={{ background: IVORY }}>
      {/* ── 1. Account Details Card ────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="p-2 rounded-lg" style={{ background: 'rgba(138,77,31,0.10)' }}>
            <UserCircle size={20} style={{ color: BRAND }} />
          </div>
          <div>
            <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
              Account Profile
            </h2>
            <p className="text-xs" style={{ color: MUTED }}>
              Your account details within Nib Referral System
            </p>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg" style={{ background: '#FAF8F5' }}>
            <p className="text-xs font-medium" style={{ color: MUTED }}>Username / Email</p>
            <p className="text-sm font-bold mt-1" style={{ color: CHOCOLATE }}>
              {user?.username ?? '—'}
            </p>
          </div>

          <div className="p-4 rounded-lg" style={{ background: '#FAF8F5' }}>
            <p className="text-xs font-medium" style={{ color: MUTED }}>Assigned Role</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{
                  background: isAdmin ? 'rgba(138,77,31,0.12)' : 'rgba(212,175,55,0.20)',
                  color: isAdmin ? BRAND : '#8A5D00',
                }}
              >
                {isAdmin ? 'System Administrator' : 'Referral Agent'}
              </span>
            </div>
          </div>

          {user?.agent_id && (
            <div className="p-4 rounded-lg" style={{ background: '#FAF8F5' }}>
              <p className="text-xs font-medium" style={{ color: MUTED }}>Agent ID</p>
              <p className="text-sm font-bold mt-1" style={{ color: CHOCOLATE }}>
                #{user.agent_id}
              </p>
            </div>
          )}

          <div className="p-4 rounded-lg" style={{ background: '#FAF8F5' }}>
            <p className="text-xs font-medium" style={{ color: MUTED }}>Security Status</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck size={16} />
              Active &amp; Authenticated
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Password Change Card ────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="p-2 rounded-lg" style={{ background: 'rgba(138,77,31,0.10)' }}>
            <KeyRound size={20} style={{ color: BRAND }} />
          </div>
          <div>
            <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
              Change Password
            </h2>
            <p className="text-xs" style={{ color: MUTED }}>
              Update your account password regularly for enhanced security
            </p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="p-6 space-y-4 max-w-md">
          {errorMsg && (
            <div className="p-3 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={15} />
              {successMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: CHOCOLATE }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3.5 py-2 rounded-lg border text-sm outline-none transition"
              style={{ borderColor: '#D6CCC5', background: '#FFFFFF', color: CHOCOLATE }}
              onFocus={(e) => (e.target.style.borderColor = BRAND)}
              onBlur={(e) => (e.target.style.borderColor = '#D6CCC5')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: CHOCOLATE }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full px-3.5 py-2 rounded-lg border text-sm outline-none transition"
              style={{ borderColor: '#D6CCC5', background: '#FFFFFF', color: CHOCOLATE }}
              onFocus={(e) => (e.target.style.borderColor = BRAND)}
              onBlur={(e) => (e.target.style.borderColor = '#D6CCC5')}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: BRAND }}
          >
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
