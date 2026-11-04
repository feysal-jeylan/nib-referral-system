/**
 * features/campaigns/CampaignTable.jsx
 * ──────────────────────────────────────
 * Displays all campaigns with Activate, Edit (inline form), and Delete actions.
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
  if (loading) return <div className="state-box"><Spinner /><p>Loading campaigns…</p></div>;
  if (!campaigns.length) return (
    <EmptyState icon="📋" title="No campaigns yet" sub="Create your first campaign using the form above." />
  );

  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Campaign list">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name / Rules</th>
            <th scope="col">Dates</th>
            <th scope="col">Reward</th>
            <th scope="col">Threshold</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const busy       = activating.has(c.id);
            const busyDelete = deleting.has(c.id);
            const isEditing  = editingId === c.id;
            const rules      = Array.isArray(c.rules) ? c.rules : [];

            return (
              <tr key={c.id} className="data-row">
                <td className="td--index">{i + 1}</td>

                {/* Name + description + rule tags */}
                <td className="td--name">
                  <span>{c.name}</span>
                  {c.description && (
                    <p className="campaign-description">{c.description}</p>
                  )}
                  {rules.length > 0 && (
                    <div className="rule-tags">
                      {rules.map(r => {
                        const val = r.rule_value?.amount ?? r.rule_value?.type
                          ?? Object.values(r.rule_value ?? {})[0] ?? '';
                        const sym = OPERATOR_SYMBOL[r.operator] ?? r.operator ?? '=';
                        return (
                          <span key={r.id} className="rule-tag">
                            {r.rule_type} {sym} {String(val)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>

                {/* Date range */}
                <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                  <span>{new Date(c.start_date).toLocaleDateString()}</span>
                  <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>→</span>
                  <span>{new Date(c.end_date).toLocaleDateString()}</span>
                </td>

                {/* Reward */}
                <td>
                  <span className="reward-chip reward-chip--type">{c.reward_type}</span>
                  {' '}
                  <span className="reward-chip reward-chip--value">{c.reward_value}</span>
                </td>

                {/* Threshold */}
                <td className="td--count">
                  {c.reward_threshold != null
                    ? <span className="count-pill" title="Min referrals for reward">{c.reward_threshold}</span>
                    : <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>
                  }
                </td>

                {/* Status */}
                <td><CampaignStatusPill status={c.status} /></td>

                {/* Actions */}
                <td>
                  <div className="action-group">
                    {c.status === 'DRAFT' && !isEditing && (
                      <button
                        id={`activate-btn-${c.id}`}
                        className="btn btn--activate"
                        disabled={busy || busyDelete}
                        onClick={() => handleActivate(c.id, c.name)}
                        aria-label={`Activate campaign ${c.name}`}
                      >
                        {busy ? <Spinner small /> : '▶ Activate'}
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        id={`edit-btn-${c.id}`}
                        className="btn btn--edit"
                        disabled={busy || busyDelete}
                        onClick={() => handleEditOpen(c)}
                        aria-label={`Edit campaign ${c.name}`}
                      >
                        ✏ Edit
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        id={`delete-btn-${c.id}`}
                        className="btn btn--delete"
                        disabled={busy || busyDelete}
                        onClick={() => handleDelete(c.id, c.name)}
                        aria-label={`Delete campaign ${c.name}`}
                      >
                        {busyDelete ? <Spinner small /> : '🗑 Delete'}
                      </button>
                    )}
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <div className="campaign-edit-form">
                      <div className="campaign-edit-form__grid">
                        <div className="form__field">
                          <label htmlFor={`edit-name-${c.id}`}>Name</label>
                          <input
                            id={`edit-name-${c.id}`} name="name" type="text"
                            value={editForm.name} onChange={handleEditChange}
                            autoComplete="off"
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-start-${c.id}`}>Start Date</label>
                          <input
                            id={`edit-start-${c.id}`} name="start_date" type="date"
                            value={editForm.start_date} onChange={handleEditChange}
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-end-${c.id}`}>End Date</label>
                          <input
                            id={`edit-end-${c.id}`} name="end_date" type="date"
                            value={editForm.end_date} onChange={handleEditChange}
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-reward-${c.id}`}>Reward Value</label>
                          <input
                            id={`edit-reward-${c.id}`} name="reward_value" type="text"
                            value={editForm.reward_value} onChange={handleEditChange}
                            autoComplete="off"
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-threshold-${c.id}`}>Threshold</label>
                          <input
                            id={`edit-threshold-${c.id}`} name="reward_threshold" type="number"
                            min="0" value={editForm.reward_threshold} onChange={handleEditChange}
                          />
                        </div>
                        <div className="form__field form__field--wide">
                          <label htmlFor={`edit-desc-${c.id}`}>Description</label>
                          <input
                            id={`edit-desc-${c.id}`} name="description" type="text"
                            value={editForm.description} onChange={handleEditChange}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      <div className="campaign-edit-form__actions">
                        <button
                          type="button" className="btn btn--primary"
                          disabled={saving}
                          onClick={() => handleEditSave(c.id)}
                        >
                          {saving ? <Spinner small /> : null}
                          {saving ? 'Saving…' : '✓ Save Changes'}
                        </button>
                        <button
                          type="button" className="btn btn--ghost"
                          disabled={saving} onClick={handleEditCancel}
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
