import { describe, it, expect } from 'vitest';
import {
  resolveCaseConversationLayout,
  resolveConversationSurface,
  transcriptTabIsShown,
  type ConversationSurface,
  type ConversationSurfaceInput,
} from '../../../lib/cases/conversationSurface';

/**
 * ADR-018 D2's table, stated as a table.
 *
 * This is the whole rule — where a case's conversation renders — and it is
 * asserted here in isolation because every other test about it is a rendering
 * test, and a rendering test cannot cover a combination the app cannot yet
 * produce. `prefersExtension: true` is exactly that: sequencing row 6 supplies
 * it, and it is blocked on faultmaven-copilot#256. Binding it now means landing
 * that row is a change of INPUT, not a change of rule.
 */

const BASE: ConversationSurfaceInput = {
  isOwner: true,
  prefersExtension: false,
  dockFits: true,
  dockOpen: true,
};

const TABLE: {
  row: string;
  input: Partial<ConversationSurfaceInput>;
  surface: ConversationSurface;
}[] = [
  {
    row: 'preference on, any width — the composer is in the extension',
    input: { prefersExtension: true },
    surface: 'tab-record',
  },
  {
    row: 'preference on, narrow — still the extension; width changes nothing',
    input: { prefersExtension: true, dockFits: false },
    surface: 'tab-record',
  },
  {
    row: 'preference off, wide, dock open — the composer is in the dock',
    input: {},
    surface: 'dock',
  },
  {
    row: 'preference off, narrow — no dock at this width, so the tab carries it',
    input: { dockFits: false },
    surface: 'tab-live',
  },
  {
    row: 'not the owner — no composer for them anywhere',
    input: { isOwner: false },
    surface: 'tab-record',
  },
  {
    row: 'not the owner, narrow — non-ownership still wins over width',
    input: { isOwner: false, dockFits: false },
    surface: 'tab-record',
  },
];

describe("where a case's conversation renders", () => {
  it.each(TABLE)('$row → $surface', ({ input, surface }) => {
    expect(resolveConversationSurface({ ...BASE, ...input })).toBe(surface);
  });

  it('never hands a composer to a non-owner, whatever else is true', () => {
    // The rule's one safety property, stated separately from the table so that
    // editing a row cannot quietly delete it. Fails CLOSED by construction.
    for (const prefersExtension of [true, false]) {
      for (const dockFits of [true, false]) {
        for (const dockOpen of [true, false]) {
          expect(
            resolveConversationSurface({ isOwner: false, prefersExtension, dockFits, dockOpen }),
          ).toBe('tab-record');
        }
      }
    }
  });

  describe('a COLLAPSED dock is not a fifth rule', () => {
    it('sends the conversation back to the tab as the RECORD', () => {
      // The collapsed rail is still a composer, one click away — so the same
      // question answers it, and the tab comes back read-only. That is what
      // keeps "exactly one surface renders the conversation" true through a
      // collapse without the panel ever moving between two mount points.
      expect(resolveConversationSurface({ ...BASE, dockOpen: false })).toBe('tab-record');
    });

    it('but a NARROW viewport gives the live panel, because there is no rail', () => {
      // Not the same situation and must not be folded into it: below the
      // breakpoint there is no dock at all, so a read-only tab would leave a
      // guest with no composer anywhere and no way to use the product.
      expect(resolveConversationSurface({ ...BASE, dockFits: false, dockOpen: false })).toBe(
        'tab-live',
      );
    });
  });
});

describe('what the page derives from it', () => {
  it('shows the Transcript tab everywhere except while the dock has it', () => {
    for (const { input } of TABLE) {
      const layout = resolveCaseConversationLayout({ ...BASE, ...input });
      expect(layout.transcriptTabShown).toBe(layout.surface !== 'dock');
      expect(transcriptTabIsShown(layout.surface)).toBe(layout.transcriptTabShown);
    }
  });

  it('counts a COLLAPSED dock as present, because it still holds its panel', () => {
    // `dockPresent` and `surface === 'dock'` ask different questions: one is
    // "is the column on the page", the other "is it showing the conversation".
    // Conflating them would unmount the panel on collapse and lose a turn in
    // flight — the exact thing the mount lifecycle exists to prevent.
    const collapsed = resolveCaseConversationLayout({ ...BASE, dockOpen: false });
    expect(collapsed.surface).toBe('tab-record');
    expect(collapsed.dockPresent).toBe(true);
  });

  it('has no dock for a non-owner, at any width', () => {
    for (const dockFits of [true, false]) {
      expect(
        resolveCaseConversationLayout({ ...BASE, isOwner: false, dockFits }).dockPresent,
      ).toBe(false);
    }
  });

  it('bounds the page to the viewport exactly when a composer is on it', () => {
    // The bounding exists only to keep a composer above the fold. On a page
    // with no composer at all the record is long-form content and the page
    // grows — bounding it there squeezed a transcript, a report and an evidence
    // list into a small inner scroller while the window below sat empty.
    expect(resolveCaseConversationLayout(BASE).viewportBounded).toBe(true);
    expect(
      resolveCaseConversationLayout({ ...BASE, dockOpen: false }).viewportBounded,
    ).toBe(true); // the rail is one click from a composer, and needs the height
    expect(
      resolveCaseConversationLayout({ ...BASE, dockFits: false }).viewportBounded,
    ).toBe(true); // the tab IS the composer here

    expect(
      resolveCaseConversationLayout({ ...BASE, isOwner: false }).viewportBounded,
    ).toBe(false);
    expect(
      resolveCaseConversationLayout({ ...BASE, prefersExtension: true }).viewportBounded,
    ).toBe(false);
  });

  it('never bounds a page that has no composer, in any combination', () => {
    for (const isOwner of [true, false]) {
      for (const prefersExtension of [true, false]) {
        for (const dockFits of [true, false]) {
          for (const dockOpen of [true, false]) {
            const layout = resolveCaseConversationLayout({
              isOwner,
              prefersExtension,
              dockFits,
              dockOpen,
            });
            const hasComposerOnPage = layout.dockPresent || layout.surface === 'tab-live';
            expect(layout.viewportBounded).toBe(hasComposerOnPage);
          }
        }
      }
    }
  });
});
