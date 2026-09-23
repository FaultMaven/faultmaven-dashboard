import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminProtectedRoute } from '../../components/AdminProtectedRoute';

// Mock AuthContext to control the (authState, loading, deployment, role,
// configStatus) tuple.
//
// ‼ `configStatus` is part of the tuple now, and omitting it is not neutral:
// the guard renders `DeploymentUndetermined` for anything other than 'ok', so a
// fixture that leaves it out tests the waiting state while claiming to test a
// decision. These three cases said `deployment: 'cloud'`/'standalone' and meant
// "the deployment is KNOWN" — which is exactly what 'ok' states.
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
    renderAt({ authState: AUTHED, loading: false, deployment: 'cloud', role: 'platform_admin', configStatus: 'ok' });
    expect(screen.getByText('USER MANAGEMENT')).toBeInTheDocument();
  });

  it('redirects a standalone operator to /cases (the direct-URL gap)', () => {
    // Local operator is authenticated and carries the admin role, yet must NOT
    // reach user management — this is the case the old isAdmin-only guard let through.
    renderAt({ authState: AUTHED, loading: false, deployment: 'standalone', role: 'individual', configStatus: 'ok' });
    expect(screen.queryByText('USER MANAGEMENT')).not.toBeInTheDocument();
    expect(screen.getByText('CASES')).toBeInTheDocument();
  });

  it('redirects a cloud standard_user to /cases', () => {
    renderAt({ authState: AUTHED, loading: false, deployment: 'cloud', role: 'standard_user', configStatus: 'ok' });
    expect(screen.getByText('CASES')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login', () => {
    renderAt({ authState: null, loading: false, deployment: 'cloud', role: 'platform_admin', configStatus: 'ok' });
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  it('renders nothing while auth is still loading', () => {
    const { container } = renderAt({
      authState: null,
      loading: true,
      deployment: null,
      role: null,
      configStatus: 'pending',
    });
    expect(container).toHaveTextContent('');
  });

  it('does NOT refuse while the deployment is still unknown', () => {
    // `canManageUsers` needs a confirmed 'cloud', so it answers false — not
    // "unknown" — during the `/auth/config` round trip, and this guard redirects
    // with `replace`. A cloud operator on a hard refresh was therefore sent to
    // /cases irrecoverably. The wiring through App's real router is asserted in
    // `src/test/pages/deploymentGatedRoutes.test.tsx`; this pins the component.
    renderAt({
      authState: AUTHED,
      loading: false,
      deployment: null,
      role: null,
      configStatus: 'pending',
    });
    expect(screen.queryByText('CASES')).not.toBeInTheDocument();
    expect(screen.queryByText('USER MANAGEMENT')).not.toBeInTheDocument();
  });
});
