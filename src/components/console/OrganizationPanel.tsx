import { useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { AddMemberModal } from './AddMemberModal';
import {
  ORG_MANAGEMENT_ROLES,
  type Organization,
  type OrganizationMember,
  type OrgManagementRole,
  type UpdateOrganizationRequest,
  type AddMemberRequest,
} from '../../types/organization';

interface OrganizationPanelProps {
  organization: Organization;
  members: OrganizationMember[];
  onUpdateOrganization: (body: UpdateOrganizationRequest) => Promise<void>;
  onAddMember: (body: AddMemberRequest) => Promise<void>;
  onSetMemberRole: (userId: string, role: OrgManagementRole) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
}

const inputClass =
  'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

/**
 * The billing organization and who is on it (ADR-017 D5).
 *
 * The roles below are the organization's MANAGEMENT vocabulary — who may
 * administer members and payment. They gate no data: two accounts on the same
 * subscription with no common team see nothing of each other's. That is why the
 * panel names them "management role" rather than leaving a bare "role" for a
 * reader to mistake for a permission over cases.
 *
 * The container owns the data + the write calls; this panel renders them and
 * surfaces action errors.
 */
export function OrganizationPanel({
  organization,
  members,
  onUpdateOrganization,
  onAddMember,
  onSetMemberRole,
  onRemoveMember,
}: OrganizationPanelProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization.name);
  const [description, setDescription] = useState(organization.description ?? '');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const startEdit = () => {
    setName(organization.name);
    setDescription(organization.description ?? '');
    setActionError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    try {
      await onUpdateOrganization({ name: name.trim(), description: description.trim() });
      setEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update the organization');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (request: AddMemberRequest) => {
    // Let the modal surface its own error; only close + clear on success.
    await onAddMember(request);
    setShowAdd(false);
  };

  const handleChangeRole = async (userId: string, role: OrgManagementRole) => {
    setActionError(null);
    try {
      await onSetMemberRole(userId, role);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async () => {
    if (!confirmRemoveId) return;
    setActionError(null);
    try {
      await onRemoveMember(confirmRemoveId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setConfirmRemoveId(null);
    }
  };

  return (
    <section className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="text-fm-heading font-bold text-fm-text-primary mb-1">
            {organization.name}
          </h3>
          <p className="text-sm text-fm-text-secondary">
            {organization.member_count} member{organization.member_count !== 1 ? 's' : ''} on this
            subscription
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="px-3 py-1.5 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-fm-text-secondary mb-1" htmlFor="org-name">
              Name
            </label>
            <input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fm-text-secondary mb-1" htmlFor="org-desc">
              Description
            </label>
            <textarea
              id="org-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <dl className="mb-6 text-sm">
          <div className="flex gap-2 py-1">
            <dt className="text-fm-text-tertiary w-24 flex-shrink-0">Name</dt>
            <dd className="text-fm-text-primary">{organization.name}</dd>
          </div>
          <div className="flex gap-2 py-1">
            <dt className="text-fm-text-tertiary w-24 flex-shrink-0">Slug</dt>
            <dd className="text-fm-text-secondary font-mono select-all">{organization.slug}</dd>
          </div>
          {/* Named separately from the organization, never merged with it: the
              enterprise is the isolation tenant and the organization is the
              billing subject (ADR-017 D1/D2), and one field showing both is how
              a reader concludes that paying for an account is what makes its
              data visible. */}
          <div className="flex gap-2 py-1">
            <dt className="text-fm-text-tertiary w-24 flex-shrink-0">Enterprise</dt>
            <dd className="text-fm-text-secondary font-mono select-all">
              {organization.enterprise_id}
            </dd>
          </div>
          {organization.description && (
            <div className="flex gap-2 py-1">
              <dt className="text-fm-text-tertiary w-24 flex-shrink-0">Description</dt>
              <dd className="text-fm-text-primary">{organization.description}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-fm-text-primary">Members</h4>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
        >
          Add member
        </button>
      </div>

      {actionError && <p className="text-xs text-fm-critical mb-3">{actionError}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-fm-text-tertiary py-4">No members yet.</p>
      ) : (
        <ul className="divide-y divide-fm-border border border-fm-border rounded-fm-input overflow-hidden">
          {members.map((member) => (
            <li
              key={member.user_id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="font-mono text-fm-text-secondary truncate min-w-0" title={member.user_id}>
                {member.user_id}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={member.role ?? ''}
                  onChange={(e) =>
                    handleChangeRole(member.user_id, e.target.value as OrgManagementRole)
                  }
                  aria-label={`Management role for ${member.user_id}`}
                  className="px-2 py-1 bg-fm-surface-alt border border-fm-border rounded-fm-input text-xs text-fm-text-primary"
                >
                  {member.role === null && <option value="">unknown</option>}
                  {ORG_MANAGEMENT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setConfirmRemoveId(member.user_id)}
                  className="px-2 py-1 text-xs font-medium text-fm-critical border border-fm-critical-border rounded-fm-btn hover:bg-fm-critical-bg transition-colors"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showAdd && <AddMemberModal onCancel={() => setShowAdd(false)} onAdd={handleAdd} />}

      <ConfirmDialog
        isOpen={!!confirmRemoveId}
        title="Remove member"
        message="Remove this member from the subscription? Their usage stops being billed here. It does not change what they can see."
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemoveId(null)}
      />
    </section>
  );
}
