import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../../components/ProtectedRoute';

// Mock AuthContext to control the (isAuthenticated, loading) tuple.
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const isCrossTabSignOut = vi.fn().mockReturnValue(false);
vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: { isCrossTabSignOut: () => isCrossTabSignOut() },
}));

import { useAuth } from '../../context/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function renderAt(authValue: Record<string, unknown>, initialEntry = '/cases') {
  mockUseAuth.mockReturnValue(authValue);
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/cases"
          element={
            <ProtectedRoute>
              <div>PROTECTED CONTENT</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/auth/authorize"
          element={
            <ProtectedRoute>
              <div>OAUTH CONSENT</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders nothing while auth is still hydrating (no bounce to /login)', () => {
    // Regression: auth state hydrates async. Before the loading gate, the first
    // render saw isAuthenticated=false and redirected a valid session to /login
    // on every hard refresh (and broke copilot ?tab= deep links + OAuth consent).
    const { container } = renderAt({ isAuthenticated: false, loading: true });
    expect(container).toHaveTextContent('');
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument();
  });

  it('renders the protected child once a valid session has hydrated', () => {
    renderAt({ isAuthenticated: true, loading: false });
    expect(screen.getByText('PROTECTED CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login and remembers the destination', () => {
    renderAt({ isAuthenticated: false, loading: false }, '/auth/authorize?client_id=abc');
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBe(
      '/auth/authorize?client_id=abc',
    );
  });

  it('does not persist a redirect target while still loading', () => {
    renderAt({ isAuthenticated: false, loading: true });
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });
});


describe('the post-login destination it records', () => {
  beforeEach(() => {
    sessionStorage.clear();
    isCrossTabSignOut.mockReturnValue(false);
  });

  it('records where the user was, for an ordinary bounce to login', () => {
    // The OAuth flow depends on this: the extension opens /auth/authorize with
    // its PKCE params, and they have to survive the round trip through login.
    renderAt({ isAuthenticated: false, loading: false }, '/auth/authorize?client_id=copilot');

    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBe(
      '/auth/authorize?client_id=copilot',
    );
  });

  it('records NOTHING when another tab signed this one out', () => {
    // The URL in the bar belongs to the account that just went away. Recording
    // it would deep-link whoever signs in next straight into the previous
    // person's case — a cross-account leak by way of a convenience feature.
    isCrossTabSignOut.mockReturnValue(true);

    renderAt({ isAuthenticated: false, loading: false }, '/cases');

    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });

  it('does not overwrite an existing destination on a cross-tab sign-out', () => {
    isCrossTabSignOut.mockReturnValue(true);
    sessionStorage.setItem('oauth_redirect_after_login', '/auth/authorize?client_id=copilot');

    renderAt({ isAuthenticated: false, loading: false }, '/cases');

    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBe(
      '/auth/authorize?client_id=copilot',
    );
  });
});
