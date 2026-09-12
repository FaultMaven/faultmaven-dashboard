import { afterEach } from 'vitest';
import { resetDockFitsForTests } from '../../hooks/useDockFits';

/**
 * A desktop- or phone-class viewport, for tests that render a page whose layout
 * depends on `useDockFits`.
 *
 * Driven through `matchMedia` because that is what the hook subscribes to, and
 * because happy-dom performs no layout of its own — setting a width would tell
 * the hook nothing.
 *
 * Shared rather than copied into each page test: the stub has to satisfy both
 * the modern (`addEventListener`) and legacy (`addListener`) MediaQueryList
 * APIs, and a second copy is a second thing to fix when either the hook's query
 * or happy-dom's shape moves.
 */

/** The real `matchMedia`, captured once so every restore returns the same thing. */
const original = globalThis.window?.matchMedia;

export function setViewport(kind: 'wide' | 'narrow'): void {
  const matches = kind === 'wide';
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  // The hook MEMOISES its MediaQueryList for the life of the document — one
  // allocation instead of one per render. That makes swapping `matchMedia`
  // underneath it invisible unless the memo is dropped too, so a second test
  // would silently read the first test's viewport.
  resetDockFitsForTests();
}

/**
 * Put the real `matchMedia` back after every test in any file that imports
 * this.
 *
 * Registered by the MODULE rather than left to each caller. `setViewport` is
 * usually buried inside a render helper, so a missing teardown does not look
 * like a missing teardown — it looks like a test asserting the wrong branch for
 * reasons nobody can see, and only when it runs after a particular sibling.
 */
afterEach(() => {
  if (original) {
    window.matchMedia = original;
  } else {
    delete (window as { matchMedia?: unknown }).matchMedia;
  }
  resetDockFitsForTests();
});
