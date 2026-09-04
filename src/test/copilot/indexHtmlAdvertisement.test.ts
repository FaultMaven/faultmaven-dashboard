import { describe, it, expect } from 'vitest';
import {
  PANEL_ADVERTISEMENT_ATTRIBUTE,
  advertisesBuiltInPanel,
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

describe('index.html advertises the built-in panel', () => {
  it('carries the attribute on <html>, with a value that advertises', () => {
    const doc = documentFrom(html);

    expect(doc.documentElement.hasAttribute(PANEL_ADVERTISEMENT_ATTRIBUTE)).toBe(true);
    expect(advertisesBuiltInPanel(doc)).toBe(true);
  });

  it('would NOT advertise if the flag were flipped off', () => {
    // The gate's own failure state, run against the real file: take the served
    // markup, set the flag to each value the contract says does not advertise,
    // and confirm the same predicate answers no. Without this, the assertion
    // above could be passing on a predicate that returns true for anything.
    for (const off of ['', 'false', '0']) {
      const doc = documentFrom(html);
      doc.documentElement.setAttribute(PANEL_ADVERTISEMENT_ATTRIBUTE, off);
      expect(advertisesBuiltInPanel(doc), `value ${JSON.stringify(off)}`).toBe(false);
    }
  });

  it('puts it on <html>, not on <body> or a <meta>', () => {
    // The contract names `<html>`. A content script at document_start may have
    // no <body> yet, so an attribute anywhere else is unreadable at the moment
    // it is needed.
    const doc = documentFrom(html);

    expect(doc.body.hasAttribute(PANEL_ADVERTISEMENT_ATTRIBUTE)).toBe(false);
    expect(doc.querySelectorAll(`[${PANEL_ADVERTISEMENT_ATTRIBUTE}]`)).toHaveLength(1);
    expect(doc.querySelector(`[${PANEL_ADVERTISEMENT_ATTRIBUTE}]`)).toBe(doc.documentElement);
  });
});
