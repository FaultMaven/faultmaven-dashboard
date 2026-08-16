import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/api', () => ({
  devLogin: vi.fn(),
  SIGNOUT_NOTICE_KEY: 'fm_signout_notice',
  authManager: {
    writeBridgeAuthState: vi.fn(),
    hasBridgeAuthState: vi.fn().mockReturnValue(false),
    // useAvailableScopes registers a listener at module load; keep it a no-op.
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
}));

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import LoginPage from '../../pages/LoginPage';

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('cloud mode: renders an SSO sign-in with no password OR username field (D3)', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      loginUrl: 'https://idp.example/login',
      setAuthState: vi.fn(),
    });

    renderLogin();

    // D3: the cloud password field is removed entirely; there is no dev-login form.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('cloud mode: Sign In redirects to the deployment hosted-login URL', () => {
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    // loginUrl comes from AuthContext, sourced from the dedicated hosted-login
    // field — NOT the copilot PKCE authorize endpoint.
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      loginUrl: 'https://idp.example/login',
      setAuthState: vi.fn(),
    });

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(assignSpy).toHaveBeenCalledWith('https://idp.example/login');
    assignSpy.mockRestore();
  });

  it('cloud mode: forwards the saved destination as return_to on the hosted-login URL', () => {
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    // ProtectedRoute saved the intended destination; the hosted-login handoff
    // echoes it via the backend's return_to so it survives the IdP round trip.
    sessionStorage.setItem('oauth_redirect_after_login', '/cases/case-1?tab=report');
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      loginUrl: 'https://idp.example/login',
      setAuthState: vi.fn(),
    });

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(assignSpy).toHaveBeenCalledWith(
      'https://idp.example/login?return_to=%2Fcases%2Fcase-1%3Ftab%3Dreport'
    );
    sessionStorage.removeItem('oauth_redirect_after_login');
    assignSpy.mockRestore();
  });

  it('standalone mode: passwordless username form, no password field', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      loginUrl: null,
      setAuthState: vi.fn(),
    });

    renderLogin();

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('waits for deployment detection before choosing a login variant', () => {
    mockUseAuth.mockReturnValue({
      deployment: null,
      loginUrl: null,
      setAuthState: vi.fn(),
    });

    renderLogin();

    // Neither variant is rendered until deployment resolves.
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });

  it('cloud mode without a configured IdP surfaces an honest error, no redirect', () => {
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      loginUrl: null,
      setAuthState: vi.fn(),
    });

    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/single sign-on is not configured/i)).toBeInTheDocument();
    expect(assignSpy).not.toHaveBeenCalled();
    assignSpy.mockRestore();
  });

  // The sign-out that landed the user here could not confirm that the account's
  // other sessions ended. The menu that asked is gone by then — this screen is
  // the only place left to say so, and saying nothing would let the user read
  // the sign-out as complete when the Copilot is still signed in.
  describe('unconfirmed sign-out notice', () => {
    beforeEach(() => sessionStorage.clear());

    it('warns about other sessions, then consumes the notice', () => {
      sessionStorage.setItem('fm_signout_notice', 'other_sessions_unconfirmed');
      mockUseAuth.mockReturnValue({ deployment: 'standalone', loginUrl: null, setAuthState: vi.fn() });

      const { unmount } = renderLogin();

      expect(screen.getByText(/could not confirm that your other sessions/i)).toBeInTheDocument();
      // Read once: a later, clean sign-out must not inherit this warning.
      expect(sessionStorage.getItem('fm_signout_notice')).toBeNull();

      unmount();
      mockUseAuth.mockReturnValue({ deployment: 'standalone', loginUrl: null, setAuthState: vi.fn() });
      renderLogin();
      expect(screen.queryByText(/could not confirm that your other sessions/i)).toBeNull();
    });

    it('shows the same warning on the cloud sign-in screen', () => {
      sessionStorage.setItem('fm_signout_notice', 'other_sessions_unconfirmed');
      mockUseAuth.mockReturnValue({
        deployment: 'cloud',
        loginUrl: 'https://idp.example/login',
        setAuthState: vi.fn(),
      });

      renderLogin();

      expect(screen.getByText(/could not confirm that your other sessions/i)).toBeInTheDocument();
    });

    it('says nothing after an ordinary sign-out', () => {
      mockUseAuth.mockReturnValue({ deployment: 'standalone', loginUrl: null, setAuthState: vi.fn() });

      renderLogin();

      expect(screen.queryByText(/could not confirm that your other sessions/i)).toBeNull();
    });
  });
});
