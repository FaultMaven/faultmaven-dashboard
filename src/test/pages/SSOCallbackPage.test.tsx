import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../lib/api', () => ({
  ssoExchange: vi.fn(),
}));

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockInvalidateAvailableScopes = vi.fn();
vi.mock('../../hooks/useAvailableScopes', () => ({
  invalidateAvailableScopes: () => mockInvalidateAvailableScopes(),
}));

import SSOCallbackPage, { ERROR_MESSAGES, GENERIC_ERROR } from '../../pages/SSOCallbackPage';
import { ssoExchange } from '../../lib/api';

const mockSsoExchange = ssoExchange as ReturnType<typeof vi.fn>;

const AUTH_STATE = {
  access_token: 'sso-token',
  token_type: 'bearer' as const,
  expires_at: Date.now() + 1800_000,
  refresh_token: 'sso-refresh',
  user: {
    user_id: 'u-sso',
    username: 'jane.doe',
    email: 'jane@example.com',
    display_name: 'Jane Doe',
    is_dev_user: false,
    is_active: true,
    roles: ['user'],
  },
};

// Probe route: any navigation away from the callback lands here and exposes
// the resulting URL for assertions.
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderCallback(url: string, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/sso/callback" element={<SSOCallbackPage />} />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('SSOCallbackPage', () => {
  let mockSetAuthState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockSetAuthState = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ deployment: 'cloud', setAuthState: mockSetAuthState });
    mockSsoExchange.mockResolvedValue(AUTH_STATE);
  });

  it('exchanges the completion code, stores the session, and lands on /kb by default', async () => {
    renderCallback('/auth/sso/callback?code=completion-abc');

    expect(await screen.findByTestId('location')).toHaveTextContent('/kb');
    expect(mockSsoExchange).toHaveBeenCalledWith('completion-abc');
    expect(mockSetAuthState).toHaveBeenCalledWith(AUTH_STATE);
    // Cross-user residue guard runs before the new session renders.
    expect(mockInvalidateAvailableScopes).toHaveBeenCalled();
  });

  it('honors a same-origin return_to path from the backend redirect', async () => {
    renderCallback('/auth/sso/callback?code=abc&return_to=%2Fcases%2Fcase-42%3Ftab%3Dreport');

    expect(await screen.findByTestId('location')).toHaveTextContent('/cases/case-42?tab=report');
  });

  it('rejects a non-same-origin return_to and falls back to /kb', async () => {
    // "//host" is scheme-relative (open redirect); absolute URLs never start
    // with "/" so they are rejected by the same guard.
    renderCallback('/auth/sso/callback?code=abc&return_to=%2F%2Fevil.example%2Fphish');

    expect(await screen.findByTestId('location')).toHaveTextContent('/kb');
  });

  it('rejects an oversized return_to and falls back to /kb', async () => {
    // Parity with the backend guard: bounded length (512).
    const huge = '/' + 'a'.repeat(600);
    renderCallback(`/auth/sso/callback?code=abc&return_to=${encodeURIComponent(huge)}`);

    expect(await screen.findByTestId('location')).toHaveTextContent('/kb');
  });

  it('falls back to the ProtectedRoute-saved destination and consumes it', async () => {
    sessionStorage.setItem('oauth_redirect_after_login', '/auth/authorize?client_id=copilot');

    renderCallback('/auth/sso/callback?code=abc');

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/auth/authorize?client_id=copilot'
    );
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });

  it('exchanges the code only once under StrictMode double-invoked effects', async () => {
    // The completion code is single-use server-side; a second POST would 401
    // and replace a successful login with an error screen.
    renderCallback('/auth/sso/callback?code=only-once', { strict: true });

    expect(await screen.findByTestId('location')).toHaveTextContent('/kb');
    expect(mockSsoExchange).toHaveBeenCalledTimes(1);
  });

  it('waits for deployment detection before exchanging', () => {
    // setAuthState derives the dashboard role from deployment; exchanging
    // before /auth/config resolves would store a role-less session.
    mockUseAuth.mockReturnValue({ deployment: null, setAuthState: mockSetAuthState });

    renderCallback('/auth/sso/callback?code=abc');

    expect(screen.getByText(/completing sign-in/i)).toBeInTheDocument();
    expect(mockSsoExchange).not.toHaveBeenCalled();
  });

  it('renders the mapped message for a known error slug without calling exchange', async () => {
    renderCallback('/auth/sso/callback?error=sso_access_denied');

    expect(
      await screen.findByText(/cancelled or denied at the identity provider/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(mockSsoExchange).not.toHaveBeenCalled();
    expect(mockSetAuthState).not.toHaveBeenCalled();
  });

  it('renders the actionable message for sso_org_unmapped, not the retry copy', async () => {
    // The one SSO failure retrying can never fix: under TENANT_PROVIDER=multi
    // the identity carried no organization, or one with no sso_org_mappings
    // row. It stays broken until an operator provisions the mapping, so the
    // copy must point at the administrator and must NOT invite a retry
    // (faultmaven-dashboard#79).
    renderCallback('/auth/sso/callback?error=sso_org_unmapped');

    expect(
      await screen.findByText(/organization is not set up for access yet/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/contact your administrator/i)).toBeInTheDocument();
    // Guards the regression directly: this slug used to fall through to
    // GENERIC_ERROR, which tells the user to do the one thing that cannot work.
    expect(screen.queryByText(/try again/i)).toBeNull();
    expect(mockSsoExchange).not.toHaveBeenCalled();
    expect(mockSetAuthState).not.toHaveBeenCalled();
  });

  it('handles exactly the slug set the backend can emit', async () => {
    // Cross-repo contract pin. The producer is _dashboard_redirect() in
    // sso_login_service.py, the single writer of `?error=`; its ERROR_*
    // constants are the whole domain. These slugs are query params on a 302,
    // so openapi.json does not carry them and api-types-drift cannot catch a
    // change — this test is the only thing standing between a backend addition
    // and a silent fallthrough to "please try again".
    //
    // Honest about its limit: it fails when THIS map changes, not when the
    // backend adds a slug. It cannot make that addition red here; it makes the
    // set explicit so a reviewer sees the coupling at the point of edit.
    const BACKEND_SLUGS = [
      'sso_state_invalid',
      'sso_exchange_failed',
      'sso_user_inactive',
      'sso_access_denied',
      'sso_org_unmapped',
      'sso_failed',
    ];

    // Asserting "an alert rendered" would be vacuous — the unknown-slug path
    // renders one too. The load-bearing check is that each slug produces copy
    // DISTINCT from the generic fallback, which is exactly what being absent
    // from the map costs you. sso_failed is the sole exception: its message is
    // the generic text by design, so it is pinned by the set equality below.
    for (const slug of BACKEND_SLUGS.filter((s) => s !== 'sso_failed')) {
      const { unmount } = renderCallback(`/auth/sso/callback?error=${slug}`);
      const alert = await screen.findByRole('alert');
      expect(alert.textContent?.trim()).not.toBe(GENERIC_ERROR);
      unmount();
    }

    // And the map holds these and nothing else — an entry removed or renamed
    // here fails, rather than quietly degrading to the generic message.
    const handled = Object.keys(ERROR_MESSAGES).sort();
    expect(handled).toEqual([...BACKEND_SLUGS].sort());
  });

  it('renders a generic message for an unknown error slug (never echoes the query)', async () => {
    renderCallback('/auth/sso/callback?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E');

    expect(await screen.findByText('Sign-in failed. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/script/i)).toBeNull();
  });

  it('renders a generic error when neither code nor error is present', async () => {
    renderCallback('/auth/sso/callback');

    expect(await screen.findByText('Sign-in failed. Please try again.')).toBeInTheDocument();
    expect(mockSsoExchange).not.toHaveBeenCalled();
  });

  it('shows the expired-link message when the exchange fails, and does not navigate', async () => {
    mockSsoExchange.mockRejectedValueOnce(new Error('401'));

    renderCallback('/auth/sso/callback?code=stale');

    expect(await screen.findByText(/may have expired/i)).toBeInTheDocument();
    expect(screen.queryByTestId('location')).toBeNull();
    expect(mockSetAuthState).not.toHaveBeenCalled();
  });
});
