import { useEffect, useSyncExternalStore } from 'react';
import { announcePanelAvailable, withdrawPanelAvailability } from './advertisement';
import {
  subscribeToCopilotPresence,
  installedCopilotMarker,
  NO_COPILOT_MARKER,
  copilotAcceptsWithdrawal,
} from './copilotCapability';

/**
 * What this host can say about its panel right now.
 *
 * Three states, not two, because "not showing" and "do not know yet" have
 * opposite correct actions: one is a retraction, the other is silence.
 */
export type PanelVisibility = 'showing' | 'hidden' | 'pending';

/**
 * Keep the extension told whether a built-in panel is SHOWING on this tab
 * (ADR-018 D0, sequencing row 5).
 *
 * The claim is live, per tab, per user, per route — not a property of the
 * build. `DASHBOARD_PANEL_ATTR` in the initial HTML cannot express any of that:
 * it is written before React runs, before there is a user, and one SPA document
 * serves `/login` and `/cases`. So the attribute stays as a build-capability
 * claim that yields nothing, and this hook is what actually moves the
 * extension's side panel out of the way and back again.
 *
 * SHOWING means visible, not merely mounted. The dock keeps its panel mounted
 * while collapsed so an in-flight turn survives, and the live Transcript arm
 * stays mounted behind another tab for the same reason — but in both of those
 * states the user is looking at no conversation here, so the extension's panel
 * should come back. Each host passes what it knows; nothing is inferred.
 *
 * WHY `pageshow` AND NOT JUST MOUNT. The extension releases a tab whose document
 * is being replaced, and `tabs.onUpdated` reports `status: 'loading'` for things
 * that create no new document — a back/forward bfcache restore, an aborted
 * navigation, a link that turns into a download. In those cases React does not
 * re-run and nothing would re-assert, so the tab would be released and never
 * yield again for the life of that document. The package's own contract records
 * this as an obligation on the page, because the extension cannot ask a page
 * what it is currently showing.
 */
export function usePanelAdvertisement(showing: PanelVisibility): void {
  // One subscription, two readings of it: the marker drives WHEN the effect
  // re-runs, and the derived boolean drives WHAT it does. Deriving the boolean
  // from the same render's DOM keeps them consistent — the marker only changes
  // because that DOM changed.
  const marker = useInstalledCopilotMarker();
  const acceptsWithdrawal = copilotAcceptsWithdrawal();

  useEffect(() => {
    // NEVER ASSERT TO AN EXTENSION THAT COULD NOT TAKE IT BACK. Asserting makes
    // any extension yield; only one carrying faultmaven-copilot#257 can hear
    // the retraction. Creating that state for an older install is what leaves a
    // tab with neither surface — so the Dashboard declines to create it, and
    // that install keeps exactly the behaviour it has today.
    //
    // The WITHDRAWAL still goes out unconditionally. It is a no-op for an
    // extension that cannot hear it, and the one thing worse than a redundant
    // withdrawal is a missing one.
    // PENDING SAYS NOTHING. A mount that is still fetching its chunk is not a
    // panel that has gone away, and treating it as one made every single mount
    // post a withdrawal before it ever asserted — releasing the extension's
    // side panel for the whole load and re-yielding a few hundred milliseconds
    // later. That flash happened on every page load, every `key`ed remount,
    // every first open of the dock and every breakpoint crossing. Silence is
    // the only honest answer while the answer is not yet known.
    if (showing === 'pending') return;

    if (showing === 'hidden' || !acceptsWithdrawal) {
      // Also fires on the transition from showing to hidden, which is the
      // collapse and tab-switch case — not only on unmount.
      withdrawPanelAvailability();
      return;
    }

    announcePanelAvailable();

    // A bfcache restore does not re-run effects, so re-assert from the event
    // the browser does fire.
    //
    // UNCONDITIONALLY, not gated on `event.persisted`. Only a restore strictly
    // needs it — an ordinary load has already asserted at mount — but the yield
    // is idempotent, so the duplicate costs one message and nothing else, while
    // the gate costs a dependency on a property that is absent in some
    // environments (happy-dom drops it entirely, older browsers vary). Trading a
    // free duplicate for a silent failure to re-assert is the wrong way round:
    // the tab would stay released with the extension's panel beside the
    // Dashboard's own for the life of that document.
    const onPageShow = () => announcePanelAvailable();
    window.addEventListener('pageshow', onPageShow);

    return () => {
      window.removeEventListener('pageshow', onPageShow);
      // Unmounting IS the panel going away. A document being replaced needs
      // nothing from us — the extension releases that tab itself — but this
      // also covers a route change inside the SPA, where it does not.
      withdrawPanelAvailability();
    };
    // MARKER IN THE DEPS, not just the derived boolean. `acceptsWithdrawal` is
    // `true` both when nothing is installed and when a build that CAN withdraw
    // is — so a capable extension arriving mid-session does not change it, the
    // effect never re-runs, and the assertion it was not around to hear is
    // never re-posted. It has no other way to learn: the static attribute path
    // is inert since ADR-018 D0 row 7 and `index.html` ships the flag down, and
    // the contract has no "ask again" message. That left the tab with two chat
    // panels until navigation — #144 from the other end.
  }, [showing, acceptsWithdrawal, marker]);
}

/**
 * What the installed extension is advertising, re-read whenever it changes.
 *
 * The extension's auth bridge stamps its version at document_end, and this hook
 * can run before that: the panel mounts after React hydrates, which is usually
 * later, but "usually" is not a guarantee and the failure is silent. Reading
 * once at mount would then see no extension, assert, and hand a yield to an
 * install that cannot release it — the exact state this gate exists to prevent.
 *
 * `useSyncExternalStore`, matching `useDockFits` and `usePrefersExtensionForChat`:
 * the value lives outside React (in a DOM attribute another world writes), it
 * can change between the first render and the moment a subscription attaches,
 * and the alternative is a synchronous `setState` inside an effect. React
 * re-reads the snapshot after subscribing, which closes that gap without a
 * timer; `subscribeToCopilotPresence` closes every later one by observing the
 * attribute rather than waiting a fixed 800ms for it.
 *
 * The SNAPSHOT IS THE MARKER, not the yes/no answer, so that every change in
 * what is advertised reaches the effect — see `installedCopilotMarker`.
 */
function useInstalledCopilotMarker(): string {
  return useSyncExternalStore(
    subscribeToCopilotPresence,
    installedCopilotMarker,
    // Server snapshot: never rendered on a server, but the API wants an answer.
    // Nothing advertised is what a server would see, and it is the case that
    // permits the assertion — nobody is listening to be stranded by it.
    () => NO_COPILOT_MARKER,
  );
}
