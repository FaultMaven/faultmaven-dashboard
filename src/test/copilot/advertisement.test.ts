import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PANEL_ADVERTISEMENT_ATTRIBUTE,
  PANEL_AVAILABLE_MESSAGE_TYPE,
  advertisesBuiltInPanel,
  announcePanelAvailable,
  announcePanelAvailableOnce,
  resetPanelAnnouncementForTests,
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
 */

/** The names in the settled contract. Restated as literals ON PURPOSE. */
const CONTRACT_ATTRIBUTE = 'data-faultmaven-dashboard-panel';
const CONTRACT_MESSAGE_TYPE = 'FM_DASHBOARD_PANEL_AVAILABLE';

describe('panel advertisement — the names', () => {
  it('uses exactly the names the extension listens for', () => {
    // A constant compared against itself proves nothing, so these are typed out
    // again from faultmaven-copilot#231 rather than imported. Renaming the
    // export cannot make this pass.
    expect(PANEL_ADVERTISEMENT_ATTRIBUTE).toBe(CONTRACT_ATTRIBUTE);
    expect(PANEL_AVAILABLE_MESSAGE_TYPE).toBe(CONTRACT_MESSAGE_TYPE);
  });
});

describe('panel advertisement — the attribute predicate', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(CONTRACT_ATTRIBUTE);
  });

  it('does not advertise when the attribute is absent', () => {
    expect(advertisesBuiltInPanel(document)).toBe(false);
  });

  it.each(['', 'false', '0'])(
    'does not advertise for the falsy value %o the contract names',
    (value) => {
      document.documentElement.setAttribute(CONTRACT_ATTRIBUTE, value);
      expect(advertisesBuiltInPanel(document)).toBe(false);
    },
  );

  it.each(['FALSE', ' false ', '0 '])(
    'does not advertise for %o either — case and padding are not a loophole',
    (value) => {
      // A build that flipped the flag to "False" and quietly kept advertising
      // is the failure direction this normalisation exists for.
      document.documentElement.setAttribute(CONTRACT_ATTRIBUTE, value);
      expect(advertisesBuiltInPanel(document)).toBe(false);
    },
  );

  it.each(['1', 'true', 'yes', '2026-09-04'])('advertises for %o', (value) => {
    document.documentElement.setAttribute(CONTRACT_ATTRIBUTE, value);
    expect(advertisesBuiltInPanel(document)).toBe(true);
  });
});

describe('panel advertisement — the window message', () => {
  let postMessage: ReturnType<typeof vi.fn>;
  let fakeWindow: Window;

  beforeEach(() => {
    resetPanelAnnouncementForTests();
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

  it('announces at most once per document load', () => {
    announcePanelAvailableOnce(fakeWindow);
    announcePanelAvailableOnce(fakeWindow);
    announcePanelAvailableOnce(fakeWindow);

    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
