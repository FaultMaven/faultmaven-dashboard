import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DASHBOARD_PANEL_ATTR,
  DASHBOARD_PANEL_MESSAGE,
  announcePanelAvailable,
  dashboardAdvertisesPanel,
} from '../../copilot/advertisement';

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
 * There is no local copy left to keep honest: the names and the predicate are
 * imported from `@faultmaven/copilot-ui/contract`, a dependency-free module
 * that exists so a host can have them without pulling the package's graph into
 * its entry chunk. A parity test comparing the import against itself would
 * assert nothing, so it is gone.
 *
 * What still earns its place is everything the import CANNOT give: that those
 * values are the ones faultmaven-copilot#231 settled on (typed out again below,
 * because a constant compared with itself proves nothing), that the predicate
 * treats the three falsy values as the contract says, and that this host
 * announces at the right moment and to the right origin — the one part of the
 * contract that is genuinely the host's.
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
