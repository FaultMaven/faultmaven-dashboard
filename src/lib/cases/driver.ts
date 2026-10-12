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
 * Every predicate here FAILS CLOSED on an unknown viewer or creator, and on a
 * driver the server sent as `null`.
 *
 * ‼ An ABSENT `driver_id` key is different: it means a core older than
 * contract 13.2.0, which has no driver field because, before ADR-020, the
 * creator was the only writer. The Dashboard and the API deploy independently
 * (separate image tags), so the Dashboard can run ahead of its core; reading
 * "absent" as "nobody drives" took every creator's composer away on such a
 * core. So an absent key resolves to the creator (`effectiveDriverId`), and a
 * present `null` — which no 13.2.0 core sends — still matches nobody.
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

/**
 * Who drives this case, as far as this client can tell.
 *
 * `driver_id` when the server sent the key (13.2.0+: always the effective
 * driver, so `null` there is "unknown" and matches nobody); the creator when
 * the key is ABSENT, because a pre-13.2.0 core has no driver and its creator
 * is the one who writes.
 */
export function effectiveDriverId(row: CaseParties): string | null | undefined {
  return row.driver_id === undefined ? row.user_id : row.driver_id;
}

/** Is the viewer this case's (effective) driver — the one who may write it? */
export function isCaseDriver(row: CaseParties, viewerId: string | null | undefined): boolean {
  return matches(effectiveDriverId(row), viewerId);
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

/**
 * Labels for a list of candidates, with identical visible text told apart.
 *
 * Two candidates whose `personLabel(...).text` is the same (compared on `labelKey`:
 * normalised, case-sensitive) each get the 8-character id prefix appended,
 * "Member 3f9a (3f9a12bc)". Unique labels are returned unchanged. A label that
 * is already an id stand-in is never suffixed (it would repeat itself). Keyed
 * by `user_id`; the whole id stays in `title`.
 */
/**
 * The key two labels are compared on. Labels that LOOK the same to a person
 * must collide: NFC-vs-NFD accents, zero-width characters, and runs or kinds of
 * whitespace render identically. Case stays significant (a case-only difference
 * is visible).
 */
function labelKey(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function disambiguatedLabels(
  candidates: ReadonlyArray<{ user_id: string; display_name?: string | null }>,
): Map<string, PersonLabel | null> {
  const labels = candidates.map((c) => ({
    id: c.user_id,
    label: personLabel(c.display_name, c.user_id),
  }));
  const counts = new Map<string, number>();
  for (const { label } of labels) {
    if (label) counts.set(labelKey(label.text), (counts.get(labelKey(label.text)) ?? 0) + 1);
  }
  const out = new Map<string, PersonLabel | null>();
  for (const { id, label } of labels) {
    if (label && !label.isId && (counts.get(labelKey(label.text)) ?? 0) > 1) {
      out.set(id, { ...label, text: `${label.text} (${id.slice(0, SHORT_ID_LENGTH)})` });
    } else {
      out.set(id, label);
    }
  }
  return out;
}

export function creatorLabel(row: CaseParties): PersonLabel | null {
  return personLabel(row.creator_display_name, row.user_id);
}

/** The driver's name; on a pre-13.2.0 core (no `driver_id` key), the creator's. */
export function driverLabel(row: CaseParties): PersonLabel | null {
  return row.driver_id === undefined
    ? creatorLabel(row)
    : personLabel(row.driver_display_name, row.driver_id);
}
