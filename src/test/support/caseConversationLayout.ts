import {
  resolveCaseConversationLayout,
  type CaseConversationLayout,
  type ConversationSurfaceInput,
} from '../../lib/cases/conversationSurface';

/**
 * Layouts built by the REAL resolver, never by hand.
 *
 * A hand-written `CaseConversationLayout` literal can state a combination the
 * app cannot produce — a docked conversation with the Transcript tab also
 * showing, say — and a component test against one of those proves nothing
 * about anything a user can reach. Naming the four INPUTS and letting the rule
 * derive the rest keeps every fixture a real state of the product.
 *
 * The presets are the rows of ADR-018 D2's table.
 */
export function layoutFor(
  overrides: Partial<ConversationSurfaceInput> = {},
): CaseConversationLayout {
  return resolveCaseConversationLayout({
    isDriver: true,
    prefersExtension: false,
    dockFits: true,
    dockOpen: true,
    ...overrides,
  });
}

export const LAYOUTS = {
  /** Driver, wide, dock open: the conversation is docked, the tab is hidden. */
  docked: layoutFor(),
  /** Driver, wide, dock collapsed to its rail: the tab returns as the record. */
  dockCollapsed: layoutFor({ dockOpen: false }),
  /** Driver, narrow: no dock at this width, so the tab carries the live panel. */
  narrowDriver: layoutFor({ dockFits: false }),
  /** Not the driver (ADR-020): no composer anywhere, at any width. */
  nonDriver: layoutFor({ isDriver: false }),
  /** Chat lives in the extension (ADR-018 row 6): read-only everywhere here. */
  prefersExtension: layoutFor({ prefersExtension: true }),
} as const;
