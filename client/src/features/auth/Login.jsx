/**
 * client/src/features/auth/Login.jsx
 * ─────────────────────────────────────
 * Premium enterprise login — Nib International Bank Referral System.
 *
 * Phase 6 Brand Refresh — exact replica of reference design:
 *   - Desktop: 55/45 split-screen with curved SVG divider
 *   - Mobile:  stacked — compact branding header on top, form below
 *   - Left panel: ivory + gold honeycomb + layered wave footer
 *   - Right panel: clean auth form with icon inputs + eye toggle
 *
 * Logic & API calls: unchanged from previous version.
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';

// ─── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  brown:      '#8A4D1F',   // deep warm brown — primary CTA
  brownDark:  '#5C3010',   // hover state
  brownMuted: '#7F483B',
  gold:       '#D4AF37',   // honey gold — accents
  goldDim:    '#C49B2A',
  panel:      '#F5EFE6',   // left panel ivory
  pageBg:     '#FBF8F4',   // right panel lighter ivory
  border:     '#E8DDD2',
  text1:      '#1C0F05',   // darkest
  text2:      '#4A3728',
  text3:      '#9C8577',
};

// ─── Honeycomb SVG background ──────────────────────────────────────────────────
function HoneycombBg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Single hexagon tile, offset rows for honeycomb effect */}
        <pattern id="hc" x="0" y="0" width="70" height="80" patternUnits="userSpaceOnUse">
          {/* Upright hexagon */}
          <polygon
            points="35,4 62,20 62,52 35,68 8,52 8,20"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="0.9"
            opacity="0.30"
          />
        </pattern>
        <pattern id="hc2" x="35" y="40" width="70" height="80" patternUnits="userSpaceOnUse">
          <polygon
            points="35,4 62,20 62,52 35,68 8,52 8,20"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="0.9"
            opacity="0.18"
          />
        </pattern>
        {/* Edge vignette — fades pattern toward centre */}
        <radialGradient id="hcFade" cx="50%" cy="50%" r="65%">
          <stop offset="0%"   stopColor={C.panel} stopOpacity="0.72" />
          <stop offset="100%" stopColor={C.panel} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#hc)" />
      <rect width="100%" height="100%" fill="url(#hc2)" />
      {/* Centre fade so pattern is prominent at edges only */}
      <rect width="100%" height="100%" fill="url(#hcFade)" />
    </svg>
  );
}

// ─── Layered wave footer SVG ───────────────────────────────────────────────────
// 4 overlapping waves: ivory → light-gold → amber → dark-brown
function WaveFooter() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: '38%' }}>
      <svg
        viewBox="0 0 500 180"
        preserveAspectRatio="none"
        className="w-full h-full"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Wave 1 — lightest gold */}
        <path
          d="M0,120 C80,80 180,155 280,110 C370,70 430,135 500,100 L500,180 L0,180 Z"
          fill="#E8C96B"
          opacity="0.55"
        />
        {/* Wave 2 — amber */}
        <path
          d="M0,138 C60,105 160,165 260,128 C360,92 440,148 500,118 L500,180 L0,180 Z"
          fill="#C49B2A"
          opacity="0.72"
        />
        {/* Wave 3 — rich brown-gold */}
        <path
          d="M0,152 C70,125 170,172 270,148 C380,122 450,160 500,138 L500,180 L0,180 Z"
          fill="#8A4D1F"
          opacity="0.88"
        />
        {/* Wave 4 — dark chocolate (bottom fill) */}
        <path
          d="M0,164 C90,148 190,178 290,160 C390,144 460,170 500,155 L500,180 L0,180 Z"
          fill="#3D1A08"
        />
      </svg>

      {/* "Committed to Service Excellence." text riding the wave */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3 px-6">
        <div className="h-px flex-1 max-w-[60px]" style={{ background: `${C.gold}80` }} />
        <p className="text-white text-[10px] tracking-widest uppercase font-light select-none">
          Committed to Service Excellence.
        </p>
        <div className="h-px flex-1 max-w-[60px]" style={{ background: `${C.gold}80` }} />
      </div>
    </div>
  );
}

