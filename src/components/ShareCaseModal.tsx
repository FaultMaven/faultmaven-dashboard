import { useEffect, useState } from 'react';
import { shareCaseWithTeam, unshareCaseFromTeam, type Team } from '../lib/api';

interface ShareCaseModalProps {
  isOpen: boolean;
  caseId: string;
  /** The case's current `shared_team_ids` (ADR-013 §D4). */
  sharedTeamIds: string[];
  /** Teams the owner can share with (from `useTeamSharing`). */
  teams: Team[];
  onClose: () => void;
  /** Called after any successful share/unshare so the parent can refetch the
   *  case and re-sync the badge. */
  onChanged: () => void;
}

/**
 * Owner-only modal to share a case with — or unshare it from — the Teams the
 * owner belongs to (ADR-013 §D4). Each team is a toggle reflecting the current
 * share state; toggling calls the team-share endpoint immediately. The backend
 * enforces owner-only + membership, so this is a convenience surface, not the
 * authority.
 */
export function ShareCaseModal({
  isOpen,
  caseId,
  sharedTeamIds,
  teams,
  onClose,
  onChanged,
}: ShareCaseModalProps) {
  const [shared, setShared] = useState<Set<string>>(new Set(sharedTeamIds));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from props whenever the modal (re)opens or the case's shares change
  // after a parent refetch, so optimistic state never drifts from the server.
  useEffect(() => {
    if (isOpen) {
      setShared(new Set(sharedTeamIds));
      setError(null);
    }
  }, [isOpen, sharedTeamIds]);

  if (!isOpen) return null;

  const toggle = async (teamId: string) => {
    const wasShared = shared.has(teamId);
    setBusyId(teamId);
    setError(null);

    // Optimistic update; revert on failure.
    const next = new Set(shared);
    if (wasShared) next.delete(teamId);
    else next.add(teamId);
    setShared(next);

    try {
      if (wasShared) {
        await unshareCaseFromTeam(caseId, teamId);
      } else {
        await shareCaseWithTeam(caseId, teamId);
      }
      onChanged();
    } catch (err) {
      setShared(shared); // revert to the pre-toggle set
      setError(err instanceof Error ? err.message : 'Failed to update share');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6 w-full max-w-md shadow-fm-card">
        <h3 className="text-lg font-semibold text-fm-text-primary mb-1" id="share-modal-title">
          Share with a team
        </h3>
        <p className="text-sm text-fm-text-secondary mb-4">
          Team members can view this case. Sharing is reversible.
        </p>

        {teams.length === 0 ? (
          <p className="text-sm text-fm-text-tertiary py-4">
            You don&apos;t belong to any teams yet.
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {teams.map((team) => {
              const isShared = shared.has(team.team_id);
              const isBusy = busyId === team.team_id;
              return (
                <li
                  key={team.team_id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-fm-input border border-fm-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fm-text-primary truncate">{team.name}</p>
                    {team.description && (
                      <p className="text-xs text-fm-text-tertiary truncate">{team.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(team.team_id)}
                    disabled={isBusy}
                    aria-pressed={isShared}
                    className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-fm-btn border transition-colors disabled:opacity-50 ${
                      isShared
                        ? 'bg-fm-accent/10 text-fm-accent border-fm-accent/30 hover:bg-fm-accent/20'
                        : 'text-fm-text-secondary border-fm-border hover:bg-fm-elevated'
                    }`}
                  >
                    {isBusy ? '…' : isShared ? 'Shared ✓' : 'Share'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="text-xs text-fm-critical mt-3">{error}</p>}

        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
