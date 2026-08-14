// OAuth API client — how a refused authorization is reported to the user.
//
// The client used to read `error_description` off the error body. Nothing sets
// it: both endpoints raise FastAPI `HTTPException`, so the body is
// `{"detail": ...}`. Every refusal therefore fell through to the generic
// fallback — including the precise 400 the server returns since faultmaven#1053
// for an unknown client or an unlisted redirect target.
//
// These pin BOTH halves of the fix: a refusal now says something specific, and
// the server's `detail` — which interpolates the caller's own `client_id` /
// `redirect_uri` — is still never rendered.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config', () => ({ default: { apiUrl: 'http://api.test' } }));
vi.mock('../../../lib/auth', () => ({
  authManager: { getAuthState: async () => ({ access_token: 'tok' }) },
}));

import { getOAuthConsent, submitOAuthApproval } from '../../../lib/api/oauth';

/** The shape FastAPI actually returns, with the caller's own string inside it. */
const ATTACKER_ID = 'Session expired - call 1-800-NOT-REAL to restore access';

function respondWith(status: number, body: unknown = { detail: 'x' }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }))
  );
}

const APPROVAL = {
  approved: true,
  client_id: 'faultmaven-copilot',
  redirect_uri: 'chrome-extension://abc/callback.html',
  code_challenge: 'c',
  code_challenge_method: 'S256',
  scope: 'openid',
  state: 's',
};

describe('OAuth client error reporting', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('does not echo the server detail, which carries the caller’s own input', async () => {
    // The security property, not merely a wording check: rendering this would put
    // an attacker-chosen string on the dashboard's origin — the same reason
    // `client_name` stays off the consent screen.
    respondWith(400, { detail: `Unknown client_id: ${ATTACKER_ID}` });

    await expect(getOAuthConsent(new URLSearchParams())).rejects.toThrow(
      /not one this FaultMaven deployment recognises/
    );
    await expect(getOAuthConsent(new URLSearchParams())).rejects.not.toThrow(
      /NOT-REAL/
    );
  });

  it.each([
    [400, /rejected/i],
    [401, /session is no longer valid/i],
    [429, /Too many authorization attempts/i],
    [503, /OAuth is not enabled/i],
  ])('maps %i to a specific message', async (status, expected) => {
    respondWith(status);
    await expect(getOAuthConsent(new URLSearchParams())).rejects.toThrow(expected);
  });

  it('falls back to the generic message on an unmapped status', async () => {
    // 500 is deliberately unmapped — inventing a reassuring sentence for a
    // server fault would be a claim the client cannot support.
    respondWith(500);
    await expect(getOAuthConsent(new URLSearchParams())).rejects.toThrow(
      'Failed to fetch OAuth consent data'
    );
  });

  it('reports an unreadable body as the fallback rather than a JSON parse error', async () => {
    // Gateway/proxy failures return HTML or nothing. The old reader guarded
    // `response.json()` for this; the mapping must not reintroduce the throw.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Unexpected end of JSON input');
        },
      }))
    );

    await expect(getOAuthConsent(new URLSearchParams())).rejects.toThrow(
      'Failed to fetch OAuth consent data'
    );
  });

  // The approval endpoint is the OTHER call site. Wiring one and not the other
  // is exactly the "incomplete set" defect this whole thread keeps producing.
  it('applies the same mapping to the approval endpoint, with its own fallback', async () => {
    respondWith(400, { detail: `Invalid redirect_uri: ${ATTACKER_ID}` });
    await expect(submitOAuthApproval(APPROVAL)).rejects.toThrow(/rejected/i);
    await expect(submitOAuthApproval(APPROVAL)).rejects.not.toThrow(/NOT-REAL/);

    respondWith(500);
    await expect(submitOAuthApproval(APPROVAL)).rejects.toThrow(
      'Failed to submit OAuth approval'
    );
  });

  it('passes a successful response through untouched', async () => {
    // The control: every rejection above must fail for its own reason, not
    // because the client rejects everything.
    const consent = { client_id: 'faultmaven-copilot', state: 's' };
    respondWith(200, consent);

    await expect(getOAuthConsent(new URLSearchParams())).resolves.toEqual(consent);
  });
});