// ─── Curved SVG divider between panels (desktop only) ─────────────────────────
function CurvedDivider() {
  return (
    <svg
      className="hidden lg:block absolute top-0 right-0 h-full z-10 pointer-events-none"
      style={{ width: '64px', marginRight: '-1px' }}
      viewBox="0 0 64 800"
      preserveAspectRatio="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* White right-panel fill curves over the left panel */}
      <path d="M64,0 Q0,400 64,800 L64,0 Z" fill={C.pageBg} />
      {/* Gold stroke along the curve edge */}
      <path
        d="M64,0 Q0,400 64,800"
        fill="none"
        stroke={C.gold}
        strokeWidth="0.8"
        opacity="0.55"
      />
    </svg>
  );
}

// ─── NIB geometric logo symbol (SVG, matches reference image) ─────────────────
// Used in the right-panel footer when no image is available
function NibSymbol({ size = 28 }) {
  return (
    <img
      src="/nib-logo.png"
      alt="NIB"
      width={size}
      height={size}
      className="rounded-full object-cover flex-shrink-0"
      style={{ opacity: 0.75 }}
    />
  );
}

// ─── Left branding panel ───────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div
      className="hidden lg:flex relative flex-col overflow-hidden flex-shrink-0"
      style={{ width: '55%', background: C.panel }}
    >
      {/* Honeycomb pattern */}
      <HoneycombBg />

      {/* Top-left: logo + divider + bank name */}
      <div className="relative z-10 flex items-center gap-3 p-8 xl:p-10">
        <img
          src="/nib-logo.png"
          alt="NIB Logo"
          className="w-11 h-11 rounded-full object-cover flex-shrink-0 shadow-sm"
        />
        {/* Thin vertical gold divider */}
        <div className="w-px h-9 self-stretch" style={{ background: `${C.gold}60` }} />
        <div>
          <p className="font-bold text-sm leading-tight" style={{ color: C.text1 }}>
            Nib International
          </p>
          <p className="font-bold text-sm leading-tight" style={{ color: C.text1 }}>
            Bank
          </p>
        </div>
      </div>

      {/* Main headline — centred vertically in remaining space */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-10 xl:px-14 pb-32">
        <p
          className="font-bold text-3xl xl:text-4xl leading-tight mb-2"
          style={{ color: C.text1 }}
        >
          Welcome to the
        </p>
        <p
          className="font-bold text-3xl xl:text-4xl leading-tight"
          style={{ color: C.gold, fontFamily: "'Georgia', 'Times New Roman', serif" }}
        >
          NIB Referral Portal
        </p>

        {/* Tagline */}
        <div className="mt-5">
          <p className="text-base font-normal" style={{ color: C.text2 }}>
            Connect. Refer. Grow.
          </p>
          {/* Short gold underline */}
          <div
            className="mt-2 h-[2px] rounded-full"
            style={{ width: '56px', background: C.gold }}
          />
        </div>
      </div>

      {/* Layered wave + tagline footer */}
      <WaveFooter />

      {/* Curved divider — bleeds over the seam between panels */}
      <CurvedDivider />
    </div>
  );
}

