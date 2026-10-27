/**
 * referral-web/src/ChangePassword.jsx
 * ─────────────────────────────────────
 * Forced password-change screen — rendered by App.jsx when the logged-in
 * user's must_change_password flag is TRUE.
 *
 * This screen BLOCKS access to the full dashboard until the agent sets their
 * own permanent password. No agent data is exposed until this step completes.
 *
 * Flow:
 *   1. Agent logs in with temp password → must_change_password = TRUE.
 *   2. App.jsx renders <ChangePassword /> instead of <Dashboard />.
 *   3. Agent enters and confirms a new password, submits.
 *   4. POST /api/auth/change-password:
 *        - Hashes new password with bcrypt (salt factor 12).
 *        - Atomically updates password_hash + sets must_change_password = FALSE.
 *        - Issues a fresh JWT cookie with must_change_password = false.
 *   5. On success, refreshUser() updates AuthContext → App.jsx re-renders
 *      the Dashboard. The temp password is now cryptographically invalidated.
 *
 * Styling: Navy (#002B5B) / Gold (#96720C) corporate theme, matching App.css.
 */

import { useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export default function ChangePassword() {
  const { user, logout, refreshUser } = useAuth();

  const [form, setForm]           = useState({ newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);
  const newPwRef = useRef(null);

  function handleChange(e) {
    setError('');
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // ── Client-side validation ────────────────────────────────────────────
    if (form.newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method:      'POST',
        credentials: 'include', // Sends the HttpOnly JWT cookie
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ newPassword: form.newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // ── Success ────────────────────────────────────────────────────────
      // Show a brief success state, then update AuthContext which causes
      // App.jsx to re-render the Dashboard automatically.
      setSuccess(true);
      setTimeout(() => {
        // data.user has must_change_password: false — this unlocks the dashboard.
        refreshUser(data.user);
      }, 1200);

    } catch {
      setError('Cannot reach the server. Is the API running?');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  // ── Strength indicator ──────────────────────────────────────────────────
  function getStrength(pw) {
    if (!pw) return { level: 0, label: '', color: 'transparent' };
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: 'Weak',   color: '#EF4444' };
    if (score <= 3) return { level: 2, label: 'Fair',   color: '#F59E0B' };
    return              { level: 3, label: 'Strong', color: '#22C55E' };
  }

  const strength = getStrength(form.newPassword);

  return (
    <div style={styles.page}>
      {/* ── Header (matches App.css .app-header) ──────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <div style={styles.monogram}>NIB</div>
            <div>
              <div style={styles.headerTitle}>Nib International Bank</div>
              <div style={styles.headerSub}>AGENT PORTAL — ACCOUNT SETUP</div>
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            ↩ Sign Out
          </button>
        </div>
      </header>

      {/* ── Card ─────────────────────────────────────────────────────── */}
      <main style={styles.main}>
        <div style={styles.card}>

          {/* Lock icon + headline */}
          <div style={styles.iconWrap} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="#002B5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h1 style={styles.title}>Set Your Password</h1>
          <p style={styles.subtitle}>
            Welcome, <strong>{user?.username}</strong>. You are using a temporary
            password. You must set a permanent password before accessing the portal.
          </p>

          {/* Security rationale banner */}
          <div style={styles.infoBanner}>
            <strong>Why am I seeing this?</strong> For your security, temporary
            passwords are single-use. Once you set a permanent password, the
            temporary one is cryptographically invalidated and can never be used again.
          </div>

          {success ? (
            <div style={styles.successBox} role="status">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#14532D" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Password set successfully. Loading your dashboard…</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate style={styles.form}
              aria-label="Set permanent password">

              {/* New password */}
              <div style={styles.field}>
                <label style={styles.label} htmlFor="cp-new-password">
                  New Password
                </label>
                <input
                  id="cp-new-password"
                  name="newPassword"
                  type="password"
                  value={form.newPassword}
                  onChange={handleChange}
                  required
                  autoFocus
                  ref={newPwRef}
                  style={styles.input}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
                {/* Strength bar */}
                {form.newPassword && (
                  <div style={styles.strengthWrap}>
                    <div style={styles.strengthTrack}>
                      {[1, 2, 3].map(n => (
                        <div key={n} style={{
                          ...styles.strengthSegment,
                          background: strength.level >= n ? strength.color : '#E5E7EB',
                        }} />
                      ))}
                    </div>
                    <span style={{ ...styles.strengthLabel, color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div style={styles.field}>
                <label style={styles.label} htmlFor="cp-confirm-password">
                  Confirm New Password
                </label>
                <input
                  id="cp-confirm-password"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  style={{
                    ...styles.input,
                    borderColor: form.confirmPassword && form.confirmPassword !== form.newPassword
                      ? '#EF4444' : undefined,
                  }}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />
              </div>

              {/* Error message */}
              {error && (
                <div style={styles.errorBox} role="alert">
                  {error}
                </div>
              )}

              <button
                id="change-password-btn"
                type="submit"
                disabled={submitting}
                style={{
                  ...styles.submitBtn,
                  opacity: submitting ? 0.6 : 1,
                  cursor:  submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Setting Password…' : 'Set Permanent Password'}
              </button>
            </form>
          )}
        </div>

        <p style={styles.footer}>
          Nib International Bank · Internal Security System · All sessions are monitored.
        </p>
      </main>
    </div>
  );
}

// ── Inline styles (scoped to this component, no CSS file pollution) ────────
const styles = {
  page: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    background:     '#F2F5F8',
    fontFamily:     "'Inter', 'Segoe UI', system-ui, sans-serif",
    WebkitFontSmoothing: 'antialiased',
  },
  header: {
    background:   '#002B5B',
    borderBottom: '3px solid #96720C',
    boxShadow:    '0 2px 6px rgba(0,0,0,0.2)',
  },
  headerInner: {
    maxWidth:        '520px',
    margin:          '0 auto',
    padding:         '14px 24px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  brand: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
  },
  monogram: {
    width:           '36px',
    height:          '36px',
    background:      '#96720C',
    color:           '#fff',
    fontSize:        '11px',
    fontWeight:      '800',
    letterSpacing:   '0.6px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    '4px',
    flexShrink:      0,
    userSelect:      'none',
  },
  headerTitle: {
    fontSize:      '16px',
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: '-0.2px',
    lineHeight:    '1.2',
  },
  headerSub: {
    fontSize:      '9.5px',
    color:         'rgba(255,255,255,0.5)',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    marginTop:     '2px',
  },
  logoutBtn: {
    background:    'transparent',
    border:        '1px solid rgba(255,255,255,0.25)',
    color:         'rgba(255,255,255,0.8)',
    borderRadius:  '4px',
    padding:       '6px 14px',
    fontSize:      '12px',
    fontWeight:    '600',
    cursor:        'pointer',
    fontFamily:    'inherit',
    transition:    'border-color 0.14s, color 0.14s',
  },
  main: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    justifyContent:'center',
    padding:       '32px 24px 48px',
  },
  card: {
    background:   '#fff',
    border:       '1px solid #D8DEE6',
    borderRadius: '8px',
    boxShadow:    '0 1px 4px rgba(0,0,0,0.06), 0 4px 20px rgba(0,43,91,0.09)',
    padding:      '40px 40px 36px',
    width:        '100%',
    maxWidth:     '440px',
    display:      'flex',
    flexDirection:'column',
    gap:          '20px',
  },
  iconWrap: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    width:           '52px',
    height:          '52px',
    background:      '#EBF0F7',
    borderRadius:    '50%',
    alignSelf:       'flex-start',
  },
  title: {
    fontSize:      '20px',
    fontWeight:    '700',
    color:         '#002B5B',
    letterSpacing: '-0.3px',
    lineHeight:    '1.2',
  },
  subtitle: {
    fontSize:   '13.5px',
    color:      '#374151',
    lineHeight: '1.6',
    margin:     '-8px 0 0',
  },
  infoBanner: {
    background:   '#EBF0F7',
    border:       '1px solid rgba(0,43,91,0.15)',
    borderLeft:   '3px solid #96720C',
    borderRadius: '4px',
    padding:      '10px 14px',
    fontSize:     '12px',
    color:        '#1E3A5F',
    lineHeight:   '1.55',
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '16px',
  },
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '5px',
  },
  label: {
    fontSize:      '11px',
    fontWeight:    '700',
    color:         '#6B7280',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  input: {
    background:   '#F2F5F8',
    border:       '1.5px solid #D8DEE6',
    borderRadius: '4px',
    color:        '#111827',
    fontFamily:   "inherit",
    fontSize:     '13.5px',
    padding:      '9px 12px',
    outline:      'none',
    width:        '100%',
    transition:   'border-color 0.14s, box-shadow 0.14s',
  },
  strengthWrap: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    marginTop:  '4px',
  },
  strengthTrack: {
    display: 'flex',
    gap:     '4px',
    flex:    1,
  },
  strengthSegment: {
    flex:         1,
    height:       '4px',
    borderRadius: '2px',
    transition:   'background 0.25s',
  },
  strengthLabel: {
    fontSize:   '11px',
    fontWeight: '600',
    flexShrink: 0,
    width:      '44px',
    textAlign:  'right',
  },
  errorBox: {
    background:   '#FFF5F5',
    border:       '1px solid #FCA5A5',
    borderLeft:   '3px solid #EF4444',
    borderRadius: '4px',
    padding:      '10px 14px',
    fontSize:     '12.5px',
    color:        '#7F1D1D',
  },
  successBox: {
    display:      'flex',
    alignItems:   'center',
    gap:          '10px',
    background:   '#F0FDF4',
    border:       '1px solid #86EFAC',
    borderLeft:   '3px solid #22C55E',
    borderRadius: '4px',
    padding:      '14px 16px',
    fontSize:     '13px',
    fontWeight:   '500',
    color:        '#14532D',
  },
  submitBtn: {
    background:    '#002B5B',
    color:         '#fff',
    border:        'none',
    borderRadius:  '4px',
    padding:       '11px 20px',
    fontSize:      '13.5px',
    fontWeight:    '600',
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.2px',
    transition:    'background 0.14s',
    alignSelf:     'stretch',
  },
  footer: {
    marginTop:  '20px',
    fontSize:   '11px',
    color:      '#9CA3AF',
    textAlign:  'center',
  },
};
