/**
 * The Copilot extension's published Chrome Web Store listing, in one place.
 *
 * Two surfaces need it and they must not drift: the header entry point
 * (`CopilotEntry`), and the built-in panel's page-capture affordance, which is
 * the one moment the product asks anyone to install anything (ADR-016 D2).
 *
 * The trailing segment is the extension ID assigned at publish; a
 * `/detail/<slug>` URL without it does not address the listing, so keep the ID
 * when editing this (faultmaven-dashboard#119).
 */
export const COPILOT_STORE_URL =
  'https://chromewebstore.google.com/detail/faultmaven-copilot/fghoagggojmkdopidfopijfnlmchjcng';

/**
 * What the panel says when someone asks it to read the current page.
 *
 * ADR-016 D2: the affordance stays VISIBLE in the web host and explains
 * itself; it is never silently hidden. A web page cannot read another tab, and
 * saying so at the moment it is asked is what makes the install prompt
 * justified rather than a banner.
 */
export const PAGE_CAPTURE_UNSUPPORTED_REASON =
  'Reading the page you are looking at needs the FaultMaven Copilot extension — ' +
  'a web page cannot see another tab. Everything else here works without it.';
