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
      loginUrl: 'https://idp.example/authorize',
      setAuthState: vi.fn(),
    });

    renderLogin();

    // D3: the cloud password field is removed entirely; there is no dev-login form.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
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
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      loginUrl: null,
      setAuthState: vi.fn(),
    });

    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/single sign-on is not configured/i)).toBeInTheDocument();
  });
});
