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
export interface HostedLoginParams {
  /** Same-origin dashboard path to come back to. Callers pass it unencoded. */
  returnTo?: string | null;
  /** Which screen the hosted login opens on (core contract 6.1.0). */
  screenHint?: 'sign-in' | 'sign-up' | null;
}

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
