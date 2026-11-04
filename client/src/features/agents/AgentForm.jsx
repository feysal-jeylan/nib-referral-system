/**
 * features/agents/AgentForm.jsx
 * ──────────────────────────────
 * Admin-only form to register a new agent directly (bypasses the
 * self-registration flow). On success, calls onCreated() with the
 * optimistic agent object so the parent can prepend it to the list
 * immediately while the next poll refreshes the full data.
 *
 * Props:
 *   onCreated {(agent: object) => void}
 *   onToast   {(toast: { type, message }) => void}
 */
import { useRef, useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';

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
      className="agent-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Register a new agent"
    >
      <h2 className="form__title">Register New Agent</h2>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="agent-name">Full Name</label>
          <input
            id="agent-name" name="name" type="text"
            placeholder="e.g. Abebe Kebede"
            value={form.name} onChange={handleChange}
            required ref={nameRef} autoComplete="off"
          />
        </div>
        <div className="form__field">
          <label htmlFor="agent-phone">Phone Number</label>
          <input
            id="agent-phone" name="phone" type="tel"
            placeholder="e.g. 0911234567"
            value={form.phone} onChange={handleChange}
            required autoComplete="off"
          />
        </div>
        <div className="form__field form__field--wide">
          <label htmlFor="agent-email">Email Address</label>
          <input
            id="agent-email" name="email" type="email"
            placeholder="e.g. abebe@nib.com"
            value={form.email} onChange={handleChange}
            required autoComplete="off"
          />
        </div>
      </div>
      <button
        id="submit-agent-btn"
        type="submit"
        className="btn btn--primary"
        disabled={submitting}
      >
        {submitting && <Spinner small />}
        {submitting ? 'Registering…' : 'Register Agent'}
      </button>
    </form>
  );
}

