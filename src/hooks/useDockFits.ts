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

/** The live `MediaQueryList`, or null where the platform has no `matchMedia`. */
function mediaQueryList(): MediaQueryList | null {
  try {
    return typeof window === 'undefined' ? null : (window.matchMedia?.(DOCK_MEDIA_QUERY) ?? null);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQueryList();
  if (!mql) return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
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
 * Does the viewport have room for the dock?
 *
 * `useSyncExternalStore` rather than `useState` + an effect. The width is
 * external state that can change between the first render and the moment a
 * subscription is attached, and the effect version of this has to re-read on
 * subscribe to close that window — which is a synchronous `setState` inside an
 * effect, a cascading render, and something the lint rules reject outright.
 * This hook is what the API exists for: one snapshot function, one subscribe.
 */
export function useDockFits(): boolean {
  return useSyncExternalStore(subscribe, readFits, () => true);
}
