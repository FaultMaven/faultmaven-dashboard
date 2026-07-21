import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/api', () => ({
  devLogin: vi.fn(),
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
});
