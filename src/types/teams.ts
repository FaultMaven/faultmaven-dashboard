// Team DTOs — the consent surface core publishes at contract 3.1.0/3.4.0.
//
// A team is parented by the ENTERPRISE and forms by consent (ADR-017 D4): any
// account may create one and is its team admin, the admin offers an address a
// place, and the invitee's own accept is the only call that creates a
// membership. There is no organization here — not even an optional field, since
// a tolerated old field is what keeps a frontend reading it.
//
// Everything below aliases the generated contract. The cloud `/admin/teams`
// console these types used to describe was deleted in cloud contract 2.0.0: a
// billing admin has no standing over a team (ADR-017 D2).

import type { components, operations } from './api.generated';

/** A team the caller belongs to — `GET /api/v1/teams`, `POST /api/v1/teams`. */
export type Team = components['schemas']['TeamResponse'];

/** One row of a team's roster — `GET /api/v1/teams/{team_id}/members`. */
export type TeamMember = components['schemas']['TeamMemberResponse'];

/** `POST /api/v1/teams`. `name` is capped at 200 by the contract (3.4.0). */
export type CreateTeamRequest = components['schemas']['TeamCreateRequest'];

/** `POST /api/v1/teams/{team_id}/invitations` — the address being offered a place. */
export type InvitationCreateRequest = components['schemas']['InvitationCreateRequest'];

/** An offer to join a team, and what became of it. */
export type Invitation = components['schemas']['InvitationResponse'];

/**
 * What `POST /api/v1/invitations/{invitation_id}/accept` answers: the **team
 * just joined**, not the invitation. Once accepted the offer is spent, and the
 * team is the thing the caller now has.
 *
 * Derived from the generated OPERATION rather than named by hand, because a
 * hand-written return type on a client function is checked against nothing —
 * `response.json()` is `any`, so `Promise<Invitation>` compiles exactly as
 * happily as `Promise<Team>` and the declaration can be silently wrong (it
 * was). Reading it off the operation makes the declaration a claim the contract
 * can refute: if a regeneration renames this operation or stops publishing a
 * 200 on it, the build breaks here rather than at runtime in front of somebody.
 */
export type AcceptInvitationResult =
  operations['accept_invitation_api_v1_invitations__invitation_id__accept_post']['responses'][200]['content']['application/json'];

/**
 * The maximum `TeamCreateRequest.name` the backend accepts (contract 3.4.0,
 * narrowed from 255 to match `teams.name`'s `VARCHAR(200)` exactly).
 *
 * Mirrored so the field can stop a too-long name at the keystroke instead of
 * after a submit that 422s. The backend remains the authority.
 */
export const TEAM_NAME_MAX_LENGTH = 200;

/**
 * A refusal slug from the team/invitation surface.
 *
 * These routes answer 403/409/410 as `{error, detail, status_code, reason}`,
 * with the machine-readable slug in `reason` (contract 3.1.0). A client has to
 * tell "you are already a member" from "that address cannot join a team in this
 * enterprise" to say anything useful, and parsing prose for that is how a UI
 * ends up wrong in a language it was not written in.
 *
 * A 404 carries NO slug, deliberately: an id in another enterprise is *absent*,
 * never *forbidden*, and there is nothing to tell apart.
 */
export type TeamRefusalReason =
  | 'enterprise_is_personal'
  | 'address_outside_enterprise_domain'
  | 'already_a_member'
  | 'not_a_team_admin'
  | 'team_name_taken'
  | 'invitation_expired'
  | 'invitation_not_pending'
  | 'last_admin_cannot_leave'
  | 'single_tenant_has_no_teams'
  | 'single_tenant_has_no_invitations';

const TEAM_REFUSAL_REASONS: readonly TeamRefusalReason[] = [
  'enterprise_is_personal',
  'address_outside_enterprise_domain',
  'already_a_member',
  'not_a_team_admin',
  'team_name_taken',
  'invitation_expired',
  'invitation_not_pending',
  'last_admin_cannot_leave',
  'single_tenant_has_no_teams',
  'single_tenant_has_no_invitations',
];

/**
 * The refusal slug a thrown `APIError` carries, or `null`.
 *
 * `handleAPIResponse` keeps the parsed body on `APIError.details`, so the slug
 * survives the throw. Narrowed against the published set rather than cast: a
 * slug this client does not know is `null`, which routes the caller to the
 * backend's own `detail` sentence instead of to a branch written for a
 * different refusal.
 */
export function teamRefusalReason(error: unknown): TeamRefusalReason | null {
  if (!(error && typeof error === 'object' && 'details' in error)) return null;
  const details = (error as { details?: Record<string, unknown> }).details;
  const reason = details?.reason;
  if (typeof reason !== 'string') return null;
  return TEAM_REFUSAL_REASONS.includes(reason as TeamRefusalReason)
    ? (reason as TeamRefusalReason)
    : null;
}
