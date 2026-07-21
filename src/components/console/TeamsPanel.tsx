import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { listTeamMembers, addTeamMember, removeTeamMember } from '../../lib/teams';
import type { Team, TeamMember, CreateTeamRequest, UpdateTeamRequest } from '../../types/teams';
import type { OrganizationMember } from '../../types/organization';

interface TeamsPanelProps {
  teams: Team[];
  /** Org roster — the source for the "add member" picker (backend only admits org members). */
  orgMembers: OrganizationMember[];
  onCreateTeam: (body: CreateTeamRequest) => Promise<void>;
  onUpdateTeam: (teamId: string, body: UpdateTeamRequest) => Promise<void>;
  onDeleteTeam: (teamId: string) => Promise<void>;
}

const inputClass =
  'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

/**
 * Team management (U13b): list / create / rename / delete teams and manage
 * membership. Team ops go to the container; per-team member lists are loaded
 * lazily when a team is expanded (avoids an N+1 fetch on the team list).
 */
export function TeamsPanel({
  teams,
  orgMembers,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
}: TeamsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [membersByTeam, setMembersByTeam] = useState<Record<string, TeamMember[]>>({});
  const [membersLoading, setMembersLoading] = useState(false);
  const [addUserId, setAddUserId] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true);
    setActionError(null);
    try {
      const members = await listTeamMembers(teamId);
      setMembersByTeam((prev) => ({ ...prev, [teamId]: members }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load team members');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const toggleExpand = (teamId: string) => {
    setActionError(null);
    setAddUserId('');
    if (expandedId === teamId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(teamId);
    if (!membersByTeam[teamId]) void loadMembers(teamId);
  };

  const handleCreate = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await onCreateTeam({ name: newName.trim(), description: newDescription.trim() || undefined });
      setCreating(false);
      setNewName('');
      setNewDescription('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (team: Team) => {
    setEditingId(team.team_id);
    setEditName(team.name);
    setEditDescription(team.description ?? '');
    setActionError(null);
  };

  const handleSaveEdit = async (teamId: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await onUpdateTeam(teamId, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setEditingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update team');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setActionError(null);
    try {
      await onDeleteTeam(confirmDeleteId);
      if (expandedId === confirmDeleteId) setExpandedId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleAddMember = async (teamId: string) => {
    if (!addUserId) return;
    setBusy(true);
    setActionError(null);
    try {
      await addTeamMember(teamId, addUserId);
      setAddUserId('');
      await loadMembers(teamId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add team member');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (teamId: string, userId: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await removeTeamMember(teamId, userId);
      await loadMembers(teamId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove team member');
    } finally {
      setBusy(false);
    }
  };

  const candidatesToAdd = (teamId: string): OrganizationMember[] => {
    const current = new Set((membersByTeam[teamId] ?? []).map((m) => m.user_id));
    return orgMembers.filter((m) => !current.has(m.user_id));
  };

  return (
    <section className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-fm-heading font-bold text-fm-text-primary">Teams</h3>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true);
              setNewName('');
              setNewDescription('');
              setActionError(null);
            }}
            className="px-3 py-1.5 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
          >
            Create team
          </button>
        )}
      </div>

      {actionError && <p className="text-xs text-fm-critical mb-3">{actionError}</p>}

      {creating && (
        <div className="space-y-3 mb-6 p-4 border border-fm-border rounded-fm-input">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name"
            className={`w-full ${inputClass}`}
            aria-label="New team name"
            autoFocus
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className={`w-full ${inputClass}`}
            aria-label="New team description"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={busy || !newName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <p className="text-sm text-fm-text-tertiary py-4">No teams yet.</p>
      ) : (
        <ul className="space-y-2">
          {teams.map((team) => (
            <li key={team.team_id} className="border border-fm-border rounded-fm-input">
              {editingId === team.team_id ? (
                <div className="p-3 space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={`w-full ${inputClass}`}
                    aria-label="Team name"
                  />
                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description"
                    className={`w-full ${inputClass}`}
                    aria-label="Team description"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(team.team_id)}
                      disabled={busy || !editName.trim()}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fm-text-primary truncate">{team.name}</p>
                    {team.description && (
                      <p className="text-xs text-fm-text-tertiary truncate">{team.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleExpand(team.team_id)}
                      aria-expanded={expandedId === team.team_id}
                      className="px-2 py-1 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
                    >
                      Members
                    </button>
                    <button
                      onClick={() => startEdit(team)}
                      className="px-2 py-1 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(team.team_id)}
                      className="px-2 py-1 text-xs font-medium text-fm-critical border border-fm-critical-border rounded-fm-btn hover:bg-fm-critical-bg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {expandedId === team.team_id && editingId !== team.team_id && (
                <div className="border-t border-fm-border px-3 py-3 bg-fm-surface-alt/40">
                  {membersLoading && !membersByTeam[team.team_id] ? (
                    <p className="text-xs text-fm-text-tertiary py-2">Loading members…</p>
                  ) : (
                    <>
                      {(membersByTeam[team.team_id]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-fm-text-tertiary py-1">No members.</p>
                      ) : (
                        <ul className="space-y-1 mb-3">
                          {membersByTeam[team.team_id].map((member) => (
                            <li
                              key={member.user_id}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span
                                className="font-mono text-fm-text-secondary truncate min-w-0"
                                title={member.user_id}
                              >
                                {member.user_id}
                              </span>
                              <button
                                onClick={() => handleRemoveMember(team.team_id, member.user_id)}
                                disabled={busy}
                                className="flex-shrink-0 text-fm-critical hover:underline disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex items-center gap-2">
                        <select
                          value={addUserId}
                          onChange={(e) => setAddUserId(e.target.value)}
                          aria-label="Select a member to add"
                          className="flex-1 min-w-0 px-2 py-1 bg-fm-surface-alt border border-fm-border rounded-fm-input text-xs text-fm-text-primary"
                        >
                          <option value="">Add an org member…</option>
                          {candidatesToAdd(team.team_id).map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.user_id}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAddMember(team.team_id)}
                          disabled={busy || !addUserId}
                          className="flex-shrink-0 px-3 py-1 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Delete team"
        message="Delete this team? Its members and any resources shared with it lose that access."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </section>
  );
}
