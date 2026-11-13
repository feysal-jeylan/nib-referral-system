/**
 * features/agents/EditAgentModal.jsx
 * ────────────────────────────────────
 * Enterprise modal to edit an existing agent's profile details
 * (Name, Phone, and Email). Synchronizes with linked user account.
 * Pure Tailwind — matches Nib Bank design tokens.
 *
 * Props:
 *   agent     {object|null}
 *   isOpen    {boolean}
 *   onClose   {() => void}
 *   onSuccess {(updatedAgent?: object) => void}
 *   onToast   {(toast: { type, message }) => void}
 */

import { useEffect, useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const INPUT_CLS =
  'h-auto w-full px-4 py-2.5 bg-white border border-[#E5DED6] rounded-md text-sm text-[#3E2723] ' +
  'placeholder:text-[#9C8577] placeholder:opacity-100 shadow-none transition-all duration-150 ' +
  'focus-visible:border-gold focus-visible:ring-1 focus-visible:ring-gold focus-visible:bg-white';

const LABEL_CLS = 'block text-[11px] font-semibold text-[#3E2723] uppercase tracking-wide mb-1.5';

export default function EditAgentModal({ agent, isOpen, onClose, onSuccess, onToast }) {
  const [form, setForm]             = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (agent && isOpen) {
      setForm({
        name:  agent.name  || '',
        phone: agent.phone || '',
        email: agent.email || '',
      });
      setError('');
    }
  }, [agent, isOpen]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!agent) return;

    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      const msg = 'All fields are required: name, phone, email.';
      setError(msg);
      onToast?.({ type: 'error', message: msg });
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data } = await api.put(`/agents/${agent.id}`, {
        name:  form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });

      onToast?.({
        type: 'success',
        message: `✅ Agent "${data.name}" updated successfully.`,
      });
      onSuccess?.(data);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to update agent profile.';
      setError(msg);
      onToast?.({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-[#E5DED6] shadow-xl">
        <DialogHeader className="mb-3">
          <DialogTitle className="text-base font-bold text-[#1C0F05]">
            Edit Agent Profile
          </DialogTitle>
          <DialogDescription className="text-xs text-[#9C8577]">
            Update contact and identity information for this referral agent.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="edit-agent-name" className={LABEL_CLS}>
              Full Name
            </label>
            <Input
              id="edit-agent-name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              required
              autoComplete="off"
              className={INPUT_CLS}
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="edit-agent-phone" className={LABEL_CLS}>
              Phone Number
            </label>
            <Input
              id="edit-agent-phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              required
              autoComplete="off"
              className={INPUT_CLS}
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="edit-agent-email" className={LABEL_CLS}>
              Email Address
            </label>
            <Input
              id="edit-agent-email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="off"
              className={INPUT_CLS}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DED6]">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onClose}
              className="border-[#E5DED6] text-[#3E2723] hover:bg-[#FAF8F5]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors shadow-sm disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {submitting && <Spinner small />}
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

