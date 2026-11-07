/**
 * features/campaigns/CampaignTable.jsx
 * ──────────────────────────────────────
 * Displays all campaigns with Activate, Edit (inline form), and Delete actions.
 * Pure Tailwind — no App.css dependency.
 *
 * API calls owned by this component:
 *   PUT    /api/campaigns/:id           (edit)
 *   DELETE /api/campaigns/:id           (delete)
 *   PATCH  /api/campaigns/:id/activate  (activate)
 *
 * Callbacks to parent (Dashboard) trigger a refreshCampaigns() after mutations:
 *   onActivated, onEdited, onDeleted — all () => void
 *
 * Props:
 *   campaigns  {object[]}
 *   loading    {boolean}
 *   onActivated {() => void}
 *   onEdited    {() => void}
 *   onDeleted   {() => void}
 *   onToast     {(toast: { type, message }) => void}
 */
import { useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { CampaignStatusPill } from '@/components/ui/Badge';
import { OPERATOR_SYMBOL } from './constants';

// Shared input class for the inline edit form
const EDIT_INPUT_CLS =
  'w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-1 ' +
  'placeholder-text-3 outline-none transition-all focus:border-gold focus:ring-1 focus:ring-gold focus:bg-surface';

export default function CampaignTable({
  campaigns, loading,
  onActivated, onEdited, onDeleted, onToast,
}) {
  const [activating, setActivating] = useState(new Set());
  const [deleting,   setDeleting]   = useState(new Set());
  const [editingId,  setEditingId]  = useState(null);
  const [editForm,   setEditForm]   = useState({});
  const [saving,     setSaving]     = useState(false);

  // ── Inline edit form ──────────────────────────────────────────────────────
  function handleEditOpen(c) {
    const toDateInput = iso => iso ? iso.slice(0, 10) : '';
    setEditForm({
      name:             c.name,
      start_date:       toDateInput(c.start_date),
      end_date:         toDateInput(c.end_date),
      reward_value:     c.reward_value,
      description:      c.description ?? '',
      reward_threshold: c.reward_threshold != null ? String(c.reward_threshold) : '',
    });
    setEditingId(c.id);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditForm({});
  }

  function handleEditChange(e) {
    setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleEditSave(campaignId) {
    setSaving(true);
    try {
      const { data } = await api.put(`/campaigns/${campaignId}`, {
        name:             editForm.name,
        description:      editForm.description || null,
        start_date:       editForm.start_date ? new Date(editForm.start_date).toISOString() : '',
        end_date:         editForm.end_date   ? new Date(editForm.end_date).toISOString()   : '',
        reward_value:     editForm.reward_value,
        reward_threshold: editForm.reward_threshold !== ''
          ? parseInt(editForm.reward_threshold, 10) : null,
      });
      setEditingId(null);
      setEditForm({});
      onEdited();
      onToast({ type: 'success', message: `✅ Campaign "${data.campaign.name}" updated.` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to update campaign.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id, name) {
    const confirmed = window.confirm(
      `Delete campaign "${name}"?\n\nThis will permanently remove the campaign and all its rules.\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(prev => new Set(prev).add(id));
    try {
      const { data } = await api.delete(`/campaigns/${id}`);
      onDeleted();
      onToast({ type: 'success', message: `🗑️ ${data.message}` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to delete campaign.' });
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Activate ──────────────────────────────────────────────────────────────
  async function handleActivate(id, name) {
    setActivating(prev => new Set(prev).add(id));
    try {
      await api.patch(`/campaigns/${id}/activate`);
      onActivated();
      onToast({ type: 'success', message: `✅ Campaign "${name}" is now ACTIVE.` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Activation failed.' });
    } finally {
      setActivating(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spinner />
        <p className="text-text-3 text-sm">Loading campaigns…</p>
      </div>
    );
  }
  if (!campaigns.length) {
    return (
      <EmptyState icon="📋" title="No campaigns yet" sub="Create your first campaign using the form above." />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" aria-label="Campaign list">
        <thead>
          <tr className="bg-panel border-b border-border">
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Name / Rules</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Dates</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Reward</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Threshold</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Status</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const busy       = activating.has(c.id);
            const busyDelete = deleting.has(c.id);
            const isEditing  = editingId === c.id;
            const rules      = Array.isArray(c.rules) ? c.rules : [];

            return (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                <td className="px-6 py-4 text-text-3 text-xs tabular-nums align-top">{i + 1}</td>

                {/* Name + description + rule tags */}
                <td className="px-6 py-4 align-top max-w-[260px]">
                  <span className="text-text-1 font-medium">{c.name}</span>
                  {c.description && (
                    <p className="text-text-3 text-xs mt-1 leading-relaxed line-clamp-2">{c.description}</p>
                  )}
                  {rules.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rules.map(r => {
                        const val = r.rule_value?.amount ?? r.rule_value?.type
                          ?? Object.values(r.rule_value ?? {})[0] ?? '';
                        const sym = OPERATOR_SYMBOL[r.operator] ?? r.operator ?? '=';
                        return (
                          <span
                            key={r.id}
                            className="inline-flex items-center px-2 py-0.5 rounded bg-brand-light text-brand text-[10px] font-semibold"
                          >
                            {r.rule_type} {sym} {String(val)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>

                {/* Date range */}
                <td className="px-6 py-4 text-text-2 text-xs tabular-nums whitespace-nowrap align-top">
                  <span>{new Date(c.start_date).toLocaleDateString()}</span>
                  <span className="text-text-3 mx-1">→</span>
                  <span>{new Date(c.end_date).toLocaleDateString()}</span>
                </td>

                {/* Reward */}
                <td className="px-6 py-4 align-top">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-panel text-text-3 text-[11px] font-semibold mr-1">
                    {c.reward_type}
                  </span>
                  <span className="text-text-1 text-sm font-medium">{c.reward_value}</span>
                </td>

                {/* Threshold */}
                <td className="px-6 py-4 align-top">
                  {c.reward_threshold != null
                    ? (
                      <span
                        className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full bg-gold-light text-[#7C5900] text-xs font-bold px-2"
                        title="Min referrals for reward"
                      >
                        {c.reward_threshold}
                      </span>
                    )
                    : <span className="text-text-3 text-xs">—</span>
                  }
                </td>

                {/* Status */}
                <td className="px-6 py-4 align-top"><CampaignStatusPill status={c.status} /></td>

                {/* Actions */}
                <td className="px-6 py-4 align-top">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.status === 'DRAFT' && !isEditing && (
                      <button
                        id={`activate-btn-${c.id}`}
                        disabled={busy || busyDelete}
                        onClick={() => handleActivate(c.id, c.name)}
                        aria-label={`Activate campaign ${c.name}`}
                        className="inline-flex items-center gap-1 bg-approved-bg text-approved-txt border border-approved-bdr text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[#e2f3f1] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? <Spinner small /> : '▶ Activate'}
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        id={`edit-btn-${c.id}`}
                        disabled={busy || busyDelete}
                        onClick={() => handleEditOpen(c)}
                        aria-label={`Edit campaign ${c.name}`}
                        className="inline-flex items-center gap-1 bg-gold-light text-[#7C5900] border border-[#D4AF37]/30 text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[#f5edba] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ✏ Edit
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        id={`delete-btn-${c.id}`}
                        disabled={busy || busyDelete}
                        onClick={() => handleDelete(c.id, c.name)}
                        aria-label={`Delete campaign ${c.name}`}
                        className="inline-flex items-center gap-1 bg-reject-bg text-reject-txt border border-reject-bdr text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[#f9e5e1] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busyDelete ? <Spinner small /> : '🗑 Delete'}
                      </button>
                    )}
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <div className="mt-3 p-4 bg-bg border border-border rounded-lg shadow-sm space-y-3 min-w-[320px]">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Name */}
                        <div className="col-span-2">
                          <label htmlFor={`edit-name-${c.id}`} className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1">Name</label>
                          <input
                            id={`edit-name-${c.id}`} name="name" type="text"
                            value={editForm.name} onChange={handleEditChange}
                            autoComplete="off" className={EDIT_INPUT_CLS}
                          />
                        </div>
                        {/* Start Date */}
                        <div>
                          <label htmlFor={`edit-start-${c.id}`} className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1">Start Date</label>
                          <input
                            id={`edit-start-${c.id}`} name="start_date" type="date"
                            value={editForm.start_date} onChange={handleEditChange}
                            className={EDIT_INPUT_CLS}
                          />
                        </div>
                        {/* End Date */}
                        <div>
                          <label htmlFor={`edit-end-${c.id}`} className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1">End Date</label>
                          <input
                            id={`edit-end-${c.id}`} name="end_date" type="date"
                            value={editForm.end_date} onChange={handleEditChange}
                            className={EDIT_INPUT_CLS}
                          />
                        </div>
                        {/* Reward Value */}
                        <div>
                          <label htmlFor={`edit-reward-${c.id}`} className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1">Reward Value</label>
                          <input
                            id={`edit-reward-${c.id}`} name="reward_value" type="text"
                            value={editForm.reward_value} onChange={handleEditChange}
                            autoComplete="off" className={EDIT_INPUT_CLS}
                          />
                        </div>
                        {/* Threshold */}
                        <div>
                          <label htmlFor={`edit-threshold-${c.id}`} className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1">Threshold</label>
                          <input
                            id={`edit-threshold-${c.id}`} name="reward_threshold" type="number"
                            min="0" value={editForm.reward_threshold} onChange={handleEditChange}
                            className={EDIT_INPUT_CLS}
                          />
                        </div>
                        {/* Description */}
                        <div className="col-span-2">
                          <label htmlFor={`edit-desc-${c.id}`} className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1">Description</label>
                          <input
                            id={`edit-desc-${c.id}`} name="description" type="text"
                            value={editForm.description} onChange={handleEditChange}
                            autoComplete="off" className={EDIT_INPUT_CLS}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleEditSave(c.id)}
                          className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-xs font-semibold px-4 py-2 rounded transition-colors shadow-sm disabled:opacity-55 disabled:cursor-not-allowed"
                        >
                          {saving && <Spinner small />}
                          {saving ? 'Saving…' : '✓ Save Changes'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleEditCancel}
                          className="text-xs font-semibold text-text-3 border border-border rounded px-4 py-2 hover:border-border-dark hover:text-text-2 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
