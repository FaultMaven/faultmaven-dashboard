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
 * deliberate rather than an oversight. The server's operator arm is
 * conditional on the deployment not being multi-tenant
 * (`is_global_authoring_allowed`), and this client cannot evaluate that term:
 * `deploymentMode` on `/meta/capabilities` is derived from the dashboard URL
 * (`settings.is_cloud`), not from the tenant provider, and no capability
 * advertises tenancy. Guessing costs something either way — `deployment ===
 * 'cloud'` would strip global authoring from cloud operators today, since
 * Cloud is still single-tenant until ADR-010 P2.
 *
 * So the operator arm stays exactly where it already was (`global`, `team`)
 * and is not added to `personal`. ADR-012 is the tie-breaker: operator access
 * to tenant content is the audited break-glass path, never a standing bypass,
 * and `personal` is the most tenant-private tier there is. Adding a new
 * standing operator bypass there is the thing that ADR is most directly
 * against — and neither bug this module fixes needs it.
 *
 * ⚠️ The pre-existing `global` and `team` operator arms remain wrong under
 * multi-tenant, where the server refuses them: an operator is offered Edit and
 * meets a 403. That is not introduced here and not removable here. Closing it
 * needs a tenancy capability from the backend — gate on that when it exists,
 * never on `deployment`, which answers a different question.
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
): boolean {
  // An absent scope falls through to `global`: fail closed to admin-only.
  const scope = doc.scope || 'global';

  // `owner_id` and `userId` must BOTH be real ids. The server spells this
  // `owner_id and actor_user_id and owner_id == actor_user_id`; without the
  // truthiness checks an unowned document (null) and an unidentified viewer
  // (null) compare equal and every such row unlocks.
  const isOwner = userId !== null && !!doc.owner_id && doc.owner_id === userId;

  if (scope === 'global') return isAdmin;
  if (scope === 'team') return isOwner || isAdmin;
  if (scope === 'personal') return isOwner;
  return false;
}
