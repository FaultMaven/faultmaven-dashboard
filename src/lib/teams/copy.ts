// What each refusal on the team/invitation surface says to a person.
//
// The backend sends a machine-readable slug in `reason` and a human sentence in
// `detail`. This maps the slug, because the slug is the stable half: `detail`
// is the backend's wording, written for an operator reading a log as much as
// for the person in front of the screen, and two of these slugs are the same
// sentence there on purpose.
//
// LEXICON (ADR-017 D1). The isolation tenant is the **enterprise** on operator
// and admin surfaces, and **your company** in end-user copy — which is what
// this file is. The vocabulary that called a team an account is retired (D6):
// a team is a group of accounts, never one.

import type { TeamRefusalReason } from '../../types/teams';

/**
 * The island sentence (ADR-017 D3/D4).
 *
 * An account on a personal email domain gets a private enterprise of its own,
 * so there is nobody in it to invite — by construction, not by policy. Nothing
 * on `/auth/me` says whether this account is such an island (the profile
 * carries no enterprise at all), so this is rendered when the backend refuses
 * an invitation with `enterprise_is_personal` rather than guessed client-side.
 */
export const PERSONAL_ENTERPRISE_SENTENCE =
  'You signed in with a personal email address, so this account has no company ' +
  'to share with — sign in with your work email to invite colleagues.';

const REFUSAL_COPY: Record<TeamRefusalReason, string> = {
  enterprise_is_personal: PERSONAL_ENTERPRISE_SENTENCE,

  // One answer to two questions, deliberately: an address on another domain and
  // an address whose account belongs to another company are refused
  // identically, because telling them apart would answer "does an account exist
  // at this address?" to anybody who can create a team. Say nothing more than
  // the rule.
  address_outside_enterprise_domain:
    'You can only invite people whose email address is on your company’s domain.',

  already_a_member: 'That person is already on this team.',
  not_a_team_admin: 'Only a team admin can do that.',
  team_name_taken: 'You already have a team with that name.',

  // Not an error: an offer simply ran out of time. Rendered in place, never as
  // a failure banner.
  invitation_expired: 'This invitation has expired.',
  invitation_not_pending: 'This invitation has already been answered.',

  // Core publishes no way to promote another member or to evict one, so the
  // only honest advice is the one that exists: the others leave first.
  last_admin_cannot_leave:
    'You are the only admin of this team, and it still has other members, so you cannot leave it yet.',

  single_tenant_has_no_teams: 'Team sharing is not available in this deployment.',
  single_tenant_has_no_invitations: 'Team sharing is not available in this deployment.',
};

/**
 * The sentence for a refusal, or the backend's own `detail` when the slug is
 * absent or unknown to this client.
 *
 * A 404 on this surface carries no slug at all — an id in another company is
 * *absent*, never *forbidden* — so it lands on the fallback, which is correct:
 * there is nothing to tell apart.
 */
export function refusalMessage(
  reason: TeamRefusalReason | null,
  fallback: string
): string {
  return reason ? REFUSAL_COPY[reason] : fallback;
}
