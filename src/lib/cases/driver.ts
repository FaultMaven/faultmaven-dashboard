/**
 * Who may do what to a case (ADR-020): the CREATOR and the DRIVER.
 *
 * A case has a creator (`user_id`, unchanged) and one driver (`driver_id`).
 * On the wire `driver_id` is always the EFFECTIVE driver — the creator when
 * nobody else drives — so no client re-implements the server's NULL rule.
 *
 * - The DRIVER holds the investigation writes: turns, uploads, title, close,
 *   reports, resume. Whether this page offers a composer asks this question.
 * - The CREATOR holds governance: delete, share and unshare.
 * - Either of them may hand the driving on (`PUT /cases/{id}/driver`).
 *
 * Every predicate here FAILS CLOSED: an unknown viewer, an unknown creator or
 * an unknown driver is not a match. A core older than contract 13.2.0 sends
 * no `driver_id`, and the answer for that row is "not the driver" — the server
 * is the authority, and offering a composer it would refuse is the defect
 * ADR-020 exists to remove.
 */

/** The fields of a case row these rules read. Both `CaseSummary` and `CaseDetail` carry them. */
export interface CaseParties {
  user_id?: string | null;
  driver_id?: string | null;
  creator_display_name?: string | null;
  driver_display_name?: string | null;
}

function matches(id: string | null | undefined, viewerId: string | null | undefined): boolean {
  return !!id && !!viewerId && id === viewerId;
}

/** Is the viewer this case's (effective) driver — the one who may write it? */
export function isCaseDriver(row: CaseParties, viewerId: string | null | undefined): boolean {
  return matches(row.driver_id, viewerId);
}

/** Did the viewer create this case — the one who may share, unshare and delete it? */
export function isCaseCreator(row: CaseParties, viewerId: string | null | undefined): boolean {
  return matches(row.user_id, viewerId);
}

/**
 * May the viewer hand this case's driving to someone else?
 *
 * The creator or the effective driver (ADR-020 D4). A terminal case is NOT
 * excluded: a resolved or closed case still has driver-only writes (report
 * regeneration and edits, text questions), and refusing the hand-off would
 * freeze them on the last driver.
 */
export function mayReassignDriver(
  row: CaseParties,
  viewerId: string | null | undefined,
): boolean {
  return isCaseCreator(row, viewerId) || isCaseDriver(row, viewerId);
}

/** How many characters of an id stand in for a missing name. */
export const SHORT_ID_LENGTH = 8;

/**
 * How a person is shown: their display name, or — only when the server sent
 * no name — a short form of their id. `title` carries the whole id whenever
 * one is known, so the short form is never the only way to tell two apart.
 * `null` when there is neither (a core that predates the field).
 */
export interface PersonLabel {
  text: string;
  title?: string;
  /** True when `text` is an id stand-in rather than a name: rendered monospace. */
  isId: boolean;
}

export function personLabel(
  displayName: string | null | undefined,
  id: string | null | undefined,
): PersonLabel | null {
  const name = displayName?.trim();
  if (name) return { text: name, title: id || undefined, isId: false };
  if (id) return { text: id.slice(0, SHORT_ID_LENGTH), title: id, isId: true };
  return null;
}

export function creatorLabel(row: CaseParties): PersonLabel | null {
  return personLabel(row.creator_display_name, row.user_id);
}

export function driverLabel(row: CaseParties): PersonLabel | null {
  return personLabel(row.driver_display_name, row.driver_id);
}
