import { describe, it, expect } from 'vitest';
import { ERROR_MESSAGES, GENERIC_ERROR, ssoErrorMessage } from './ssoErrors';

/**
 * The slug set the backend's `_dashboard_redirect()` can emit — the `ERROR_*`
 * constants in `sso_login_service.py`, which is the single writer of `?error=`.
 *
 * Kept as a literal on purpose: this repo cannot import the backend's Python,
 * and the slugs are absent from `openapi.json` (they ride a 302 as query
 * params), so there is no generated artifact to derive them from.
 */
const BACKEND_SLUGS = [
  'sso_state_invalid',
  'sso_exchange_failed',
  'sso_user_inactive',
  'sso_access_denied',
  'sso_org_unmapped',
  'sso_failed',
];

describe('SSO error slug contract', () => {
  it('handles exactly the slug set the backend can emit', () => {
    // An entry removed or renamed fails here rather than quietly degrading to
    // the generic message at runtime.
    //
    // Honest about the limit: this fails when THIS map changes, not when the
    // backend adds a slug — nothing in this repo can observe that. It makes the
    // coupling explicit at the point of edit, which is where faultmaven#869
    // slipped through.
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...BACKEND_SLUGS].sort());
  });

  it('gives every slug except sso_failed copy distinct from the generic fallback', () => {
    // Asserting "a message exists" would be vacuous — ssoErrorMessage() always
    // returns one. Distinctness from GENERIC_ERROR is what being absent from
    // the map actually costs, so that is what is asserted. sso_failed is the
    // sole legitimate alias for the generic text.
    for (const slug of BACKEND_SLUGS.filter((s) => s !== 'sso_failed')) {
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
});
