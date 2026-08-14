/**
 * Sanitized SSO error slugs and their user-facing copy.
 *
 * The producer is `_dashboard_redirect()` in the backend's
 * `sso_login_service.py` — the single writer of the `?error=` param on the 302
 * that lands on /auth/sso/callback. Its `ERROR_*` constants are the whole
 * domain; anything else is treated as unknown and renders GENERIC_ERROR. Raw
 * query content is never echoed into the page.
 *
 * This pairing is a hand-maintained cross-repo contract. The slugs travel as
 * query params on a redirect, so they appear nowhere in `openapi.json` and the
 * `api-types-drift` gate cannot see them: a backend-side addition cannot turn
 * this repo red. That is exactly how `sso_org_unmapped` was missed — it was
 * added by faultmaven#869 six days after this flow shipped, and every affected
 * user was told to "try again" until faultmaven-dashboard#79.
 *
 * Adding a slug on the backend means adding it here. `ssoErrors.test.ts` pins
 * the set so the change is at least deliberate on this side.
 */

/** Shown for any slug not in ERROR_MESSAGES, and when the URL carries neither `code` nor `error`. */
export const GENERIC_ERROR = 'Sign-in failed. Please try again.';

export const ERROR_MESSAGES: Record<string, string> = {
  sso_access_denied: 'Sign-in was cancelled or denied at the identity provider.',
  sso_user_inactive: 'Your account is not active. Please contact your administrator.',
  sso_state_invalid: 'This sign-in attempt expired or was invalid. Please try again.',
  sso_exchange_failed: 'Sign-in could not be completed. Please try again.',
  // Multi-tenant only: the IdP reported no organization, or one this deployment
  // has no mapping for. Deliberately NOT a "try again" message — retrying is
  // guaranteed to fail identically until an operator provisions the mapping,
  // and this is the one SSO failure they can actually fix. Says only that this
  // deployment does not recognise the organization, matching what the backend
  // guarantees the slug leaks.
  sso_org_unmapped:
    'Your organization is not set up for access yet. Please contact your administrator.',
  sso_failed: GENERIC_ERROR,
};

/** Resolve a slug from the callback URL to copy, falling back to the generic message. */
export function ssoErrorMessage(slug: string): string {
  return ERROR_MESSAGES[slug] ?? GENERIC_ERROR;
}
