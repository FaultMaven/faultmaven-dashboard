import { useSyncExternalStore } from 'react';
import {
  COPILOT_PRESENCE_ATTR,
  subscribeToCopilotPresence,
} from '../copilot/copilotCapability';

/**
 * Is the Copilot extension announcing itself — now, and whenever that changes.
 *
 * ONE READER, because two components now ask: `CopilotEntry` decides whether to
 * OFFER to move chat, and `AccountMenu` decides whether the toggle needs to name
 * its prerequisite. They must answer from the same signal at the same moment, or
 * the header offers to move chat to an extension the menu beside it is telling
 * the user to go and install.
 *
 * `useSyncExternalStore` over the subscription in `copilotCapability` — the
 * pattern CLAUDE.md names for state that lives outside React in a DOM attribute
 * another world writes. It replaced a hand-rolled `useState` + one-shot 800ms
 * re-check that could not see an extension which starts announcing LATER (#144):
 * a self-hosted user granting host permission from the options page and coming
 * back to the tab they already had open.
 *
 * `hasAttribute` rather than reading the version: this asks only whether
 * anything is there. What that build can DO is `copilotAcceptsWithdrawal`'s
 * question, and conflating the two is what the version floor got wrong.
 *
 * ⚠️ DETECTION IS ONE-DIRECTIONAL. `true` proves the extension is installed;
 * `false` does NOT prove it is absent. The content script registers only once
 * host permission for this origin has been granted, which is optional and
 * commonly ungranted on a self-hosted Dashboard — so a user chatting happily in
 * the side panel can read as "not installed" here. Every consumer must phrase
 * its `false` branch as something it needs, never as something the user lacks.
 */
// Module scope, not an inline arrow: `useSyncExternalStore` calls getSnapshot on
// every render and compares identities for the subscribe effect, so a fresh
// closure each render makes React re-run that effect on every render.
function copilotIsAnnouncing(): boolean {
  return (
    typeof document !== 'undefined'
    && document.documentElement.hasAttribute(COPILOT_PRESENCE_ATTR)
  );
}

export function useCopilotPresence(): boolean {
  return useSyncExternalStore(
    subscribeToCopilotPresence,
    copilotIsAnnouncing,
    // Server snapshot: never rendered on a server, but the API wants an answer.
    // FALSE is the no-extension case, which is what a server would see.
    () => false,
  );
}
