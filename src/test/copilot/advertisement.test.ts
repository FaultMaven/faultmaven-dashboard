import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DASHBOARD_PANEL_ATTR,
  DASHBOARD_PANEL_MESSAGE,
  announcePanelAvailable,
  dashboardAdvertisesPanel,
} from '../../copilot/advertisement';
// The real package, at module scope: a dynamic import inside a test pays the
// whole package's transform cost against that test's timeout, which is a
// flaky-under-load failure with nothing to do with what is being asserted.
import {
  DASHBOARD_PANEL_ATTR as PKG_ATTR,
  DASHBOARD_PANEL_MESSAGE as PKG_MESSAGE,
  dashboardAdvertisesPanel as pkgAdvertises,
} from '@faultmaven/copilot-ui';

/**
 * The panel advertisement, as a cross-repo contract (ADR-016 D4; settled in
 * faultmaven-copilot#231).
 *
 * The extension yields its side panel only where the page advertises that it
 * hosts a built-in panel — not on origin alone, because deployments lag. This
 * suite is the page side of that contract, and it is written against the
 * literal names and the literal falsy values, because the extension implements
 * the same three and a disagreement about them is invisible: the Dashboard
 * would either hide a working panel or yield to one that is not there.
 *
 * `index.html` is checked in `indexHtmlAdvertisement.test.ts` — the attribute
 * must be in the INITIAL HTML, and no amount of component testing sees that.
 *
 * This file is where the copy is kept honest. The values are declared locally
 * (importing them would put the package in the eager graph and ship it to
 * signed-out visitors — see the note in `advertisement.ts`), so the drift a
 * shared definition would have prevented is caught HERE instead: the package is
 * imported below and the two are compared, name for name and case for case.
 * A test can import freely; the shipped bundle cannot.
 */

/** The names in the settled contract. Restated as literals ON PURPOSE. */
const CONTRACT_ATTRIBUTE = 'data-faultmaven-dashboard-panel';
const CONTRACT_MESSAGE_TYPE = 'FM_DASHBOARD_PANEL_AVAILABLE';

describe('panel advertisement — the names', () => {
  it('uses exactly the names the extension listens for', () => {
    // A constant compared against itself proves nothing, so these are typed out
    // again from faultmaven-copilot#231 rather than imported. Renaming the
    // export cannot make this pass.
    expect(DASHBOARD_PANEL_ATTR).toBe(CONTRACT_ATTRIBUTE);
    expect(DASHBOARD_PANEL_MESSAGE).toBe(CONTRACT_MESSAGE_TYPE);
  });
});

describe('panel advertisement — the attribute predicate', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(CONTRACT_ATTRIBUTE);
  });

  it('does not advertise when the attribute is absent', () => {
    expect(dashboardAdvertisesPanel(document)).toBe(false);
  });

  it.each(['', 'false', '0'])(
    'does not advertise for the falsy value %o the contract names',
    (value) => {
      document.documentElement.setAttribute(CONTRACT_ATTRIBUTE, value);
      expect(dashboardAdvertisesPanel(document)).toBe(false);
    },
  );

  it.each(['1', 'true', 'yes', '2026-09-04'])('advertises for %o', (value) => {
    document.documentElement.setAttribute(CONTRACT_ATTRIBUTE, value);
    expect(dashboardAdvertisesPanel(document)).toBe(true);
  });
});

describe('panel advertisement — the window message', () => {
  let postMessage: ReturnType<typeof vi.fn>;
  let fakeWindow: Window;

  beforeEach(() => {
    postMessage = vi.fn();
    fakeWindow = {
      postMessage,
      location: { origin: 'https://app.faultmaven.ai' },
    } as unknown as Window;
  });

  it('posts the contract message type with no payload', () => {
    announcePanelAvailable(fakeWindow);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [message] = postMessage.mock.calls[0];
    expect(message).toEqual({ type: CONTRACT_MESSAGE_TYPE });
  });

  it('targets this origin, never a wildcard', () => {
    // `'*'` would hand the claim to any frame that embeds the Dashboard. The
    // extension stamps the sender origin itself, so the page needs no secret —
    // but it must not broadcast either.
    announcePanelAvailable(fakeWindow);

    expect(postMessage).toHaveBeenCalledWith(expect.anything(), 'https://app.faultmaven.ai');
    expect(postMessage).not.toHaveBeenCalledWith(expect.anything(), '*');
  });
});


describe('the local copy agrees with the package', () => {
  it('matches the package byte for byte, so the two repositories cannot drift', () => {
    // This is the assertion that replaces sharing the module — and it fails on
    // any divergence, in either direction.
    expect(DASHBOARD_PANEL_ATTR).toBe(PKG_ATTR);
    expect(DASHBOARD_PANEL_MESSAGE).toBe(PKG_MESSAGE);
  });

  it('answers identically to the package predicate, on every contract value', () => {
    // Including the case- and whitespace-sensitive ones. A local predicate that
    // trimmed or lower-cased would advertise where the extension does not stand
    // down, which is the failure direction that leaves a user with two panels.
    const theirs = pkgAdvertises;

    for (const value of ['', 'false', '0', '1', 'true', 'FALSE', ' false ', '0 ', 'yes']) {
      document.documentElement.setAttribute(DASHBOARD_PANEL_ATTR, value);
      expect(dashboardAdvertisesPanel(document), `value ${JSON.stringify(value)}`).toBe(
        theirs(document),
      );
    }

    document.documentElement.removeAttribute(DASHBOARD_PANEL_ATTR);
    expect(dashboardAdvertisesPanel(document)).toBe(theirs(document));
  });
});
