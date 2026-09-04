/**
 * Where a sign-in lands when nothing else asked for a destination.
 *
 * `/cases`, not `/kb`. Two reasons, and the second is the load-bearing one:
 *
 *  - The Dashboard is the product's primary interactive surface now
 *    (ADR-016 D1), not a knowledge-base manager with a case list attached.
 *    `/` has redirected to `/cases` for a while; sign-in was the last place
 *    still disagreeing with it.
 *  - `/cases` is where the zero-case rule lives. A person with no cases is sent
 *    on to the built-in panel with a new investigation open (D6), and routing
 *    sign-in through that gate is what makes the rule apply to the moment it
 *    was written for. Hard-coding `/kb` bypassed it: the one user the rule
 *    exists for — a brand-new account with nothing in it — landed on an empty
 *    knowledge base instead, which a real-browser smoke caught and no unit test
 *    could, because both sign-in pages simply navigated somewhere else.
 *
 * Named once so the two sign-in paths (standalone `LoginPage`, cloud
 * `SSOCallbackPage`) cannot drift, which is how one of them came to be fixed
 * without the other in the first place.
 */
export const POST_SIGN_IN_LANDING = '/cases';
