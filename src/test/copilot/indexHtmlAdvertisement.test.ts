import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_PANEL_ATTR,
  dashboardAdvertisesPanel,
} from '../../copilot/advertisement';

/**
 * The advertisement attribute has to be in the INITIAL HTML.
 *
 * The extension's content script reads it at `document_start`, before this
 * app's module has been fetched, let alone evaluated. A component test can
 * never see that: it renders into a jsdom document the harness created. So this
 * one reads `index.html` — the file Vite serves, and the one it copies into
 * `dist/` with nothing but its script and link tags rewritten.
 *
 * The parse is deliberate too. `expect(html).toContain('data-...')` would pass
 * on the attribute appearing in a comment, on the wrong element, or set to
 * `"false"`; the point of the contract's three falsy values is that a build
 * without the panel ships the same markup with the flag off, so a substring
 * check is exactly the check that cannot tell the two builds apart.
 */
const html = (
  await import('../../../index.html?raw')
).default as unknown as string;

/** Parse the served markup the way a browser would. */
function documentFrom(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'text/html');
}

describe('index.html carries the attribute with the flag DOWN', () => {
  it('is present on <html>, and deliberately does not advertise', () => {
    /**
     * FLIPPED, and the reversal is the point of the test.
     *
     * An extension predating faultmaven-copilot#257 yields on THIS ATTRIBUTE at
     * document_end and cannot hear the withdrawal that would release it — so it
     * hides its side panel on a Dashboard that may then show none, leaving the
     * tab with neither surface. Measured against the pre-#257 build in a real
     * browser, and version-gating the live message alone did NOT close it: the
     * attribute is an independent path to the same yield.
     *
     * The attribute stays in the markup rather than being deleted, because the
     * contract's three falsy values exist precisely so a build can ship this
     * same HTML with the flag down — and flipping one character back is how
     * this migration ends.
     */
    const doc = documentFrom(html);

    expect(doc.documentElement.hasAttribute(DASHBOARD_PANEL_ATTR)).toBe(true);
    expect(dashboardAdvertisesPanel(doc)).toBe(false);
  });

  it('WOULD advertise if the flag were flipped on', () => {
    // This test's own failure state. Without it the assertion above could be
    // passing on a predicate that returns false for anything — including a
    // build that had lost the attribute or misspelled it.
    const doc = documentFrom(html);
    doc.documentElement.setAttribute(DASHBOARD_PANEL_ATTR, '1');

    expect(dashboardAdvertisesPanel(doc)).toBe(true);
  });

  it('puts it on <html>, not on <body> or a <meta>', () => {
    // The contract names `<html>`. A content script at document_start may have
    // no <body> yet, so an attribute anywhere else is unreadable at the moment
    // it is needed.
    const doc = documentFrom(html);

    expect(doc.body.hasAttribute(DASHBOARD_PANEL_ATTR)).toBe(false);
    expect(doc.querySelectorAll(`[${DASHBOARD_PANEL_ATTR}]`)).toHaveLength(1);
    expect(doc.querySelector(`[${DASHBOARD_PANEL_ATTR}]`)).toBe(doc.documentElement);
  });
});
