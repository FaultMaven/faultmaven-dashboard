import { describe, it, expect } from 'vitest';
import { ERROR_MESSAGES, GENERIC_ERROR, ssoErrorMessage } from './ssoErrors';

/**
 * Set equality against the backend is NOT asserted here — it cannot be. This
 * repo cannot import the backend's Python, and the slugs are absent from
 * openapi.json (they ride a 302 as query params), so a literal list here would
 * only ever restate this file's own contents. That is precisely the check that
 * was missing when faultmaven#869 added a sixth slug.
 *
 * `scripts/check-sso-error-slugs.mjs` owns it, reading the `ERROR_*` constants
 * off faultmaven `main` in the `sso-slug-drift` CI job. These tests cover what
 * is knowable offline: that each slug's copy says the right kind of thing, and
 * that lookup is safe for arbitrary query content.
 */
const SLUGS = Object.keys(ERROR_MESSAGES);

describe('SSO error slug contract', () => {
  it('gives every slug except sso_failed copy distinct from the generic fallback', () => {
    // Asserting "a message exists" would be vacuous — ssoErrorMessage() always
    // returns one. Distinctness from GENERIC_ERROR is what being absent from
    // the map actually costs, so that is what is asserted. sso_failed is the
    // sole legitimate alias for the generic text.
    for (const slug of SLUGS.filter((s) => s !== 'sso_failed')) {
      expect(ssoErrorMessage(slug), `${slug} falls through to the generic message`).not.toBe(
        GENERIC_ERROR
      );
    }
    expect(ssoErrorMessage('sso_failed')).toBe(GENERIC_ERROR);
  });

  it('tells the operator-fixable failure apart from the retryable ones', () => {
    // faultmaven-dashboard#79: sso_org_unmapped fires when the identity carried
    // no organization, or one with no sso_org_mappings row. It cannot be fixed
    // by the user and stays broken until an operator provisions the mapping, so
    // the copy must not invite a retry the way the transient failures do.
    const orgUnmapped = ssoErrorMessage('sso_org_unmapped');

    expect(orgUnmapped).not.toMatch(/try again/i);
    expect(orgUnmapped).toMatch(/contact your administrator/i);

    // The genuinely transient failures still say so — this test would otherwise
    // pass just as well if every message dropped the retry wording.
    expect(ssoErrorMessage('sso_state_invalid')).toMatch(/try again/i);
    expect(ssoErrorMessage('sso_exchange_failed')).toMatch(/try again/i);
  });

  it('falls back to the generic message for anything unrecognised', () => {
    expect(ssoErrorMessage('sso_not_a_real_slug')).toBe(GENERIC_ERROR);
    expect(ssoErrorMessage('<script>alert(1)</script>')).toBe(GENERIC_ERROR);
    expect(ssoErrorMessage('')).toBe(GENERIC_ERROR);
  });

  it('falls back for inherited property names rather than leaking a prototype member', () => {
    // The slug is attacker-controlled query content and a plain index walks the
    // prototype chain, where every hit is non-null and so survives `??`.
    // Rendering consequences, both observed: a function child renders as
    // nothing (empty error box), and an object child throws "Objects are not
    // valid as a React child", swapping the sign-in error for the ErrorBoundary.
    for (const name of [
      '__proto__',
      'toString',
      'constructor',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ]) {
      const message = ssoErrorMessage(name);
      expect(message, `${name} leaked a prototype member`).toBe(GENERIC_ERROR);
      // Belt and braces: whatever comes back must be renderable text.
      expect(typeof message).toBe('string');
    }
  });

  it('exposes only sso_-prefixed slugs', () => {
    // Cheap shape guard: the backend namespaces every slug it emits, so a key
    // without the prefix is a typo or a stray entry the drift gate would flag
    // as unmatched anyway.
    for (const slug of SLUGS) {
      expect(slug).toMatch(/^sso_[a-z0-9_]+$/);
    }
    expect(SLUGS.length).toBeGreaterThan(0);
  });
});
