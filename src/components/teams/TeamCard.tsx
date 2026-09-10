import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  inviteToTeam,
  leaveTeam,
  listTeamInvitations,
  listTeamMembers,
  revokeTeamInvitation,
  teamRefusalReason,
  type Invitation,
  type Team,
  type TeamMember,
} from '../../lib/teams';
import { PERSONAL_ENTERPRISE_SENTENCE, refusalMessage } from '../../lib/teams/copy';

interface TeamCardProps {
  team: Team;
  /** The signed-in account, for deciding whether this card shows the admin half. */
  currentUserId: string;
  /** Called after the caller leaves, so the page can re-read its team list. */
  onLeft: () => void;
}

const inputClass =
  'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

/**
 * One team: its roster, the caller's way out of it, and — for a team admin —
 * the invitations it has issued.
 *
 * The admin half is decided by the caller's OWN row in the roster
 * (`team_role === 'admin'`), not by a deployment role or a JWT claim: team
 * admin is a property of a membership, and reading it anywhere else would show
 * an invite form to somebody the backend will refuse.
 *
 * The roster and the invitation list are loaded when the card is expanded, so a
 * page listing N teams makes one request, not 2N.
 */
export function TeamCard({ team, currentUserId, onLeft }: TeamCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<string | null>(null);
  // Set when the backend refuses with `enterprise_is_personal`. Nothing on the
  // profile says whether this account is an island (ADR-017 D3) — there is no
  // enterprise on `/auth/me` at all — so the invite form is replaced by the
  // plain sentence only once the API has said so.
  const [personalEnterprise, setPersonalEnterprise] = useState(false);

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const isAdmin =
    members?.some((m) => m.user_id === currentUserId && m.team_role === 'admin') ?? false;

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const roster = await listTeamMembers(team.team_id);
      setMembers(roster);
      // The invitation list is the team admin's to read; asking for it as a
      // plain member is a 403 that would look like a broken page.
      if (roster.some((m) => m.user_id === currentUserId && m.team_role === 'admin')) {
        setInvitations(await listTeamInvitations(team.team_id));
      } else {
        setInvitations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this team');
    } finally {
      setLoading(false);
    }
  }, [team.team_id, currentUserId]);

  useEffect(() => {
    if (expanded && members === null) void loadRoster();
  }, [expanded, members, loadRoster]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteError(null);
    setInviteSent(null);
    try {
      await inviteToTeam(team.team_id, { email });
      setInviteEmail('');
      setInviteSent(email);
      setInvitations(await listTeamInvitations(team.team_id));
    } catch (err) {
      const reason = teamRefusalReason(err);
      if (reason === 'enterprise_is_personal') {
        // The form is replaced by the island sentence, so setting the error too
        // would print that sentence twice — once as an explanation and once as
        // a failure. It is not a failure; there is simply nobody to invite.
        setPersonalEnterprise(true);
      } else {
        setInviteError(
          refusalMessage(
            reason,
            err instanceof Error ? err.message : 'Failed to send the invitation'
          )
        );
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setInviteError(null);
    try {
      await revokeTeamInvitation(team.team_id, invitationId);
    } catch (err) {
      // An offer that ran out of time is not a failed withdrawal: the backend
      // has settled it as `expired`, and the re-read below shows that. Say so
      // plainly instead of reporting an error for a thing that is now done.
      setInviteError(
        refusalMessage(
          teamRefusalReason(err),
          err instanceof Error ? err.message : 'Failed to withdraw the invitation'
        )
      );
    }
    // Re-read either way: a withdrawal changed the row, and so did a 410 — the
    // backend settles an elapsed offer as `expired` on the way to refusing.
    try {
      setInvitations(await listTeamInvitations(team.team_id));
    } catch {
      // Leave the list as it stands; the message above already says what happened.
    }
  };

  const handleLeave = async () => {
    setConfirmLeave(false);
    setLeaveError(null);
    try {
      await leaveTeam(team.team_id);
      onLeft();
    } catch (err) {
      setLeaveError(
        refusalMessage(
          teamRefusalReason(err),
          err instanceof Error ? err.message : 'Failed to leave the team'
        )
      );
    }
  };

  return (
    <li className="border border-fm-border rounded-fm-input">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fm-text-primary truncate">{team.name}</p>
          {team.description && (
            <p className="text-xs text-fm-text-tertiary truncate">{team.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="px-2 py-1 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
          >
            Members
          </button>
          <button
            onClick={() => setConfirmLeave(true)}
            className="px-2 py-1 text-xs font-medium text-fm-critical border border-fm-critical-border rounded-fm-btn hover:bg-fm-critical-bg transition-colors"
          >
            Leave
          </button>
        </div>
      </div>

      {leaveError && <p className="px-3 pb-2 text-xs text-fm-critical">{leaveError}</p>}

      {expanded && (
        <div className="border-t border-fm-border px-3 py-3 bg-fm-surface-alt/40 space-y-4">
          {loading && members === null ? (
            <p className="text-xs text-fm-text-tertiary">Loading…</p>
          ) : error ? (
            <p className="text-xs text-fm-critical">{error}</p>
          ) : (
            <>
              <div>
                <h4 className="text-xs font-semibold text-fm-text-secondary mb-1">Members</h4>
                <ul className="space-y-1">
                  {(members ?? []).map((member) => (
                    <li key={member.user_id} className="flex items-center gap-2 text-xs">
                      <span
                        className="font-mono text-fm-text-secondary truncate min-w-0"
                        title={member.user_id}
                      >
                        {member.user_id}
                      </span>
                      {member.team_role === 'admin' && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-fm-btn bg-fm-accent/10 text-fm-accent">
                          team admin
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {isAdmin && (
                <div>
                  <h4 className="text-xs font-semibold text-fm-text-secondary mb-1">Invitations</h4>

                  {personalEnterprise ? (
                    <p className="text-xs text-fm-text-secondary">{PERSONAL_ENTERPRISE_SENTENCE}</p>
                  ) : (
                    <form onSubmit={handleInvite} className="flex items-center gap-2 mb-2">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@yourcompany.com"
                        aria-label={`Invite someone to ${team.name}`}
                        className={`flex-1 min-w-0 ${inputClass}`}
                      />
                      <button
                        type="submit"
                        disabled={inviting || !inviteEmail.trim()}
                        className="flex-shrink-0 px-3 py-2 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                      >
                        {inviting ? 'Inviting…' : 'Invite'}
                      </button>
                    </form>
                  )}

                  {inviteError && <p className="text-xs text-fm-critical mb-2">{inviteError}</p>}
                  {inviteSent && (
                    <p className="text-xs text-fm-text-secondary mb-2">
                      Invited {inviteSent}. They join when they accept.
                    </p>
                  )}

                  {(invitations ?? []).length === 0 ? (
                    <p className="text-xs text-fm-text-tertiary">No invitations yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(invitations ?? []).map((invitation) => (
                        <li
                          key={invitation.invitation_id}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="text-fm-text-secondary truncate min-w-0">
                            {invitation.email}
                          </span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-fm-text-tertiary">{invitation.status}</span>
                            {invitation.status === 'pending' && (
                              <button
                                onClick={() => handleRevoke(invitation.invitation_id)}
                                className="text-fm-critical hover:underline"
                              >
                                Withdraw
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmLeave}
        title="Leave team"
        message="Leave this team? You lose access to everything shared with it, and its members lose access to what you shared."
        confirmLabel="Leave"
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </li>
  );
}
