/**
 * Who may EDIT or DELETE a knowledge-base document.
 *
 * One predicate for both, because the backend has one policy for both:
 * `ensure_document_write_allowed` (`knowledge/domain/document_write.py`) is
 * reached by `PUT` and `DELETE` alike, and by their bulk twins, so a client
 * that gates them separately is wrong on one of them by construction.
 *
 * It lives here rather than inline in `KBPage` because it is an authorization
 * rule, and the rest of them are testable pure functions (`src/lib/access.ts`).
 * The `scope === 'team'` bug this fixes survived as a `TODO` for exactly as
 * long as probing it meant booting the whole page.
 *
 * ## The server's rule
 *
 *     global            -> platform admin, and SINGLE-TENANT only
 *     personal / team   -> the OWNER; or the platform operator, again
 *                          single-tenant only
 *
 * ## What this mirrors, and what it deliberately does not
 *
 * The OWNER arm is mirrored exactly, and is the point of this module. It is
 * scope-agnostic for everything non-global, as the server's is. This client
 * used to read `if (scope === 'team') return isAdmin;`, which locked the
 * AUTHOR of a team runbook out of their own document — a write the API would
 * have accepted. The routes were operator-only once; FaultMaven/faultmaven#834
 * made them ownership-aware and #866 extended that to the bulk routes, and
 * this client had not caught up.
 *
 * ‼ The OPERATOR arm is NOT extended to `personal`, and that asymmetry is
 * deliberate rather than an oversight. The server grants it there too when
 * single-tenant, but ADR-012 is the tie-breaker: operator access to tenant
 * content is the audited break-glass path, never a standing bypass, and
 * `personal` is the most tenant-private tier there is. Adding a new standing
 * operator bypass there is the thing that ADR is most directly against. So
 * the operator arm stays exactly where it already was (`global`, `team`).
 *
 * The operator arm on `global` and `team` mirrors the server's condition that
 * the deployment is not multi-tenant (`is_global_authoring_allowed`) through
 * `features.multiTenant` on `/meta/capabilities`, which the backend derives
 * from the same setting its policy reads (FaultMaven/faultmaven#1489). It
 * arrives as `multiTenant` from `useCapabilities`, where an absent field (an
 * older core), a loading fetch and a failed one all read as multi-tenant: an
 * operator the page cannot vouch for is offered no Edit rather than one that
 * meets a 403. Never gate it on `deployment`: `deploymentMode` is
 * `DEPLOYMENT_MODE` and answers a different question, and a single-tenant
 * cloud's operator does hold the arm.
 */

/** The fields the policy reads. Both are optional on a list row. */
export interface WritableDocument {
  scope?: string | null;
  owner_id?: string | null;
}

export function canWriteDocument(
  doc: WritableDocument,
  isAdmin: boolean,
  userId: string | null,
  multiTenant: boolean,
): boolean {
  // An absent scope falls through to `global`: fail closed to admin-only.
  const scope = doc.scope || 'global';

  // `owner_id` and `userId` must BOTH be real ids. The server spells this
  // `owner_id and actor_user_id and owner_id == actor_user_id`; without the
  // truthiness checks an unowned document (null) and an unidentified viewer
  // (null) compare equal and every such row unlocks.
  const isOwner = userId !== null && !!doc.owner_id && doc.owner_id === userId;

  // The server refuses the operator arm under multi-tenant, on every scope.
  const isOperator = isAdmin && !multiTenant;

  if (scope === 'global') return isOperator;
  if (scope === 'team') return isOwner || isOperator;
  if (scope === 'personal') return isOwner;
  return false;
}
