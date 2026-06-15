import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminProtectedRoute } from '../../components/AdminProtectedRoute';

// Mock AuthContext to control the (authState, loading, deployment, role) tuple.
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

const AUTHED = { user: { roles: ['admin'] } };

function renderAt(authValue: Record<string, unknown>) {
  mockUseAuth.mockReturnValue(authValue);
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route
          path="/admin/users"
          element={
            <AdminProtectedRoute>
              <div>USER MANAGEMENT</div>
            </AdminProtectedRoute>
          }
        />
        <Route path="/cases" element={<div>CASES</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminProtectedRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the route for a cloud platform_admin', () => {
    renderAt({ authState: AUTHED, loading: false, deployment: 'cloud', role: 'platform_admin' });
    expect(screen.getByText('USER MANAGEMENT')).toBeInTheDocument();
  });

  it('redirects a standalone operator to /cases (the direct-URL gap)', () => {
    // Local operator is authenticated and carries the admin role, yet must NOT
    // reach user management — this is the case the old isAdmin-only guard let through.
    renderAt({ authState: AUTHED, loading: false, deployment: 'local', role: 'individual' });
    expect(screen.queryByText('USER MANAGEMENT')).not.toBeInTheDocument();
    expect(screen.getByText('CASES')).toBeInTheDocument();
  });

  it('redirects a cloud standard_user to /cases', () => {
    renderAt({ authState: AUTHED, loading: false, deployment: 'cloud', role: 'standard_user' });
    expect(screen.getByText('CASES')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login', () => {
    renderAt({ authState: null, loading: false, deployment: 'cloud', role: 'platform_admin' });
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  it('renders nothing while auth is still loading', () => {
    const { container } = renderAt({ authState: null, loading: true, deployment: null, role: null });
    expect(container).toHaveTextContent('');
  });
});