// ─── Error / Success banners ───────────────────────────────────────────────────
function ErrorBanner({ message }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg p-3.5 text-xs leading-relaxed"
      style={{
        background:  '#FDF3F0',
        border:      '1px solid #E8A090',
        borderLeft:  '3px solid #C0442A',
        color:       '#7A2518',
      }}
      role="alert"
      aria-live="assertive"
    >
      <span className="mt-0.5 flex-shrink-0" style={{ color: '#C0442A' }} aria-hidden="true">⚠</span>
      <span>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg p-3.5 text-xs leading-relaxed"
      style={{
        background: '#F2FAF4',
        border:     '1px solid #7DC898',
        borderLeft: '3px solid #2D8A50',
        color:      '#1A5C34',
      }}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5 flex-shrink-0" style={{ color: '#2D8A50' }} aria-hidden="true">✓</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Shared input style ────────────────────────────────────────────────────────
function inputCls(hasError) {
  const base =
    'w-full bg-white border rounded-lg px-4 py-3 pl-11 text-sm outline-none transition-all duration-200 ' +
    'placeholder-[#9C8577] ';
  const focus = hasError
    ? 'border-[#E8A090] focus:border-[#C0442A] focus:shadow-[0_0_0_3px_rgba(192,68,42,0.12)]'
    : `border-[${C.border}] focus:border-[${C.gold}] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.18)]`;
  return base + focus;
}

// ─── SVG icon: person (user) ──────────────────────────────────────────────────
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

// ─── SVG icon: lock ───────────────────────────────────────────────────────────
function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ─── SVG icon: eye / eye-off ──────────────────────────────────────────────────
function IconEye({ off = false }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ─── Agent apply form ──────────────────────────────────────────────────────────
function AgentApplyForm({ onBack, onSuccess }) {
  const [form, setForm]             = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name  = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (!name || !phone || !email) { setError('Please fill in all three fields.'); return; }
    if (!email.includes('@'))      { setError('Please enter a valid email address.'); return; }
    setSubmitting(true); setError('');
    try {
      await api.post('/agents/apply', { name, phone, email });
      onSuccess();
    } catch (err) {
      setError(
        err.response?.status === 409
          ? 'An agent with this phone or email already exists.'
          : (err.response?.data?.error ?? 'Something went wrong. Please try again.')
      );
    } finally { setSubmitting(false); }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors"
        style={{ color: C.brown }}
        onMouseEnter={e => { e.currentTarget.style.color = C.gold; }}
        onMouseLeave={e => { e.currentTarget.style.color = C.brown; }}
      >
        ← Back to Sign In
      </button>

      <div className="mb-6">
        <h2 className="font-bold text-xl tracking-tight" style={{ color: C.text1 }}>
          Agent Application
        </h2>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: C.text3 }}>
          Submit your details to apply as a Nib referral agent. An Admin will review your application.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Agent application form">
        {[
          { id: 'apply-name',  name: 'name',  type: 'text',  label: 'Full Name',     ph: 'e.g. Sara Tesfaye',     ac: 'name'  },
          { id: 'apply-phone', name: 'phone', type: 'tel',   label: 'Phone Number',  ph: 'e.g. 0912345678',       ac: 'tel'   },
          { id: 'apply-email', name: 'email', type: 'email', label: 'Email Address', ph: 'e.g. sara@example.com', ac: 'email' },
        ].map(({ id, name, type, label, ph, ac }, i) => (
          <div key={id}>
            <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
              style={{ color: C.text3 }} htmlFor={id}>
              {label}
            </label>
            <input
              id={id} name={name} type={type}
              className={inputCls(!!error)}
              style={{ paddingLeft: '1rem' }}
              placeholder={ph}
              value={form[name]}
              onChange={handleChange}
              autoComplete={ac}
              autoFocus={i === 0}
              required
            />
          </div>
        ))}

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold text-white transition-all duration-200 disabled:opacity-55 disabled:cursor-not-allowed"
          style={{ background: C.brown }}
          onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = C.brownDark; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.brown; }}
        >
          {submitting
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
            : 'Submit Application'
          }
        </button>
      </form>
    </div>
  );
}

