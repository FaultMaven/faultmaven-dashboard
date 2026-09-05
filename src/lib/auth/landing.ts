import { listCases } from '../cases/api';

/**
 * Where a sign-in lands when nothing else asked for a destination.
 *
 * `/cases`, not `/kb`. The Dashboard is the product's primary interactive
 * surface now (ADR-016 D1), not a knowledge-base manager with a case list
 * attached; `/` has redirected to `/cases` for a while, and sign-in was the
 * last place still disagreeing with it.
 */
export const POST_SIGN_IN_LANDING = '/cases';

/** Where a person with no cases at all is sent instead (ADR-016 D6). */
export const FIRST_RUN_LANDING = '/investigate';

/**
 * Decide the post-sign-in destination ONCE, here, at the moment of signing in.
 *
 * ADR-016 D6 says a person with no cases lands on the panel with a new
 * investigation rather than an empty list. That rule first lived inside
 * `CaseListPage` as a redirect keyed on the rendered page, which made it a
 * property of a ROUTE rather than of the sign-in — and a route cannot tell the
 * two situations apart:
 *
 *  - `/cases` became unreachable for such a person from every entry point, so
 *    the nav item led nowhere;
 *  - an empty page PAST THE END, or a filter someone had just cleared, looks
 *    identical to "no cases" if you judge by the rows in hand, and bounced a
 *    user who has plenty.
 *
 * Asking the server for a count is the question actually being asked, it is
 * asked once, and `/cases` goes back to being an ordinary page with an empty
 * state.
 *
 * Fails to `/cases`. A count this cannot obtain is not evidence of an empty
 * account, and sending someone to a new investigation on a failed request
 * would hide their cases from them.
 */
export async function resolvePostSignInLanding(): Promise<string> {
  try {
    // `pageSize: 1` — the rows are not wanted, only the total.
    const { total_count } = await listCases({}, 0, 1);
    return total_count === 0 ? FIRST_RUN_LANDING : POST_SIGN_IN_LANDING;
  } catch {
    return POST_SIGN_IN_LANDING;
  }
}
