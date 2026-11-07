/**
 * features/agents/AgentForm.jsx
 * ──────────────────────────────
 * Admin-only form to register a new agent directly (bypasses the
 * self-registration flow). On success, calls onCreated() with the
 * optimistic agent object so the parent can prepend it to the list
 * immediately while the next poll refreshes the full data.
 * Pure Tailwind — no App.css dependency.
 *
 * Props:
 *   onCreated {(agent: object) => void}
 *   onToast   {(toast: { type, message }) => void}
 */
import { useRef, useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';

// Shared input class
const INPUT_CLS =
  'w-full px-4 py-2.5 bg-bg border border-border rounded-md text-sm text-text-1 ' +
  'placeholder-text-3 outline-none transition-all duration-150 ' +
  'focus:border-gold focus:ring-1 focus:ring-gold focus:bg-surface';

export default function AgentForm({ onCreated, onToast }) {
  const [form, setForm]             = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/agents', form);

      onCreated({
        id: data.id, name: data.name,
        referral_code: data.referral_code,
        status: data.status ?? 'APPROVED',
        successful_referrals: 0, current_reward: null,
      });
      onToast({
        type: 'success',
        message: `✅ Agent "${data.name}" created — Code: ${data.referral_code} · Temp Password: ${data.temp_password}`,
      });
      setForm({ name: '', phone: '', email: '' });
      nameRef.current?.focus();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        onToast({ type: 'error', message: '🔒 Your session has expired. Please log in again.' });
        return;
      }
      const msg = status === 409
        ? '⚠️ An agent with this phone number or email already exists.'
        : (err.response?.data?.error ?? 'Something went wrong. Please try again.');
      onToast({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="agent-form"
      className="p-6"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Register a new agent"
    >
      <h2 className="text-text-1 font-bold text-base mb-5 pb-4 border-b border-border">
        Register New Agent
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* Full Name */}
        <div>
          <label
            htmlFor="agent-name"
            className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5"
          >
            Full Name
          </label>
          <input
            id="agent-name" name="name" type="text"
            placeholder="e.g. Abebe Kebede"
            value={form.name} onChange={handleChange}
            required ref={nameRef} autoComplete="off"
            className={INPUT_CLS}
          />
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="agent-phone"
            className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5"
          >
            Phone Number
          </label>
          <input
            id="agent-phone" name="phone" type="tel"
            placeholder="e.g. 0911234567"
            value={form.phone} onChange={handleChange}
            required autoComplete="off"
            className={INPUT_CLS}
          />
        </div>

        {/* Email — spans remaining column(s) */}
        <div>
          <label
            htmlFor="agent-email"
            className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5"
          >
            Email Address
          </label>
          <input
            id="agent-email" name="email" type="email"
            placeholder="e.g. abebe@nib.com"
            value={form.email} onChange={handleChange}
            required autoComplete="off"
            className={INPUT_CLS}
          />
        </div>
      </div>

      <button
        id="submit-agent-btn"
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors shadow-sm disabled:opacity-55 disabled:cursor-not-allowed"
      >
        {submitting && <Spinner small />}
        {submitting ? 'Registering…' : 'Register Agent'}
      </button>
    </form>
  );
}
