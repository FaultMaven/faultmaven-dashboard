import { useEffect } from 'react';
import { announcePanelAvailable, withdrawPanelAvailability } from './advertisement';

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
  useEffect(() => {
    if (!showing) {
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
  }, [showing]);
}
