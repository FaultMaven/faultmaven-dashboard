import { useSyncExternalStore } from 'react';

/**
 * The width at which the case record and the conversation fit side by side.
 *
 * Tailwind's `lg`. Below it the dock is absent and the conversation goes back
 * to being a tab (ADR-018 D2) — never an overlay or a bottom sheet, which would
 * be a second interaction model appearing at a breakpoint.
 *
 * Expressed as a media query rather than as a Tailwind class because the
 * decision is not only about layout: below this width the panel is mounted
 * somewhere else entirely, and `hidden lg:block` would MOUNT BOTH and render
 * one — two panel instances on one page, which ADR-018 D6 forbids outright.
 */
export const DOCK_MEDIA_QUERY = '(min-width: 1024px)';

/**
 * The one live `MediaQueryList` for this document, created lazily.
 *
 * Memoised because `readFits` is `useSyncExternalStore`'s `getSnapshot`: React
 * calls it on every render and again after every commit to check for a change,
 * and `subscribe` would call `matchMedia` a third time. Each call allocates a
 * live query object registered with the document, so an unmemoised version
 * leaked one per render — and `subscribe` and `readFits` would be watching
 * different objects, which is exactly the kind of thing that reads as a
 * flakey test rather than a bug.
 *
 * `undefined` means "not yet asked"; `null` means "asked, and this platform has
 * no usable `matchMedia`".
 */
let cached: MediaQueryList | null | undefined;

function mediaQueryList(): MediaQueryList | null {
  if (cached !== undefined) return cached;
  try {
    cached =
      typeof window === 'undefined' ? null : (window.matchMedia?.(DOCK_MEDIA_QUERY) ?? null);
  } catch {
    cached = null;
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQueryList();
  // `addEventListener` on a MediaQueryList is not universal — Safari below 14
  // and older WebKit ship only the deprecated `addListener`. Unguarded, this
  // threw a TypeError from inside `useSyncExternalStore` during commit and took
  // the whole case-detail page down, rather than degrading to a static reading
  // of a width that rarely changes mid-session.
  if (!mql || typeof mql.addEventListener !== 'function') return () => {};
  try {
    mql.addEventListener('change', onChange);
  } catch {
    return () => {};
  }
  return () => {
    try {
      mql.removeEventListener('change', onChange);
    } catch {
      // The listener goes with the document either way.
    }
  };
}

/**
 * Defaults to TRUE where `matchMedia` is unavailable. The desktop arrangement
 * is the one this product is used in, and an environment that cannot answer the
 * question should not silently take every user down the narrow path.
 */
function readFits(): boolean {
  return mediaQueryList()?.matches ?? true;
}

/**
 * Reset the memoised query. Tests swap `window.matchMedia` between cases, and
 * a value cached from the previous swap would make them order-dependent.
 */
export function resetDockFitsForTests(): void {
  cached = undefined;
}

export function useDockFits(): boolean {
  return useSyncExternalStore(subscribe, readFits, () => true);
}
