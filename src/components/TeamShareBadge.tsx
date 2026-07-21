interface TeamShareBadgeProps {
  /** The case's `shared_team_ids` (ADR-013 §D4). */
  teamIds: string[];
  /** team_id → name, from `useTeamSharing`. Ids missing from the map (e.g. a
   *  team the caller no longer belongs to) fall back to a generic label. */
  teamsById?: Map<string, string>;
}

/**
 * Small pill marking a case as shared with one or more Teams (ADR-013 §D4).
 * Renders nothing when the case is shared with no Team — which is always the
 * case in standalone, where team sharing is unwired — so callers need not gate
 * it themselves.
 */
export function TeamShareBadge({ teamIds, teamsById }: TeamShareBadgeProps) {
  if (!teamIds || teamIds.length === 0) return null;

  const names = teamIds.map((id) => teamsById?.get(id) ?? null);
  const known = names.filter((n): n is string => n !== null);

  const label =
    teamIds.length === 1
      ? known[0] ?? 'Team'
      : `${teamIds.length} teams`;

  // Tooltip lists resolvable names so a multi-team badge is still legible.
  const title =
    known.length > 0
      ? `Shared with ${known.join(', ')}`
      : 'Shared with a team';

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-fm-xs font-medium rounded-full border bg-fm-accent/10 text-fm-accent border-fm-accent/30"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-3 h-3"
        aria-hidden="true"
      >
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.517 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.654zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
      </svg>
      {label}
    </span>
  );
}
