/**
 * What the Transcript tab renders (ADR-018 D2).
 *
 * The tab has two arms — the live Copilot panel, and the read-only
 * `TranscriptView` — and ONE question decides between them:
 *
 *   > does this user have a composer somewhere else?
 *
 * A transcript is *record content*, in the same category as the report and the
 * evidence: something a person reads about a case. The composer is the
 * interactive surface. faultmaven-dashboard#124 conflated the two by making the
 * tab mount a live panel unconditionally, which is what this rule undoes.
 *
 * D2's table, and where each row comes from:
 *
 * | Preference | Width  | Composer lives in | Transcript tab          |
 * |------------|--------|-------------------|-------------------------|
 * | on         | any    | the extension     | read-only               |
 * | off        | wide   | the dock          | hidden — the dock has it |
 * | off        | narrow | nowhere else      | the live panel          |
 * | —          | any, not the owner | nowhere | read-only            |
 *
 * The `hidden` row is not an outcome of THIS function. Whether the tab is in
 * the strip at all is the dock's decision (sequencing row 2) — and when the tab
 * is not rendered, what it would have rendered does not arise. This answers
 * only the question the tab itself asks, which keeps one rule in one place as
 * rows 2 and 6 add the inputs that make `composerElsewhere` true.
 *
 * Today neither of those inputs exists: no dock, no preference. So an owner's
 * only composer is this tab, which is the configuration that shipped in #124
 * and the one already known to work. Nobody regresses before row 2 lands.
 */

export type TranscriptRenderer = 'panel' | 'read-only';

export interface TranscriptSurfaceInput {
  /**
   * Does this case belong to the person looking at it?
   *
   * Non-ownership wins over everything: a teammate viewing a shared case never
   * gets a composer, at any width or preference. Derived from the case's own
   * `user_id` rather than from whether the page happens to offer a Share
   * button, and it must FAIL CLOSED — an unknown viewer or an unknown owner is
   * not a match.
   */
  isOwner: boolean;

  /**
   * Is a composer for this case already rendered somewhere else for this user?
   *
   * The extension's side panel (once the preference of sequencing row 6 exists)
   * or the right-hand dock (row 2). Until then, false: nothing else on the page
   * or in the browser is known to carry one.
   */
  composerElsewhere: boolean;
}

export function transcriptRenderer({
  isOwner,
  composerElsewhere,
}: TranscriptSurfaceInput): TranscriptRenderer {
  if (!isOwner) return 'read-only';
  return composerElsewhere ? 'read-only' : 'panel';
}
