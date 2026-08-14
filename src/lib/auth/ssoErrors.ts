/**
 * Sanitized SSO error slugs and their user-facing copy.
 *
 * The producer is `_dashboard_redirect()` in the backend's
 * `sso_login_service.py` — the single writer of the `?error=` param on the 302
 * that lands on /auth/sso/callback. Its `ERROR_*` constants are the whole
 * domain; anything else is treated as unknown and renders GENERIC_ERROR. Raw
 * query content is never echoed into the page.
 *
 * The slugs travel as query params on a redirect, so they appear nowhere in
 * `openapi.json` and `api-types-drift` cannot see them. That blind spot is how
 * `sso_org_unmapped` was missed — faultmaven#869 added it six days after this
 * flow shipped, and every affected user was told to "try again" until
 * faultmaven-dashboard#79.
 *
 * The `sso-slug-drift` CI job closes it: `scripts/check-sso-error-slugs.mjs`
 * reads the `ERROR_*` constants from `sso_login_service.py` on faultmaven `main`
 * and fails if this map's keys differ. Adding a slug on the backend therefore
 * turns this repo red until it is handled here — deliberately unpinned, exactly
 * as `api-types-drift` resolves the spec from `main` rather than a pinned ref.
 * Run it locally against a checkout with:
 *
 *   pnpm check:sso-slugs --source ../faultmaven
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

/**
 * Resolve a slug from the callback URL to copy, falling back to the generic
 * message for anything unrecognised.
 *
 * `Object.hasOwn`, not `ERROR_MESSAGES[slug] ?? GENERIC_ERROR`: the slug is
 * attacker-controlled query content, and a plain index walks the prototype
 * chain. `?error=toString` would resolve to a function — non-null, so `??`
 * never fires — and React renders a function child as nothing, leaving an empty
 * error box. `?error=__proto__` resolves to an object and throws "Objects are
 * not valid as a React child" mid-render, replacing the sign-in error screen
 * with the app's ErrorBoundary. Own-property lookup is the whole fix.
 *
 * Spelled `Object.prototype.hasOwnProperty.call` rather than `Object.hasOwn`:
 * this project targets ES2020, and `Object.hasOwn` is ES2022. Widening the
 * whole project's lib for one call would let unrelated code reach for APIs the
 * build target does not promise.
 */
export function ssoErrorMessage(slug: string): string {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, slug)
    ? ERROR_MESSAGES[slug]
    : GENERIC_ERROR;
}
