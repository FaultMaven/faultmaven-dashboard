import { useSyncExternalStore } from 'react';
import {
  prefersExtensionForChat,
  subscribeToChatSurface,
} from '../lib/copilot/chatSurfacePreference';

/**
 * Does this browser profile want chat in the Copilot extension? (ADR-018 D3.)
 *
 * `useSyncExternalStore` rather than state plus an effect: the value lives in a
 * module because a caller outside React needs it too (`resolvePostSignInLanding`
 * runs during sign-in), and every component must see the same answer the moment
 * the account-menu toggle flips — the nav item, the dock and the case page all
 * change together or the page contradicts itself.
 */
export function usePrefersExtensionForChat(): boolean {
  return useSyncExternalStore(
    subscribeToChatSurface,
    prefersExtensionForChat,
    // Server snapshot: this app never renders on a server, but the API requires
    // an answer and OFF is the one that keeps a chat surface on the page.
    () => false,
  );
}
