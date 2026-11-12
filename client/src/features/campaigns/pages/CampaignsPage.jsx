/**
 * features/campaigns/pages/CampaignsPage.jsx
 * ────────────────────────────────────────────
 * Phase 2: Full campaigns page with:
 *   - CampaignForm (admin)
 *   - Search + status filter
 *   - Minimal-row table (Name, Code, Dates, Status, Actions)
 *   - "View Details" shadcn Dialog — shows full rules + Edit/Delete
 *   - Server-side pagination
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/services/api';

import CampaignForm from '@/features/campaigns/CampaignForm';
import { OPERATOR_SYMBOL } from '@/features/campaigns/constants';
import { CampaignStatusPill } from '@/components/ui/Badge';
import TableFilters        from '@/components/common/TableFilters';
import DataTablePagination from '@/components/common/DataTablePagination';
import Spinner    from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';
const IVORY     = '#FAF8F5';

const STATUS_OPTIONS = [
  { value: '',       label: 'All Statuses' },
  { value: 'DRAFT',  label: 'Draft'        },
  { value: 'ACTIVE', label: 'Active'       },
];

const EDIT_INPUT_CLS =
  'w-full px-3 py-2 bg-[#FAF8F5] border border-[rgba(138,77,31,0.18)] rounded text-sm ' +
  'text-[#1C0F05] placeholder-[#9C8577] outline-none transition-all ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] focus:bg-white';

// ── Delete Dialog ─────────────────────────────────────────────────────────────
function DeleteDialog({ open, campaignName, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !loading) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ color: CHOCOLATE }}>Delete Campaign?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-semibold" style={{ color: CHOCOLATE }}>"{campaignName}"</span>?{' '}
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={onCancel}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={loading}
            onClick={onConfirm}
            className="bg-[#C0392B] hover:bg-[#a93226] text-white"
          >
            {loading && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />}
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Details Dialog ────────────────────────────────────────────────────────────
function DetailsDialog({ campaign, open, onClose, onDelete, onEdit, onActivate, actioning }) {
  if (!campaign) return null;
  const rules  = Array.isArray(campaign.rules) ? campaign.rules : [];
  const busy   = actioning.has(campaign.id);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: CHOCOLATE }}>{campaign.name}</DialogTitle>
          <DialogDescription>
            <CampaignStatusPill status={campaign.status} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Campaign Code" value={campaign.campaign_code
              ? <code className="font-mono text-xs bg-[#FAF8F5] border border-[rgba(138,77,31,0.15)] px-2 py-0.5 rounded" style={{ color: BRAND }}>{campaign.campaign_code}</code>
              : <span style={{ color: MUTED }}>Not set</span>}
            />
            <InfoRow label="Reward" value={`${campaign.reward_type} — ${campaign.reward_value}`} />
            <InfoRow label="Start Date" value={new Date(campaign.start_date).toLocaleDateString()} />
            <InfoRow label="End Date"   value={new Date(campaign.end_date).toLocaleDateString()} />
            {campaign.reward_threshold != null && (
              <InfoRow label="Threshold" value={`${campaign.reward_threshold} referrals`} />
            )}
            {campaign.description && (
              <div className="col-span-2">
                <InfoRow label="Description" value={campaign.description} />
              </div>
            )}
          </div>

          {/* Rules */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              Qualification Rules ({rules.length})
            </p>
            {rules.length === 0 ? (
              <p className="text-xs" style={{ color: MUTED }}>No rules defined.</p>
            ) : (
              <div className="space-y-2">
                {rules.map(r => {
                  const isComposite = r.rule_type === 'COMPOSITE';
                  return (
                    <div
                      key={r.id}
                      className="rounded-lg p-3 text-xs"
                      style={{ background: IVORY, border: `1px solid ${BORDER}` }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="font-semibold px-2 py-0.5 rounded"
                          style={{ background: 'rgba(138,77,31,0.10)', color: BRAND }}
                        >
                          {r.rule_type}
                        </span>
                        {!isComposite && r.operator !== 'N/A' && (
                          <span style={{ color: MUTED }}>{OPERATOR_SYMBOL[r.operator] ?? r.operator}</span>
                        )}
                      </div>
                      <pre
                        className="text-[11px] rounded p-2 overflow-x-auto"
                        style={{ background: '#fff', border: `1px solid ${BORDER}`, color: CHOCOLATE }}
                      >
                        {JSON.stringify(r.rule_value, null, 2)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {campaign.status === 'DRAFT' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onActivate(campaign.id, campaign.name)}
              className="border-[#2E7D32] text-[#2E7D32] hover:bg-[#e8f5e9]"
            >
              {busy ? <Spinner small /> : '▶ Activate'}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onEdit(campaign)}
            className="border-[rgba(138,77,31,0.3)] hover:bg-[#FAF8F5]"
            style={{ color: CHOCOLATE }}
          >
            ✏ Edit
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => onDelete(campaign.id, campaign.name)}
            className="bg-[#C0392B] hover:bg-[#a93226] text-white"
          >
            🗑 Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: MUTED }}>{label}</p>
      <p style={{ color: CHOCOLATE }}>{value}</p>
    </div>
  );
}

// ── Edit inline dialog ────────────────────────────────────────────────────────
function EditDialog({ campaign, open, onClose, onSaved, onToast }) {
  const [form,   setForm]   = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (campaign) {
      setForm({
        name:             campaign.name,
        start_date:       campaign.start_date?.slice(0, 10) ?? '',
        end_date:         campaign.end_date?.slice(0, 10) ?? '',
        reward_value:     campaign.reward_value,
        reward_threshold: campaign.reward_threshold != null ? String(campaign.reward_threshold) : '',
        description:      campaign.description ?? '',
      });
    }
  }, [campaign]);

  if (!campaign) return null;

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaign.id}`, {
        name:             form.name,
        description:      form.description || null,
        start_date:       form.start_date ? new Date(form.start_date).toISOString() : '',
        end_date:         form.end_date   ? new Date(form.end_date).toISOString()   : '',
        reward_value:     form.reward_value,
        reward_threshold: form.reward_threshold !== '' ? parseInt(form.reward_threshold, 10) : null,
      });
      onSaved();
      onClose();
      onToast({ type: 'success', message: `✅ Campaign "${form.name}" updated.` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to update campaign.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ color: CHOCOLATE }}>Edit Campaign</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Name</label>
            <input name="name" value={form.name ?? ''} onChange={handleChange} className={EDIT_INPUT_CLS} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Start Date</label>
            <input type="date" name="start_date" value={form.start_date ?? ''} onChange={handleChange} className={EDIT_INPUT_CLS} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>End Date</label>
            <input type="date" name="end_date" value={form.end_date ?? ''} onChange={handleChange} className={EDIT_INPUT_CLS} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Reward Value</label>
            <input name="reward_value" value={form.reward_value ?? ''} onChange={handleChange} className={EDIT_INPUT_CLS} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Threshold</label>
            <input type="number" min="0" name="reward_threshold" value={form.reward_threshold ?? ''} onChange={handleChange} className={EDIT_INPUT_CLS} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Description</label>
            <input name="description" value={form.description ?? ''} onChange={handleChange} className={EDIT_INPUT_CLS} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={handleSave}
            style={{ background: BRAND, color: '#fff' }}
            className="hover:opacity-90"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage({ user, isAdmin, onToast }) {
  const [data,     setData]     = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [actioning, setActioning] = useState(new Set());

  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');
  const [page,    setPage]    = useState(1);
  const LIMIT = 10;

  // Modal state
  const [viewTarget,   setViewTarget]   = useState(null);  // campaign for details dialog
  const [deleteTarget, setDeleteTarget] = useState(null);  // { id, name }
  const [editTarget,   setEditTarget]   = useState(null);  // campaign for edit dialog
  const [deleting,     setDeleting]     = useState(false);

  const debounceRef = useRef(null);

  const fetchCampaigns = useCallback(async (pg, srch, st) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pg, limit: LIMIT,
        ...(srch ? { search: srch } : {}),
        ...(st   ? { status: st   } : {}),
      });
      const { data: res } = await api.get(`/campaigns?${params}`);
      // Support both new { data, meta } and legacy { campaigns } shapes
      setData(res.data ?? res.campaigns ?? []);
      setMeta(res.meta ?? null);
    } catch {
      onToast({ type: 'error', message: '🔴 Failed to load campaigns.' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchCampaigns(1, '', ''); }, [fetchCampaigns]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchCampaigns(1, val, status); }, 300);
  }

  function handleStatusChange(val) { setStatus(val); setPage(1); fetchCampaigns(1, search, val); }
  function handlePageChange(pg)    { setPage(pg);    fetchCampaigns(pg, search, status); }
  function refresh()               { fetchCampaigns(page, search, status); }

  // Activate
  async function handleActivate(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      await api.patch(`/campaigns/${id}/activate`);
      refresh();
      setViewTarget(null);
      onToast({ type: 'success', message: `✅ Campaign "${name}" is now ACTIVE.` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Activation failed.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // Delete
  function handleDeleteRequest(id, name) { setDeleteTarget({ id, name }); setViewTarget(null); }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: res } = await api.delete(`/campaigns/${deleteTarget.id}`);
      setDeleteTarget(null);
      refresh();
      onToast({ type: 'success', message: `🗑️ ${res.message}` });
    } catch (err) {
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to delete campaign.' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // Edit
  function handleEditRequest(c) { setEditTarget(c); setViewTarget(null); }

  return (
    <div className="p-6 space-y-6">

      {/* ── Admin: Campaign Form ─────────────────────────────────────────── */}
      {isAdmin && (
        <section
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <CampaignForm onCreated={refresh} onToast={onToast} />
        </section>
      )}

      {/* ── Campaign Table ───────────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>Campaign Management</h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Create, activate, and manage referral campaigns.
            </p>
          </div>
          {meta && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: IVORY, color: MUTED }}>
              {meta.total} campaign{meta.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <TableFilters
          search={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search by name or campaign code…"
          statusValue={status}
          onStatusChange={handleStatusChange}
          statusOptions={STATUS_OPTIONS}
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-sm" style={{ color: MUTED }}>Loading campaigns…</p>
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon="📋" title="No campaigns found"
            sub={search || status ? 'Try clearing the filters.' : 'Create your first campaign above.'} />
        ) : (
          <>
            {/* Minimal table */}
            <div className="overflow-x-auto w-full">
              <table className="min-w-[700px] w-full text-sm border-collapse" aria-label="Campaign list">
                <thead>
                  <tr style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
                    {['#','Name','Code','Dates','Reward','Status','Actions'].map(h => (
                      <th key={h} scope="col"
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: MUTED }}
                      >{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((c, i) => (
                    <tr
                      key={c.id}
                      className="transition-colors duration-100"
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                      onMouseEnter={e => { e.currentTarget.style.background = IVORY; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      <td className="px-5 py-3.5 text-xs tabular-nums" style={{ color: MUTED }}>
                        {(page - 1) * LIMIT + i + 1}
                      </td>
                      <td className="px-5 py-3.5 font-medium max-w-[200px] truncate" style={{ color: CHOCOLATE }}>
                        {c.name}
                      </td>
                      <td className="px-5 py-3.5">
                        {c.campaign_code
                          ? <code className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(138,77,31,0.08)', color: BRAND }}>{c.campaign_code}</code>
                          : <span className="text-xs" style={{ color: MUTED }}>—</span>
                        }
                      </td>
                      <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: MUTED }}>
                        {new Date(c.start_date).toLocaleDateString()} → {new Date(c.end_date).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: CHOCOLATE }}>
                        {c.reward_type} {c.reward_value}
                      </td>
                      <td className="px-5 py-3.5">
                        <CampaignStatusPill status={c.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setViewTarget(c)}
                          className="text-xs font-semibold px-3 py-1.5 rounded transition-all"
                          style={{
                            border: `1px solid rgba(138,77,31,0.25)`,
                            color: BRAND,
                            background: 'transparent',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,77,31,0.07)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination meta={meta} onPageChange={handlePageChange} loading={loading} />
          </>
        )}
      </section>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <DetailsDialog
        campaign={viewTarget}
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        onDelete={handleDeleteRequest}
        onEdit={handleEditRequest}
        onActivate={handleActivate}
        actioning={actioning}
      />
      <DeleteDialog
        open={!!deleteTarget}
        campaignName={deleteTarget?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
      <EditDialog
        campaign={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={refresh}
        onToast={onToast}
      />
    </div>
  );
}
