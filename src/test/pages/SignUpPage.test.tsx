import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import SignUpPage from '../../pages/SignUpPage';

function renderSignUp() {
  return render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>
  );
}

/**
 * faultmaven-website#42: "a visitor who follows the primary call to action
 * from the website reaches the hosted sign-up screen without an intermediate
 * page that asks them to sign in."
 *
 * The invariant has two halves and both are tested here: the hint is actually
 * sent, and nothing on the way asks for credentials.
 */
describe('SignUpPage', () => {
  let assignSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockUseAuth.mockReset();
    assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  });

  // Without this the "does not redirect" cases are worthless: vi.spyOn on an
  // already-spied property hands back the SAME spy, so its calls accumulate
  // and every negative assertion sees the previous tests' redirects. They
  // failed exactly that way before it was added.
  afterEach(() => {
    assignSpy.mockRestore();
  });

  it('hands off to the hosted login asking for the sign-up screen', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      configStatus: 'ok',
      loginUrl: 'https://api.example/api/v1/auth/sso/login',
    });

    renderSignUp();

    expect(assignSpy).toHaveBeenCalledWith(
      'https://api.example/api/v1/auth/sso/login?screen_hint=sign-up'
    );
  });

  it('appends the hint when the advertised URL already carries a query', () => {
    // loginUrl is backend-advertised and may grow parameters; assuming "?"
    // would produce a second one and silently drop the hint.
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      configStatus: 'ok',
      loginUrl: 'https://api.example/api/v1/auth/sso/login?foo=bar',
    });

    renderSignUp();

    expect(assignSpy).toHaveBeenCalledWith(
      'https://api.example/api/v1/auth/sso/login?foo=bar&screen_hint=sign-up'
    );
  });

  it('asks for no credentials on the way — it is a shim, not a page', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      configStatus: 'ok',
      loginUrl: 'https://api.example/api/v1/auth/sso/login',
    });

    renderSignUp();

    // This is website#42's actual invariant. A form here would satisfy the
    // redirect assertion above and still fail the issue.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });

  it('waits for config rather than guessing while detection is pending', () => {
    mockUseAuth.mockReturnValue({
      deployment: null,
      configStatus: 'pending',
      loginUrl: null,
    });

    renderSignUp();

    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('does not redirect a standalone deployment to a hosted login it has none of', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      configStatus: 'ok',
      loginUrl: null,
    });

    renderSignUp();

    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('does not redirect a cloud deployment that advertises no IdP', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      configStatus: 'ok',
      loginUrl: null,
    });

    renderSignUp();

    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('does not redirect when the deployment config is unreachable', () => {
    // Guessing here is how cloud users reached a standalone dev-login they
    // could never sign in through; LoginPage owns that failure and its retry.
    mockUseAuth.mockReturnValue({
      deployment: null,
      configStatus: 'unreachable',
      loginUrl: null,
    });

    renderSignUp();

    expect(assignSpy).not.toHaveBeenCalled();
  });
});
