import { useState } from 'react';
import {
  acceptInvitation,
  declineInvitation,
  teamRefusalReason,
  type Invitation,
} from '../../lib/teams';
import { refusalMessage } from '../../lib/teams/copy';

interface MyInvitationsPanelProps {
  invitations: Invitation[];
  /** Re-read both the invitations and the team list — accepting adds a team. */
  onAnswered: () => void;
}

/**
 * The invitee's half (ADR-017 D4): the offers addressed to me, and the only two
 * things I can do with one.
 *
 * Accepting is the ONLY call on this API that creates a team membership, which
 * is what makes a team consensual: an offer sitting here grants nothing at all,
 * so nothing is shared with me until I say yes.
 *
 * An offer that has run out of time answers 410 `invitation_expired`. That is
 * not an error — nobody did anything wrong, the offer simply lapsed — so it is
 * rendered as a plain note against the row, and the list is re-read so the row
 * goes away.
 */
export function MyInvitationsPanel({ invitations, onAnswered }: MyInvitationsPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const answer = async (invitation: Invitation, action: 'accept' | 'decline') => {
    setBusyId(invitation.invitation_id);
    setNotes((prev) => {
      const next = { ...prev };
      delete next[invitation.invitation_id];
      return next;
    });
    try {
      if (action === 'accept') {
        await acceptInvitation(invitation.invitation_id);
      } else {
        await declineInvitation(invitation.invitation_id);
      }
      onAnswered();
    } catch (err) {
      setNotes((prev) => ({
        ...prev,
        [invitation.invitation_id]: refusalMessage(
          teamRefusalReason(err),
          err instanceof Error ? err.message : 'Could not answer this invitation'
        ),
      }));
      // Re-read even on a refusal: a 410 means the backend has just settled the
      // offer as expired, so the row this person is looking at is already gone.
      onAnswered();
    } finally {
      setBusyId(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <section className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
      <h3 className="text-fm-heading font-bold text-fm-text-primary mb-1">Invitations for you</h3>
      <p className="text-sm text-fm-text-secondary mb-4">
        Nothing is shared with you until you accept.
      </p>

      <ul className="space-y-2">
        {invitations.map((invitation) => (
          <li
            key={invitation.invitation_id}
            className="border border-fm-border rounded-fm-input px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-fm-text-primary truncate min-w-0">
                {invitation.team_name ?? invitation.team_id}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => answer(invitation, 'accept')}
                  disabled={busyId === invitation.invitation_id}
                  className="px-3 py-1 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => answer(invitation, 'decline')}
                  disabled={busyId === invitation.invitation_id}
                  className="px-3 py-1 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
            {notes[invitation.invitation_id] && (
              <p className="text-xs text-fm-text-secondary mt-1">
                {notes[invitation.invitation_id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
