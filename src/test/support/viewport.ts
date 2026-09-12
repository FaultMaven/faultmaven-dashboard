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
}
