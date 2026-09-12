import { useEffect, useSyncExternalStore } from 'react';
import { announcePanelAvailable, withdrawPanelAvailability } from './advertisement';
import { COPILOT_READY_EVENT, copilotAcceptsWithdrawal } from './copilotCapability';

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
export function usePanelAdvertisement(showing: boolean): void {
  const acceptsWithdrawal = useInstalledCopilotAcceptsWithdrawal();

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
    if (!showing || !acceptsWithdrawal) {
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
  }, [showing, acceptsWithdrawal]);
}

/**
 * Whether the installed extension can take an assertion back — re-read when one
 * announces itself.
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
 * and the alternative is a synchronous `setState` inside an effect. Absent the
 * extension's ready event nothing ever changes, which is the correct no-op for
 * a page with no extension on it.
 */
function subscribeToCopilotPresence(onChange: () => void): () => void {
  window.addEventListener(COPILOT_READY_EVENT, onChange);
  return () => window.removeEventListener(COPILOT_READY_EVENT, onChange);
}

function useInstalledCopilotAcceptsWithdrawal(): boolean {
  return useSyncExternalStore(
    subscribeToCopilotPresence,
    copilotAcceptsWithdrawal,
    // Server snapshot: never rendered on a server, but the API wants an answer.
    // TRUE matches the no-extension case, which is what a server would see.
    () => true,
  );
}
