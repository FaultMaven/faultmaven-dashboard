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
  // STATE ADJUSTED DURING RENDER, which is React's own documented pattern for
  // deriving from a prop that has changed — not a ref. A ref looks tempting
  // (this only ever goes false→true) and is wrong twice over: the value IS
  // needed for rendering, so reading it in render is what `react-hooks` rejects
  // outright, and a ref would not schedule the re-render that reveals the
  // panel. The extra pass is the price of the flag being render-relevant.
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
      {/* ONE BUTTON, not one per state.
          Two buttons in mutually exclusive branches meant that pressing the
          toggle UNMOUNTED the control the user was standing on: a keyboard user
          who tabbed to "Collapse the conversation" and pressed Enter was
          dropped to <body> and had to tab back through the header, the case
          card and the tab strip to reach the dock again — and a screen reader
          lost the `aria-expanded` change with the element that carried it.
          Measured: focus before "Collapse the conversation", focus after BODY.
          The same element persists across the toggle now, so focus stays on it
          and the state change is announced on the control that changed. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="conversation-dock-body"
        title={open ? 'Collapse the conversation' : 'Show the conversation'}
        className={
          open
            ? 'flex-shrink-0 self-end px-3 py-2 text-xs text-fm-text-secondary hover:text-fm-accent transition-colors'
            : 'flex-1 min-h-0 w-full flex flex-col items-center gap-3 py-4 text-fm-text-secondary hover:text-fm-accent transition-colors'
        }
      >
        <span aria-hidden="true" className="text-xs">{open ? '→' : '←'}</span>
        {/* The word earns its place only on the rail, where the column is 44px
            of otherwise unexplained border. Expanded, the panel renders its own
            case header directly below — measured in a browser, they abut — so a
            second heading there is two stacked headers in a 416px column. */}
        {!open && (
          <span
            aria-hidden="true"
            className="text-[10px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl]"
          >
            Conversation
          </span>
        )}
        <span className="sr-only">
          {open ? 'Collapse the conversation' : 'Show the conversation'}
        </span>
      </button>

      {/* The CONTAINER is always rendered; only its contents wait for the first
          open. `aria-controls` above names it, and a returning viewer who
          collapsed the dock last session arrives with `hasOpened` false — so
          gating the element itself left the toggle advertising `aria-expanded`
          against a target that did not exist, which is an ARIA validity error
          (axe `aria-valid-attr-value`) and a region a screen reader cannot
          resolve. An empty div costs nothing; the panel inside it is still what
          is withheld. */}
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
