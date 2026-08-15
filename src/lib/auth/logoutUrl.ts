/**
 * Validation for the identity provider's logout URL.
 *
 * Lives in its own module because two callers need it and they cannot import
 * each other: `functions.logoutAuth` (the explicit Log out click) and
 * `AuthManager` (an involuntary sign-out, where the session ended on its own).
 */

/**
 * Accept only an absolute https: URL as a logout destination.
 *
 * The value is read back out of localStorage, which is not a trust boundary:
 * anything with same-origin write access can replace it, and `location.assign`
 * would then execute the sign-out as an arbitrary navigation — a `javascript:`
 * URL, or a look-alike sign-in page harvesting credentials from a user who just
 * deliberately signed out.
 *
 * `https:` only, and parsed rather than pattern-matched, so scheme-confusion
 * tricks (`java\nscript:`, a `data:` payload dressed up as https) do not slip
 * through. The real value is always an absolute provider https URL, so nothing
 * legitimate is refused; a rejected one degrades to local-only sign-out.
 */
export function isSafeLogoutUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error('Ignoring unparseable IdP logout URL; signing out locally only');
    return false;
  }
  if (parsed.protocol !== 'https:') {
    console.error(`Ignoring non-https IdP logout URL (${parsed.protocol})`);
    return false;
  }
  return true;
}
