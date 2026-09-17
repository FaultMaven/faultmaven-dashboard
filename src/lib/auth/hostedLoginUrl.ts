import type { operations } from '../../types/api.generated';

/**
 * The screens the hosted login will open on, taken from the contract.
 *
 * NOT a hand-written `'sign-in' | 'sign-up'`. The contract entry for 6.1.0 is
 * explicit that "because the parameter is published, the closed set *is* the
 * contract" — so a copy here is a second source of truth that can fall behind
 * silently. If the backend narrowed or renamed a member, a literal union would
 * still compile, the redirect would still fire, the IdP would drop the
 * unrecognised hint, and the visitor would land on the sign-in screen after
 * the app announced "Taking you to sign-up…" — website#42's original defect,
 * reintroduced by the very type meant to prevent it.
 */
export type ScreenHint = NonNullable<
  NonNullable<
    operations['sso_login_api_v1_auth_sso_login_get']['parameters']['query']
  >['screen_hint']
>;

export interface HostedLoginParams {
  /** Same-origin dashboard path to come back to. Callers pass it unencoded. */
  returnTo?: string | null;
  /** Which screen the hosted login opens on (core contract 6.1.0). */
  screenHint?: ScreenHint | null;
}

/**
 * The single writer for hosted-login handoff URLs.
 *
 * Two surfaces hand off to the IdP and each needs to add something: LoginPage
 * appends `return_to`, SignUpPage appends `screen_hint`. Both previously
 * hand-rolled `url.includes('?') ? '&' : '?'`, which is two copies of one rule
 * and wrong in the same way — a `loginUrl` carrying a fragment would get the
 * parameter appended *after* the `#`, putting it inside the fragment where it
 * is never sent to the server.
 *
 * `loginUrl` is whatever `/auth/config` advertises, so its shape is the
 * backend's to change, not ours to assume.
 */
export function buildHostedLoginUrl(
  loginUrl: string,
  { returnTo, screenHint }: HostedLoginParams = {}
): string {
  // Relative bases are tolerated because `loginUrl` is backend-advertised and
  // a deployment may serve the API same-origin; `URL` needs an absolute base
  // to parse one, and `window.location.origin` is the correct one there.
  const base =
    typeof window !== 'undefined' && window.location ? window.location.origin : undefined;
  let url: URL;
  try {
    url = new URL(loginUrl, base);
  } catch {
    // An unparseable advertised URL is the backend's problem, not something to
    // paper over by concatenating onto it. Hand it back untouched so the
    // caller's navigation fails visibly rather than somewhere stranger.
    return loginUrl;
  }

  if (returnTo) url.searchParams.set('return_to', returnTo);
  if (screenHint) url.searchParams.set('screen_hint', screenHint);
  return url.toString();
}
