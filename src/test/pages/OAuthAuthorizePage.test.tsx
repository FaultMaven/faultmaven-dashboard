import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OAuthAuthorizePage from '../../pages/OAuthAuthorizePage';
import { getOAuthConsent } from '../../lib/api/oauth';

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

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/auth/authorize${QUERY}`]}>
      <Routes>
        <Route path="/auth/authorize" element={<OAuthAuthorizePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('OAuthAuthorizePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmitOAuthApproval.mockResolvedValue({ code: 'auth-code', state: 'state-123' });
  });

  it('renders the consent screen against the real flat response, without crashing', async () => {
    renderPage();

    // Reaching the consent copy at all is the regression: the previous build
    // threw on `consent.user.display_name` before this ever rendered.
    expect(await screen.findByText(/This application will be able to/i)).toBeInTheDocument();
  });

  it('shows the signed-in identity from the session, which is where it actually lives', async () => {
    renderPage();

    // The consent response carries only user_id/username; display_name and
    // email come from the dashboard's own authenticated session.
    expect(await screen.findByText('Sterlan Yu')).toBeInTheDocument();
    expect(screen.getByText('sterlan.yu@faultmaven.ai')).toBeInTheDocument();
  });

  // F1 (review). `redirect_uri` reaches this page unvalidated — the backend
  // checks it only when minting the code — and Cancel navigated to it
  // unconditionally, including from the catch branch. A `javascript:` value
  // would have executed on the dashboard's own origin.
  it('refuses to navigate to a non-http redirect_uri on Cancel', async () => {
    const hrefs: string[] = [];
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    delete (window as any).location;
    (window as any).location = {
      ...(original?.value ?? {}),
      origin: 'https://app.faultmaven.ai',
      pathname: '/auth/authorize',
      set href(v: string) { hrefs.push(v); },
      get href() { return 'https://app.faultmaven.ai/auth/authorize'; },
    };

    vi.mocked(getOAuthConsent).mockResolvedValueOnce({
      ...CONSENT_RESPONSE,
      redirect_uri: 'javascript:alert(document.domain)',
    } as never);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(mockSubmitOAuthApproval).toHaveBeenCalled());
    expect(hrefs).toHaveLength(0);
    expect(await screen.findByText(/unsupported redirect target/i)).toBeInTheDocument();

    if (original) Object.defineProperty(window, 'location', original);
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
