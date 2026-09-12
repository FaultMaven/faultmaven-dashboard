import { authLocalStore } from '../storage';

/**
 * "Use the Copilot extension for chat" — where this person wants to type
 * (ADR-018 D3, sequencing row 6).
 *
 * WHAT IT GOVERNS: the interactive surfaces only. The dock on case detail, the
 * full-page `New Case` surface and its nav item, and the D0 advertisement that
 * moves the extension's side panel out of the way. It never governs the ability
 * to READ a case's conversation — that is record content and is always present,
 * which is the invariant an earlier draft of the ADR broke.
 *
 * NOT BY DETECTING THE EXTENSION. The Dashboard can tell the extension is
 * installed; it cannot tell whether the side panel is OPEN. Standing down on
 * detection would strand an installed-but-closed user with no chat surface at
 * all. A preference cannot strand anyone, because the person who set it is the
 * person who turned it off, and the account menu keeps a one-click way back.
 * Detection may OFFER this at the right moment; it must never apply it.
 *
 * PER BROWSER PROFILE, not per account. It answers "which surface do I want
 * chat in ON THIS MACHINE", and the thing it selects between is itself
 * per-profile — an extension is installed in a browser, not in an account. A
 * server-side preference would follow someone to a machine where the extension
 * does not exist and silently remove their only chat surface. The cost is that
 * support cannot read it: "my chat disappeared" is diagnosed by asking.
 *
 * DEFAULTS OFF, and the default is load-bearing. Off means the Dashboard hosts
 * chat, which is the only correct answer for someone who has never installed
 * anything — and for the population that can never have a side panel at all
 * (Firefox, managed browsers, self-hosted). An absent key, a blocked
 * `localStorage`, or a value of the wrong type all mean off; only an explicit
 * `true` moves chat to the extension.
 */
const KEY = 'prefersCopilotExtensionForChat';

/**
 * A module-level store, not React state.
 *
 * Two callers are outside any component tree — `resolvePostSignInLanding()`
 * runs during sign-in, before the app shell exists — and the ones inside it are
 * scattered across the nav, the case page and the account menu. A context
 * provider would reach the second group and not the first, so the preference
 * would have two readers that could disagree about the same browser.
 *
 * `useSyncExternalStore` over this gives every component the same value and an
 * immediate update when the toggle flips, with no provider to install.
 */
let cached: boolean | undefined;
const listeners = new Set<() => void>();

export function prefersExtensionForChat(): boolean {
  if (cached === undefined) cached = authLocalStore.read(KEY).value === true;
  return cached;
}

export function setPrefersExtensionForChat(next: boolean): void {
  authLocalStore.write(KEY, next);
  cached = next;
  for (const notify of listeners) notify();
}

export function subscribeToChatSurface(onChange: () => void): () => void {
  listeners.add(onChange);
  ensureCrossTabListener();
  return () => listeners.delete(onChange);
}

/**
 * ACROSS TABS, because "per browser profile" has to mean it.
 *
 * Without this the preference was per TAB, as of page load. Turn it on in one
 * Dashboard tab and the others keep rendering the dock, keep the `New Case`
 * item, and — because their panel is still visible — keep asserting, so the
 * extension's side panel stays yielded on them. The user who just asked for
 * chat in the extension would have the Dashboard's panel and no side panel
 * there.
 *
 * `storage` fires only in OTHER tabs, which is exactly the gap: this tab's own
 * writes already notify through `setPrefersExtensionForChat`. Installed once
 * and never removed — it is page-scoped, like the preference itself.
 */
let crossTabInstalled = false;

function ensureCrossTabListener(): void {
  if (crossTabInstalled || typeof window === 'undefined') return;
  crossTabInstalled = true;
  window.addEventListener('storage', (event) => {
    // Only our key, and only when it actually changed. `event.key === null` is
    // a `localStorage.clear()` elsewhere, which must also be honoured.
    if (event.key !== null && event.key !== authLocalStore.physicalKey(KEY)) return;
    cached = undefined;
    for (const notify of listeners) notify();
  });
}

/** Drop the memo. Tests swap `localStorage` between cases. */
export function resetChatSurfaceForTests(): void {
  cached = undefined;
}
