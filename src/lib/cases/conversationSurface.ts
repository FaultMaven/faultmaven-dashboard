/**
 * WHERE a case's conversation renders (ADR-018 D2).
 *
 * One question decides it, and this is the only place it is asked:
 *
 *   > does this user have a composer somewhere else?
 *
 * A transcript is *record content*, in the same category as the report and the
 * evidence: something a person reads about a case. A composer is an interactive
 * surface. faultmaven-dashboard#124 conflated the two by making the Transcript
 * tab a live panel unconditionally — so the case record and the conversation
 * about it became mutually exclusive tabs, and a teammate who could not type
 * paid for a whole panel mount to be told so.
 *
 * D2's table, and the row each branch below answers:
 *
 * | Preference | Width  | Composer lives in | Conversation renders in |
 * |------------|--------|-------------------|-------------------------|
 * | on         | any    | the extension     | the tab, read-only      |
 * | off        | wide   | the dock          | **the dock** (tab hidden) |
 * | off        | narrow | nowhere else      | the tab, live           |
 * | —          | any, not the owner | nowhere | the tab, read-only   |
 *
 * COLLAPSE is not a fifth rule. A collapsed dock is still a composer, one click
 * away in the rail — so the same question answers it, and the tab comes back as
 * the RECORD. That is what keeps "exactly one surface renders the conversation"
 * true through a collapse without the panel ever moving: the dock keeps its
 * mounted panel (hidden, so an in-flight turn survives) and the tab renders the
 * finished conversation beside it.
 *
 * The narrow case is genuinely different and must not be folded into it: there
 * is no dock at that width at all, so a read-only tab would leave a guest with
 * no composer anywhere and no way to use the product. Hence `tab-live`.
 */

export type ConversationSurface =
  /** The right-hand dock, open, carrying the live panel. The Transcript tab is hidden. */
  | 'dock'
  /** The Transcript tab, carrying the live panel — the only composer this user has. */
  | 'tab-live'
  /** The Transcript tab, read-only. Their composer is elsewhere, or they have none. */
  | 'tab-record';

export interface ConversationSurfaceInput {
  /**
   * Does this case belong to the person looking at it?
   *
   * Non-ownership wins over everything: a teammate viewing a shared case never
   * gets a composer, at any width, under any preference. Derived from the
   * case's own `user_id` and not from whether the page happens to offer a Share
   * button — and it must FAIL CLOSED, because an unknown viewer or an unknown
   * owner is not a match.
   */
  isOwner: boolean;

  /**
   * Has this browser profile asked for chat to live in the Copilot extension?
   *
   * ADR-018 D3, sequencing row 6 — LIVE, read from
   * `lib/copilot/chatSurfacePreference.ts`. Per browser profile, defaulting
   * off, and never set by detection: the Dashboard can tell the extension is
   * installed but not whether its side panel is open, so standing down on
   * detection would strand an installed-but-closed user.
   */
  prefersExtension: boolean;

  /**
   * Is the viewport wide enough for two columns?
   *
   * Below that width there is no dock — the conversation goes back to being a
   * tab. Not an overlay and not a bottom sheet: a second interaction model that
   * appears at a breakpoint is the thing that reads as bolted on, and
   * collapsing keeps one model at every width.
   */
  dockFits: boolean;

  /**
   * Is the dock expanded? Remembered per viewer; open the first time.
   *
   * Only consulted where a dock exists at all, which is why it sits below
   * `dockFits` rather than beside it.
   */
  dockOpen: boolean;
}

export function resolveConversationSurface({
  isOwner,
  prefersExtension,
  dockFits,
  dockOpen,
}: ConversationSurfaceInput): ConversationSurface {
  if (!isOwner) return 'tab-record';
  if (prefersExtension) return 'tab-record';
  if (!dockFits) return 'tab-live';
  return dockOpen ? 'dock' : 'tab-record';
}

/**
 * Everything the case-detail page needs to lay itself out, from the one rule.
 *
 * Resolved ONCE, by the page, and handed down. Three consumers would otherwise
 * each re-derive it from the same inputs — the tab strip, the dock, and the
 * page's own height — and any two of them disagreeing produces a visible
 * defect: two live panels on one screen, a default tab that is not in the
 * strip, or a dock with no column height to take.
 */
export interface CaseConversationLayout {
  surface: ConversationSurface;

  /**
   * Is there a dock on this page at all — expanded OR collapsed to its rail?
   *
   * Distinct from `surface === 'dock'`, which asks whether it is *showing the
   * conversation*. A collapsed dock still occupies the layout and still holds
   * its mounted panel, so it is still present.
   */
  dockPresent: boolean;

  /**
   * Is the Transcript tab in the strip?
   *
   * Everywhere except while the dock is showing the conversation — that would
   * be a second rendering of one conversation on one page, and the question
   * "where is the transcript?" would have two answers.
   */
  transcriptTabShown: boolean;

  /**
   * Is the page bounded to the viewport rather than growing with its content?
   *
   * The bounding exists for ONE reason: a composer below the fold has to be
   * scrolled to before it can be typed in, which is what a self-named
   * `h-[70vh] min-h-[28rem]` produced once the case card had pushed the panel
   * down the page. So it applies exactly where a composer is on the page —
   * including behind a collapsed rail, which is one click from showing one and
   * needs a column height either way.
   *
   * Where there is no composer at all the page is long-form record content and
   * goes back to growing. Bounding it there would squeeze a transcript, a
   * report and an evidence list into a small inner scroller to protect an input
   * box that is not on the page.
   */
  viewportBounded: boolean;
}

export function resolveCaseConversationLayout(
  input: ConversationSurfaceInput,
): CaseConversationLayout {
  const surface = resolveConversationSurface(input);
  const dockPresent = input.isOwner && !input.prefersExtension && input.dockFits;

  return {
    surface,
    dockPresent,
    transcriptTabShown: surface !== 'dock',
    viewportBounded: dockPresent || surface === 'tab-live',
  };
}
