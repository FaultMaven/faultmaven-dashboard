import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OAuthAuthorizePage from '../../pages/OAuthAuthorizePage';
import { getOAuthConsent } from '../../lib/api/oauth';

const mockGetAuthState = vi.fn();
vi.mock('../../lib/auth', () => ({
  authManager: { getAuthState: () => mockGetAuthState() },
}));

/**
 * The copilot's OAuth consent screen (copilot#185).
 *
 * This page consumed a contract the backend does not implement. The real
 * response — `AuthorizationConsentRequest` (faultmaven
 * `modules/auth/api/oauth.py:83`) — is flat: client_id, client_name,
 * redirect_uri, scope, state, user_id, username. It has no nested `user` and
 * no PKCE echo.
 *
 * The page read `consent.user.display_name` (crashing every cloud sign-in from
 * the side panel with "Cannot read properties of undefined") and
 * `consent.code_challenge` (which would have POSTed `undefined` to the approval
 * endpoint even if the render had survived).
 *
 * Both are pinned here against the REAL response shape, so re-introducing the
 * invented one fails rather than shipping.
 */

const CONSENT_RESPONSE = {
  client_id: 'faultmaven-copilot',
  client_name: 'FaultMaven Copilot',
  redirect_uri: 'chrome-extension://abc/callback.html',
  scope: 'openid profile cases:read cases:write',
  state: 'state-123',
  user_id: 'user-789',
  username: 'sterlan.yu',
};

const mockSubmitOAuthApproval = vi.fn();