// ─── Main Login component ──────────────────────────────────────────────────────
export default function Login() {
  const { login } = useAuth();

  const [form, setForm]                 = useState({ username: '', password: '' });
  const [error, setError]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [showPw, setShowPw]             = useState(false);
  const [view, setView]                 = useState('login');   // 'login' | 'apply'
  const [applySuccess, setApplySuccess] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Please enter both your username and password.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      const { data } = await api.post('/auth/login', {
        username: form.username.trim(),
        password: form.password,
      });
      login(data.user);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Invalid username or password. Please try again.');
    } finally { setSubmitting(false); }
  }

  function handleApplySuccess() {
    setView('login');
    setApplySuccess('Application submitted! An Admin will review and send your login credentials.');
    setTimeout(() => setApplySuccess(''), 9000);
  }

  return (
    <div className="min-h-screen flex" style={{ background: C.pageBg }}>

      {/* ── LEFT panel (desktop only) ── */}
      <BrandPanel />

      {/* ── RIGHT panel — form ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10 relative overflow-hidden"
        style={{ background: C.pageBg }}
      >
        {/* Faint honeycomb on right panel too (subtle, mobile-visible) */}
        <div className="lg:hidden absolute inset-0 pointer-events-none opacity-30">
          <HoneycombBg />
        </div>

        {/* ── Mobile compact header (hidden on lg+) ── */}
        <div className="lg:hidden relative z-10 w-full max-w-[400px] mb-6">
          {/* Logo + bank name */}
          <div className="flex items-center gap-3 mb-5">
            <img
              src="/nib-logo.png"
              alt="NIB Logo"
              className="w-11 h-11 rounded-full object-cover shadow-sm flex-shrink-0"
            />
            <div className="w-px h-9" style={{ background: `${C.gold}60` }} />
            <div>
              <p className="font-bold text-sm leading-tight" style={{ color: C.text1 }}>Nib International</p>
              <p className="font-bold text-sm leading-tight" style={{ color: C.text1 }}>Bank</p>
            </div>
          </div>
          {/* Mobile headline */}
          <p className="font-bold text-2xl leading-snug" style={{ color: C.text1 }}>Welcome to the</p>
          <p className="font-bold text-2xl leading-snug" style={{ color: C.gold }}>NIB Referral Portal</p>
          <p className="mt-2 text-sm" style={{ color: C.text2 }}>Connect. Refer. Grow.</p>
          <div className="mt-2 h-[2px] rounded-full w-12" style={{ background: C.gold }} />
        </div>

        {/* ── Auth form card ── */}
        <div className="relative z-10 w-full max-w-[400px]">
          {view === 'apply' ? (
            <AgentApplyForm onBack={() => setView('login')} onSuccess={handleApplySuccess} />
          ) : (
            <div>
              {/* Heading */}
              <div className="mb-7">
                <h1 className="font-bold text-2xl tracking-tight" style={{ color: C.text1 }}>
                  Welcome Back
                </h1>
                <p className="text-sm mt-1" style={{ color: C.text3 }}>
                  Sign in to continue
                </p>
              </div>

              {applySuccess && <div className="mb-5"><SuccessBanner message={applySuccess} /></div>}

              <form
                id="login-form"
                onSubmit={handleSubmit}
                noValidate
                className="space-y-4"
                aria-label="Login form"
              >
                {/* Email / Staff ID */}
                <div className="relative">
                  <span
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
                    style={{ color: C.text3 }}
                  >
                    <IconUser />
                  </span>
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    className={inputCls(!!error)}
                    placeholder="Email address or Staff ID"
                    value={form.username}
                    onChange={handleChange}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>

                {/* Password */}
                <div className="relative">
                  <span
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
                    style={{ color: C.text3 }}
                  >
                    <IconLock />
                  </span>
                  <input
                    id="login-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    className={inputCls(!!error)}
                    style={{ paddingRight: '2.75rem' }}
                    placeholder="Password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    required
                  />
                  {/* Eye toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center transition-opacity hover:opacity-70"
                    style={{ color: C.text3 }}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    <IconEye off={showPw} />
                  </button>
                </div>

                {error && <ErrorBanner message={error} />}

                {/* Sign in button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold text-white transition-all duration-200 disabled:opacity-55 disabled:cursor-not-allowed"
                  style={{ background: C.brown }}
                  onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = C.brownDark; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.brown; }}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Sign in →'
                  )}
                </button>
              </form>

              {/* Footer — divider + NIB symbol + secure text */}
              <div className="mt-8">
                <div className="h-px w-full" style={{ background: C.border }} />
                <div className="mt-5 flex flex-col items-center gap-2">
                  <NibSymbol size={26} />
                  <p className="text-[11px] text-center" style={{ color: C.text3 }}>
                    Secure access for authorized users
                  </p>
                </div>
              </div>

              {/* Apply to become an agent — subtle bottom link */}
              <div className="mt-5 text-center">
                <button
                  type="button"
                  className="text-xs transition-colors duration-150"
                  style={{ color: C.text3 }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.brown; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.text3; }}
                  onClick={() => { setError(''); setApplySuccess(''); setView('apply'); }}
                >
                  Apply to become an agent →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
