import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../../components/ProtectedRoute';

// Mock AuthContext to control the (isAuthenticated, loading) tuple.
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
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
