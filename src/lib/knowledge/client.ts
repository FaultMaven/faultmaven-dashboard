// Shared API client utilities

import config from '../../config';
import { authManager, AuthenticationError } from '../auth';
import { NetworkError } from './errors';

/**
 * Make an authenticated API request
 *
 * Attaches the bearer access token. The backend derives the caller's identity
 * and roles from that verified JWT — the dashboard does NOT assert its own
 * identity via headers. (The former `X-User-ID`/`X-User-Roles` headers had zero
 * backend consumers and, being client-asserted, were a security smell.)
 *
 * @param url - API endpoint URL (relative or absolute)
 * @param options - Fetch options
 * @returns Fetch response
 * @throws {AuthenticationError} If not authenticated
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const fullUrl = url.startsWith('http') ? url : `${config.apiUrl}${url}`;

  const response = await send(fullUrl, { ...options, headers });

  // Reactive refresh: the proactive skew in getAccessToken covers the common
  // case, but a 401 can still happen (clock skew, server-side revocation). Try
  // a single silent refresh + retry before surfacing the failure.
  //
  // Pass the token that was just refused. The refresh path otherwise judges
  // staleness by the expiry clock, which still calls this token fresh — it was
  // rejected for a reason the clock cannot see — and would hand the same dead
  // token straight back for the retry to re-send.
  if (response.status === 401) {
    const newToken = await authManager.refreshTokens(token);
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      return send(fullUrl, { ...options, headers });
    }
  }

  return response;
}

/**
 * `fetch`, with a transport failure turned into something a caller can act on.
 *
 * A REJECTED fetch is not an HTTP error — there is no status, no body and no
 * `handleAPIResponse` to classify it. It surfaces as the browser's
 * `TypeError: Failed to fetch`, which every page then rendered verbatim: the
 * same six words for a backend that is down, a DNS failure, an offline laptop,
 * a TLS error and a CORS preflight the server refused. `NetworkError` existed
 * for exactly this and was never thrown (faultmaven-dashboard#133).
 *
 * The message names the thing a user can check, and the original is kept as
 * `cause` so it is still in the console for whoever needs the real reason.
 *
 * Only TRANSPORT failures are converted. An HTTP error response resolves
 * normally and stays the business of `handleAPIResponse`, which has the status
 * and the body and can say something specific — wrapping those here would throw
 * away the detail the backend went to the trouble of sending.
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    // CANCELLATION IS NOT A NETWORK FAILURE, and it is recognised by NAME
    // rather than by constructor. `controller.abort(reason)` rejects with the
    // reason verbatim — a plain Error, if the caller passed one — and
    // `AbortSignal.timeout()` rejects with `TimeoutError`, not `AbortError`.
    // An `instanceof DOMException` test misses both and reports the app's own
    // cancellation to the user as an unreachable backend.
    const name = (cause as { name?: unknown } | null)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') throw cause;

    // THE URL ACTUALLY REQUESTED, not `config.apiUrl`. That value is the EMPTY
    // STRING in the supported same-origin deployment (CLAUDE.md: `""` =
    // same-origin, for the cloud reverse-proxy model), which rendered as
    // "Could not reach the FaultMaven API at ." — and it names the wrong host
    // entirely for the absolute-URL requests this function also accepts.
    throw new NetworkError(
      `Could not reach the FaultMaven API at ${new URL(url, window.location.href).origin}. ` +
        'It may be offline, unreachable from this network, or rejecting this origin.',
      cause instanceof Error ? cause : undefined,
    );
  }
}

/**
 * Build query parameters from object
 *
 * @param params - Object of query parameters
 * @returns URLSearchParams string
 */
export function buildQueryParams(params: Record<string, string | number | undefined>): string {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      queryParams.set(key, value.toString());
    }
  }

  return queryParams.toString();
}
