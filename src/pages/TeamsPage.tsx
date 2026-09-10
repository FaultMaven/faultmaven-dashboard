import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { MyInvitationsPanel } from '../components/teams/MyInvitationsPanel';
import { TeamCard } from '../components/teams/TeamCard';
import { useAuth } from '../context/AuthContext';
import { logoutAuth } from '../lib/api';
import {
  createTeam,
  listMyInvitations,
  listTeams,
  teamRefusalReason,
  TEAM_NAME_MAX_LENGTH,
  type Invitation,
  type Team,
} from '../lib/teams';
import { refusalMessage } from '../lib/teams/copy';

/**
 * Teams — the sharing surface, and the whole of it (ADR-017 D4).
 *
 * A team is how two accounts in the same company come to see each other's
 * cases, and it forms by consent: anyone may start one and is its team admin,
 * the admin offers an address a place, and the invitee's own accept is the only
 * call that creates a membership. There is no organization on this page, by
 * design — who pays for an account (ADR-017 D5) decides nothing about what it
 * can see, and the cloud org-admin team console that used to imply otherwise
 * was deleted with cloud contract 2.0.0.
 *
 * Reachable by every signed-in account, gated only on the deployment's
 * `teamSharing` capability. It is deliberately NOT behind `platform_admin`:
 * D4's "any account may create a team" is the decision, and gating it on an
 * operator role would put the product's sharing model behind a role almost
 * nobody has.
 */
export default function TeamsPage() {
  const { authState, clearAuthState } = useAuth();
  const currentUserId = authState?.user.user_id ?? '';

  const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [myTeams, myInvitations] = await Promise.all([listTeams(), listMyInvitations()]);
      setTeams(myTeams);
      setInvitations(myInvitations);
    } catch (err) {
      setError(
        refusalMessage(
          teamRefusalReason(err),
          err instanceof Error ? err.message : 'Failed to load your teams'
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setCreateError(null);
    try {
      await createTeam({ name, description: newDescription.trim() || null });
      setCreating(false);
      setNewName('');
      setNewDescription('');
      await load();
    } catch (err) {
      setCreateError(
        refusalMessage(
          teamRefusalReason(err),
          err instanceof Error ? err.message : 'Failed to create the team'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Teams</h2>
          <p className="text-fm-text-secondary text-sm">
            A team is how you share cases and runbooks with colleagues. Anyone can start one, and
            nobody joins until they accept an invitation.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-fm-text-tertiary text-sm">Loading…</div>
        ) : (
          <div className="space-y-6">
            <MyInvitationsPanel invitations={invitations} onAnswered={load} />

            <section className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-fm-heading font-bold text-fm-text-primary">Your teams</h3>
                {!creating && (
                  <button
                    onClick={() => {
                      setCreating(true);
                      setNewName('');
                      setNewDescription('');
                      setCreateError(null);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
                  >
                    Create team
                  </button>
                )}
              </div>

              {creating && (
                <form
                  onSubmit={handleCreate}
                  className="space-y-3 mb-6 p-4 border border-fm-border rounded-fm-input"
                >
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Team name"
                    maxLength={TEAM_NAME_MAX_LENGTH}
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
                  {createError && <p className="text-xs text-fm-critical">{createError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy || !newName.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                    >
                      {busy ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {teams.length === 0 ? (
                <p className="text-sm text-fm-text-tertiary py-4">
                  You are not on any team yet. Create one to start sharing.
                </p>
              ) : (
                <ul className="space-y-2">
                  {teams.map((team) => (
                    <TeamCard
                      key={team.team_id}
                      team={team}
                      currentUserId={currentUserId}
                      onLeft={load}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
