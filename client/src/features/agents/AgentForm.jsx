/**
 * features/agents/AgentForm.jsx
 * ──────────────────────────────
 * Admin-only form to register a new agent directly (bypasses the
 * self-registration flow). On success, calls onCreated() with the
 * optimistic agent object and onSuccess() to close the modal.
 * Pure Tailwind — matches Nib Bank design tokens.
 *
 * Props:
 *   onCreated {(agent: object) => void}
 *   onSuccess {() => void}
 *   onToast   {(toast: { type, message }) => void}
 */
import { useRef, useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// High-contrast Input classes — matches Nib Bank warm brown / ivory theme
const INPUT_CLS =
  'h-auto w-full px-4 py-2.5 bg-white border border-[#E5DED6] rounded-md text-sm text-[#3E2723] ' +
  'placeholder:text-[#9C8577] placeholder:opacity-100 shadow-none transition-all duration-150 ' +
  'focus-visible:border-gold focus-visible:ring-1 focus-visible:ring-gold focus-visible:bg-white';

export default function AgentForm({ onCreated, onSuccess, onToast }) {
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

      onCreated?.({
        id: data.id,
        name: data.name,
        referral_code: data.referral_code,
        status: data.status ?? 'APPROVED',
        successful_referrals: 0,
        current_reward: null,
      });
      onToast?.({
        type: 'success',
        message: `✅ Agent "${data.name}" created — Code: ${data.referral_code} · Temp Password: ${data.temp_password}`,
      });
      setForm({ name: '', phone: '', email: '' });
      onSuccess?.();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        onToast?.({ type: 'error', message: '🔒 Your session has expired. Please log in again.' });
        return;
      }
      const msg = status === 409
        ? '⚠️ An agent with this phone number or email already exists.'
        : (err.response?.data?.error ?? 'Something went wrong. Please try again.');
      onToast?.({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="agent-form"
      className="p-1"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Register a new agent"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Full Name */}
        <div>
          <label
            htmlFor="agent-name"
            className="block text-[11px] font-semibold text-[#3E2723] uppercase tracking-wide mb-1.5"
          >
            Full Name
          </label>
          <Input
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
            className="block text-[11px] font-semibold text-[#3E2723] uppercase tracking-wide mb-1.5"
          >
            Phone Number
          </label>
          <Input
            id="agent-phone" name="phone" type="tel"
            placeholder="e.g. 0911234567"
            value={form.phone} onChange={handleChange}
            required autoComplete="off"
            className={INPUT_CLS}
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="agent-email"
            className="block text-[11px] font-semibold text-[#3E2723] uppercase tracking-wide mb-1.5"
          >
            Email Address
          </label>
          <Input
            id="agent-email" name="email" type="email"
            placeholder="e.g. abebe@nib.com"
            value={form.email} onChange={handleChange}
            required autoComplete="off"
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DED6]">
        <Button
          type="button"
          variant="outline"
          onClick={() => onSuccess?.()}
          disabled={submitting}
          className="border-[#E5DED6] text-[#3E2723] hover:bg-[#FAF8F5]"
        >
          Cancel
        </Button>
        <Button
          id="submit-agent-btn"
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold px-5 py-2.5 h-auto rounded-md transition-colors shadow-sm disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {submitting && <Spinner small />}
          {submitting ? 'Registering…' : 'Register Agent'}
        </Button>
      </div>
    </form>
  );
}
