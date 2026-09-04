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

import SSOCallbackPage from '../../pages/SSOCallbackPage';
import { ssoExchange } from '../../lib/api';
import { POST_SIGN_IN_LANDING } from '../../lib/auth/landing';

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

  it('exchanges the completion code, stores the session, and lands on the shared default', async () => {
    // The default is `/cases`, not the knowledge base: that is the route that
    // owns the zero-case rule, so a brand-new cloud account reaches the panel
    // with a new investigation (ADR-016 D6) instead of an empty KB. Asserted
    // through the constant both sign-in paths share, so the standalone and
    // cloud legs cannot drift apart again.
    renderCallback('/auth/sso/callback?code=completion-abc');

    expect(await screen.findByTestId('location')).toHaveTextContent(POST_SIGN_IN_LANDING);
    expect(mockSsoExchange).toHaveBeenCalledWith('completion-abc');
    expect(mockSetAuthState).toHaveBeenCalledWith(AUTH_STATE);
    // Cross-user residue guard runs before the new session renders.
    expect(mockInvalidateAvailableScopes).toHaveBeenCalled();
  });

  it('honors a same-origin return_to path from the backend redirect', async () => {
    renderCallback('/auth/sso/callback?code=abc&return_to=%2Fcases%2Fcase-42%3Ftab%3Dreport');

    expect(await screen.findByTestId('location')).toHaveTextContent('/cases/case-42?tab=report');
  });

  it('rejects a non-same-origin return_to and falls back to the default', async () => {
    // "//host" is scheme-relative (open redirect); absolute URLs never start
    // with "/" so they are rejected by the same guard.
    renderCallback('/auth/sso/callback?code=abc&return_to=%2F%2Fevil.example%2Fphish');

    expect(await screen.findByTestId('location')).toHaveTextContent(POST_SIGN_IN_LANDING);
    expect(await screen.findByTestId('location')).not.toHaveTextContent('evil.example');
  });

  it('rejects an oversized return_to and falls back to the default', async () => {
    // Parity with the backend guard: bounded length (512).
    const huge = '/' + 'a'.repeat(600);
    renderCallback(`/auth/sso/callback?code=abc&return_to=${encodeURIComponent(huge)}`);

    expect(await screen.findByTestId('location')).toHaveTextContent(POST_SIGN_IN_LANDING);
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

    expect(await screen.findByTestId('location')).toHaveTextContent(POST_SIGN_IN_LANDING);
    expect(mockSsoExchange).toHaveBeenCalledTimes(1);
  });

  it('exchanges immediately, without waiting for deployment detection', async () => {
    // The completion code is single-use and short-TTL; holding it behind the
    // unrelated /auth/config fetch let a config blip expire an exchangeable
    // code. Role no longer needs the gate — it is derived in AuthContext from
    // authState + deployment and materializes once detection resolves.
    mockUseAuth.mockReturnValue({ deployment: null, setAuthState: mockSetAuthState });

    renderCallback('/auth/sso/callback?code=abc');

    await waitFor(() => expect(mockSsoExchange).toHaveBeenCalledWith('abc'));
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
