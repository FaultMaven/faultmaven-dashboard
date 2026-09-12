import { useState } from 'react';
import { CasePanelMount } from './CasePanelMount';

/**
 * The conversation, docked beside the case record (ADR-018 D2).
 *
 * THE DOCK IS ADDITIVE. The design target is the Dashboard *without* it: five
 * read-only tabs, complete and cheap on their own, for the long-term user who
 * has the extension and chats there. This column is what a guest gets before
 * they install — so it is added to that base and never replaces a part of it.
 * It exists because the workflow the product is for is reading the report while
 * asking about it, which faultmaven-dashboard#124 removed by making the two
 * mutually exclusive tabs.
 *
 * MOUNT ON FIRST OPEN, HIDE THEREAFTER. Two requirements pull in opposite
 * directions and this is the shape that satisfies both:
 *
 *  - "A dock that has never been opened is proven to mount nothing" — no
 *    package chunk, no session, no transcript fetch. So a viewer who collapsed
 *    it last time pays nothing for it this time.
 *  - "A collapse with a turn in flight must hide rather than unmount." The
 *    panel owns its session, its conversation cache and any turn in progress;
 *    unmounting on collapse would throw away a turn the user is waiting on.
 *
 * Hence `hasOpened`: nothing at all until the first open, and from then on the
 * same instance, hidden while the rail is showing. The flag is one-way on
 * purpose — going back to "never opened" is exactly the unmount this avoids.
 */
export function ConversationDock({
  caseId,
  readOnly,
  open,
  onToggle,
}: {
  caseId: string;
  readOnly: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);

  return (
    <aside
      data-testid="conversation-dock"
      data-open={open}
      className={`flex-shrink-0 min-h-0 flex flex-col bg-fm-surface rounded-fm-card border border-fm-border ${
        open ? 'w-[26rem]' : 'w-11'
      }`}
      aria-label="Conversation"
    >
      {open ? (
        /* NO VISIBLE TITLE HERE. The panel renders its OWN case header the
           moment it mounts — title, state, stage, turn — directly below this
           bar, so a "Conversation" label above it is two stacked headers in a
           416px column. Measured in a browser: they abut. The region is named
           for assistive tech by the `aria-label` on the <aside>, and the
           collapsed rail carries the word where it actually earns its place —
           so this bar exists only to hold the control. */
        <div className="flex-shrink-0 flex items-center justify-end px-2 pt-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={true}
            aria-controls="conversation-dock-body"
            title="Collapse the conversation"
            className="text-fm-text-secondary hover:text-fm-accent transition-colors text-xs px-1"
          >
            <span aria-hidden="true">→</span>
            <span className="sr-only">Collapse the conversation</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-controls="conversation-dock-body"
          title="Show the conversation"
          className="flex-1 min-h-0 w-full flex flex-col items-center gap-3 py-4 text-fm-text-secondary hover:text-fm-accent transition-colors"
        >
          <span aria-hidden="true" className="text-xs">←</span>
          {/* Upright, so the rail reads as a thing that opens rather than as a
              decorative border. `sr-only` on the icon alone would leave a
              screen reader with a button named nothing. */}
          <span
            aria-hidden="true"
            className="text-[10px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl]"
          >
            Conversation
          </span>
          <span className="sr-only">Show the conversation</span>
        </button>
      )}

      {/* The CONTAINER is always rendered; only its contents wait for the first
          open. Both toggles point `aria-controls` here, and a returning viewer
          who collapsed the dock last session arrives with `hasOpened` false —
          so gating the element itself left the rail advertising
          `aria-expanded` against a target that did not exist, which is an ARIA
          validity error (axe `aria-valid-attr-value`) and a region a screen
          reader cannot resolve. An empty div costs nothing; the panel inside it
          is still what is withheld. */}
      <div
        id="conversation-dock-body"
        className={open ? 'flex-1 min-h-0 p-2' : 'hidden'}
        data-testid="conversation-dock-body"
      >
        {hasOpened && <CasePanelMount caseId={caseId} readOnly={readOnly} />}
      </div>
    </aside>
  );
}