vi.mock('../../lib/api/oauth', () => ({
  getOAuthConsent: vi.fn().mockImplementation(async () => CONSENT_RESPONSE),
  submitOAuthApproval: (...args: unknown[]) => mockSubmitOAuthApproval(...args),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    authState: {
      access_token: 't',
      token_type: 'bearer',
      expires_at: Date.now() + 3600_000,
      user: {
        user_id: 'user-789',
        username: 'sterlan.yu',
        email: 'sterlan.yu@faultmaven.ai',
        display_name: 'Sterlan Yu',
        is_dev_user: false,
        is_active: true,
      },
    },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const QUERY =
  '?response_type=code&client_id=faultmaven-copilot' +
  '&redirect_uri=chrome-extension%3A%2F%2Fabc%2Fcallback.html' +
  '&state=state-123&code_challenge=challenge-xyz&code_challenge_method=S256' +
  '&scope=openid+profile+cases%3Aread+cases%3Awrite';

const renderPage = (query: string = QUERY) =>
  render(
    <MemoryRouter initialEntries={[`/auth/authorize${query}`]}>
      <Routes>
        <Route path="/auth/authorize" element={<OAuthAuthorizePage />} />
      </Routes>
    </MemoryRouter>
  );

// Build the page's query string with a different redirect_uri. Both the approve
// and the deny path navigate to it now, so a test that only swaps
// `CONSENT_RESPONSE.redirect_uri` is testing the wrong value on approve:
// redirectToExtension reads it off the URL, not off the consent response.
const queryWithRedirect = (redirectUri: string) =>
  QUERY.replace(
    'redirect_uri=chrome-extension%3A%2F%2Fabc%2Fcallback.html',
    `redirect_uri=${encodeURIComponent(redirectUri)}`
  );

describe('OAuthAuthorizePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmitOAuthApproval.mockResolvedValue({ code: 'auth-code', state: 'state-123' });
    mockGetAuthState.mockResolvedValue({
      user: { user_id: 'user-789', username: 'sterlan.yu' },
    });
  });

  // F6 (review): the window.location stub must be torn down even when an
  // assertion throws, or it leaks into every later test in this file.
  const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
  afterEach(() => {
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  // Both the approve and the deny path leave the origin now, so every
  // navigation assertion wants the same stub. The returned array collects each
  // href the page assigned — empty means it refused to navigate at all.
  function captureNavigations(): string[] {
    const hrefs: string[] = [];
    delete (window as any).location;
    (window as any).location = {
      ...(originalLocation?.value ?? {}),
      origin: 'https://app.faultmaven.ai',
      pathname: '/auth/authorize',
      set href(v: string) { hrefs.push(v); },
      get href() { return 'https://app.faultmaven.ai/auth/authorize'; },
    };
    return hrefs;
  }

  it('renders the consent screen against the real flat response, without crashing', async () => {
    renderPage();

    // Reaching the consent copy at all is the regression: the previous build
    // threw on `consent.user.display_name` before this ever rendered.
    expect(await screen.findByText(/This application will be able to/i)).toBeInTheDocument();
  });

  // The heading was the literal string "Authorize FaultMaven Copilot", true only
  // while `oauth_allowed_clients` has one entry. Safe to render the real name
  // since faultmaven#1053 refuses unknown client_ids on the GET.
  it('names the application that actually asked, not a hardcoded one', async () => {
    // Deliberately NOT the copilot: a heading hardcoded to the copilot passes any
    // test that authorizes the copilot, which is why the fixture is a different
    // client. This is the assertion that fails if the string is pinned back.
    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      client_id: 'faultmaven-cli',
      client_name: 'FaultMaven CLI Tool',
    } as never);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Authorize FaultMaven CLI Tool' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Authorize FaultMaven Copilot/)).not.toBeInTheDocument();
    // The subtitle must not re-assert a specific product either — it named the
    // browser extension unconditionally.
    expect(screen.queryByText(/browser extension/i)).not.toBeInTheDocument();
  });

  it('falls back to the client id when no display name is supplied', async () => {
    // An operator-added client has no entry in the backend's display-name map, so
    // `client_name` is the raw id. A blank heading on the screen whose job is
    // naming the requester would be the failure this change exists to prevent.
    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      client_id: 'acme-internal-tool',
      client_name: '',
    } as never);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Authorize acme-internal-tool' })
    ).toBeInTheDocument();
  });

  it('shows the signed-in identity from the session, which is where it actually lives', async () => {
    renderPage();

    // The consent response carries only user_id/username; display_name and
    // email come from the dashboard's own authenticated session.
    expect(await screen.findByText('Sterlan Yu')).toBeInTheDocument();
    expect(screen.getByText('sterlan.yu@faultmaven.ai')).toBeInTheDocument();
  });

  // F1 (review). Cancel navigated to `redirect_uri` unconditionally, including
  // from the catch branch, and a `javascript:` value would have executed on the
  // dashboard's own origin. The server now refuses an unlisted redirect_uri on
  // the GET (faultmaven#1053), so this value no longer arrives in practice —
  // the check is kept as defence in depth, and this test keeps it honest by
  // handing the page the value the server would have blocked.
  it('refuses to navigate to a disallowed redirect_uri on Cancel', async () => {
    // The backend RAISES 400 on a denial, so the POST rejecting is the real
    // path — mocking it as resolving tested a branch that never runs.
    mockSubmitOAuthApproval.mockRejectedValueOnce(new Error('User denied authorization request'));
    const hrefs = captureNavigations();

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: 'javascript:alert(document.domain)',
    } as never);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(mockSubmitOAuthApproval).toHaveBeenCalled());
    expect(hrefs).toHaveLength(0);
    expect(await screen.findByText(/unsupported redirect target/i)).toBeInTheDocument();
  });

  // F2 (review): the guard permitted any https host, which is still an open
  // redirect. Widening it for launchWebAuthFlow (dashboard#89) had to be done by
  // host SHAPE for exactly this reason — a bare `https:` scheme entry would have
  // reopened it.
  it('refuses an arbitrary https redirect_uri on Cancel', async () => {
    mockSubmitOAuthApproval.mockRejectedValueOnce(new Error('User denied authorization request'));
    const hrefs = captureNavigations();

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: 'https://evil.example/steal',
    } as never);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(mockSubmitOAuthApproval).toHaveBeenCalled());
    expect(hrefs).toHaveLength(0);
  });

  // dashboard#89. THE regression. Approve used to rewrite the address bar
  // same-origin (history.replaceState) and render "this window will close
  // automatically", relying on a tabs.onUpdated watcher in the extension to
  // scrape the code and close the tab. copilot#192 deletes that watcher for
  // identity.launchWebAuthFlow, which resolves on a navigation to the redirect
  // URI and on NOTHING else — so a same-origin rewrite leaves the side panel
  // spinning until its 3-minute timeout.
  it('navigates to the extension redirect_uri on Authorize, rather than rewriting the address bar', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    const hrefs = captureNavigations();
    const redirectUri = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: redirectUri,
    } as never);

    renderPage(queryWithRedirect(redirectUri));
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    await waitFor(() => expect(hrefs).toHaveLength(1));
    const url = new URL(hrefs[0]);
    expect(url.origin).toBe('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org');
    expect(url.searchParams.get('code')).toBe('auth-code');
    expect(url.searchParams.get('state')).toBe('state-123');
    // Not the dashboard's own origin, and not via history — that is the bug.
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it("accepts Firefox's launchWebAuthFlow redirect host too", async () => {
    const hrefs = captureNavigations();
    const redirectUri = 'https://0123456789abcdef0123456789abcdef01234567.extensions.allizom.org/';

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: redirectUri,
    } as never);

    renderPage(queryWithRedirect(redirectUri));
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    await waitFor(() => expect(hrefs).toHaveLength(1));
    expect(hrefs[0]).toContain('.extensions.allizom.org/?code=auth-code');
  });

  // faultmaven#1065 keeps the extension-scheme patterns server-side for builds
  // predating copilot#192, so this allowlist has to keep serving them.
  it('still navigates to a chrome-extension: redirect_uri on Authorize', async () => {
    const hrefs = captureNavigations();

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    await waitFor(() => expect(hrefs).toHaveLength(1));
    expect(hrefs[0]).toBe(
      'chrome-extension://abc/callback.html?code=auth-code&state=state-123'
    );
  });

  // The approve path leaves the origin now, so it needs the same defence in
  // depth Cancel has always had. A near-miss host is the case worth pinning:
  // `chromiumapp.org` as a suffix of an attacker's domain, or as a bare host,
  // must not pass.
  it.each([
    'https://evil.example/steal',
    'https://evil.example/?x=.chromiumapp.org',
    'https://chromiumapp.org/',
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org.evil.example/',
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/../evil',
    'https://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.chromiumapp.org/',
  ])('refuses to hand the code to %s', async (redirectUri) => {
    const hrefs = captureNavigations();

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: redirectUri,
    } as never);

    renderPage(queryWithRedirect(redirectUri));
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    expect(await screen.findByText(/unsupported redirect target/i)).toBeInTheDocument();
    expect(hrefs).toHaveLength(0);
  });

  // F5 (review): denyRedirectUrl percent-encodes for exactly this reason; the
  // approve path interpolated raw, so a `state` carrying & or # would corrupt
  // the parameters the extension parses back out for its CSRF check. Still true
  // now that the approve path performs a real navigation.
  it('percent-encodes code and state into the redirect URL', async () => {
    const hrefs = captureNavigations();
    mockSubmitOAuthApproval.mockResolvedValueOnce({
      code: 'code&injected=1',
      state: 'state#frag&x=2',
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    await waitFor(() => expect(hrefs).toHaveLength(1));
    const url = new URL(hrefs[0]);
    // Round-trips intact rather than splitting into extra parameters.
    expect(url.searchParams.get('code')).toBe('code&injected=1');
    expect(url.searchParams.get('state')).toBe('state#frag&x=2');
    expect(url.searchParams.get('injected')).toBeNull();
  });

  // A redirect_uri that already carries a query must gain `&code=`, not a second
  // `?` — the extension parses the result with URLSearchParams either way, but
  // only one of the two is a valid URL.
  it('appends with & when the redirect_uri already has a query', async () => {
    const hrefs = captureNavigations();
    const redirectUri = 'chrome-extension://abc/callback.html?src=panel';

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: redirectUri,
    } as never);

    renderPage(queryWithRedirect(redirectUri));
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    await waitFor(() => expect(hrefs).toHaveLength(1));
    expect(hrefs[0]).toBe(
      'chrome-extension://abc/callback.html?src=panel&code=auth-code&state=state-123'
    );
  });

  // The deny path shares the allowlist, so widening it for launchWebAuthFlow has
  // to unblock Cancel as well — it dead-ended on "unsupported redirect target"
  // for the exact URIs the new sign-in flow uses.
  it('returns access_denied to a launchWebAuthFlow redirect_uri on Cancel', async () => {
    mockSubmitOAuthApproval.mockRejectedValueOnce(new Error('User denied authorization request'));
    const hrefs = captureNavigations();
    const redirectUri = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: redirectUri,
    } as never);

    renderPage(queryWithRedirect(redirectUri));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(hrefs).toHaveLength(1));
    const url = new URL(hrefs[0]);
    expect(url.origin).toBe('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org');
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('state-123');
  });

  // F1 (review): the consent screen can sit open for minutes and the approval
  // call re-reads auth at click time, so the pin must be re-checked THEN.
  it('re-checks the identity at click time, not only at load', async () => {
    renderPage();
    const approve = await screen.findByRole('button', { name: /authorize/i });

    // Another tab signs in as someone else while this screen is open.
    mockGetAuthState.mockResolvedValue({ user: { user_id: 'someone-else' } });
    fireEvent.click(approve);

    expect(await screen.findByText(/signed-in account changed/i)).toBeInTheDocument();
    expect(mockSubmitOAuthApproval).not.toHaveBeenCalled();
  });

  // F4 (review): a stored session with no user_id must not pass the pin.
  it('fails closed when the stored session carries no user_id', async () => {
    vi.mocked(getOAuthConsent).mockResolvedValueOnce({ ...CONSENT_RESPONSE } as never);
    mockGetAuthState.mockResolvedValue({ user: {} });

    renderPage();

    // The load-time pin reads AuthContext's snapshot, which still matches; the
    // click-time pin reads storage, which does not.
    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));
    expect(await screen.findByText(/signed-in account changed/i)).toBeInTheDocument();
    expect(mockSubmitOAuthApproval).not.toHaveBeenCalled();
  });

  // F2 (review). AuthContext snapshots authState on mount and never re-reads it,
  // while consent/approval read auth fresh — so the screen could name one user
  // while Authorize minted a code for another.
  it('refuses to render consent when the session identity differs from the response', async () => {
    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      user_id: 'someone-else',
    } as never);

    renderPage();

    expect(await screen.findByText(/signed-in account changed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /authorize/i })).not.toBeInTheDocument();
  });

  // F3 (review). An empty challenge must be refused here; otherwise the screen
  // reports success and the failure only surfaces at the token exchange.
  it('refuses an authorization request with an empty code_challenge', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/authorize?code_challenge=&state=s&client_id=c']}>
        <Routes>
          <Route path="/auth/authorize" element={<OAuthAuthorizePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/missing PKCE code challenge/i)).toBeInTheDocument();
    expect(getOAuthConsent).not.toHaveBeenCalled();
  });

  // The two halves of the backend disagree: GET /auth/oauth/authorize takes
  // code_challenge_method as a bare `str` Query, the approval BODY types it
  // Literal["S256"]. Forwarding it verbatim rendered a normal consent screen and
  // then 422'd on click. Refuse it up front instead.
  it('refuses a PKCE method the approval endpoint cannot accept', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/auth/authorize?code_challenge=challenge-xyz&code_challenge_method=plain' +
            '&state=state-123&client_id=faultmaven-copilot',
        ]}
      >
        <Routes>
          <Route path="/auth/authorize" element={<OAuthAuthorizePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/unsupported pkce method "plain"/i)).toBeInTheDocument();
    // Refused BEFORE the consent round-trip, so nothing is shown and nothing is
    // submitted — the point is that the failure never reaches the click.
    expect(getOAuthConsent).not.toHaveBeenCalled();
    expect(mockSubmitOAuthApproval).not.toHaveBeenCalled();
  });

  it('still accepts the default method when the parameter is absent entirely', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/auth/authorize?code_challenge=challenge-xyz&state=state-123&client_id=faultmaven-copilot',
        ]}
      >
        <Routes>
          <Route path="/auth/authorize" element={<OAuthAuthorizePage />} />
        </Routes>
      </MemoryRouter>
    );

    // Reaches consent: the `|| 'S256'` default is what makes the guard above
    // narrow rather than a blanket requirement that clients send the parameter.
    expect(await screen.findByRole('button', { name: /authorize/i })).toBeInTheDocument();
  });

  // An EXPIRED session is not a changed identity. Folding `null` into the
  // mismatch branch told the user their account had changed and to reload — on a
  // screen whose only control is an inert window.close().
  it('sends an expired session back to sign-in, not to the identity-change error', async () => {
    mockGetAuthState.mockResolvedValue(null);

    render(
      <MemoryRouter initialEntries={[`/auth/authorize${QUERY}`]}>
        <Routes>
          <Route path="/auth/authorize" element={<OAuthAuthorizePage />} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText(/signed-in account changed/i)).not.toBeInTheDocument();
    expect(mockSubmitOAuthApproval).not.toHaveBeenCalled();
    // …and login returns here rather than to the dashboard home.
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toContain(
      'code_challenge=challenge-xyz'
    );
  });

  it('approves with the PKCE parameters from the URL, never undefined', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /authorize/i }));

    await waitFor(() => expect(mockSubmitOAuthApproval).toHaveBeenCalled());
    expect(mockSubmitOAuthApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: true,
        client_id: 'faultmaven-copilot',
        code_challenge: 'challenge-xyz',
        code_challenge_method: 'S256',
        state: 'state-123',
      })
    );
  });
});
