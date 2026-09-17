import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import SignUpPage from '../../pages/SignUpPage';

const CLOUD = {
  deployment: 'cloud',
  configStatus: 'ok',
  loginUrl: 'https://api.example/api/v1/auth/sso/login',
  isAuthenticated: false,
};

function renderSignUp() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/login" element={<span data-testid="login-page" />} />
        <Route path="/cases" element={<span data-testid="cases-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * faultmaven-website#42: "a visitor who follows the primary call to action
 * from the website reaches the hosted sign-up screen without an intermediate
 * page that asks them to sign in."
 */
describe('SignUpPage', () => {
  let replaceSpy: ReturnType<typeof vi.spyOn>;
  let assignSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockUseAuth.mockReset();
    replaceSpy = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  });

  // Without this the "does not redirect" cases are worthless: vi.spyOn on an
  // already-spied property hands back the SAME spy, so its calls accumulate
  // and every negative assertion sees the previous tests' redirects. They
  // failed exactly that way before it was added.
  afterEach(() => {
    replaceSpy.mockRestore();
    assignSpy.mockRestore();
  });

  it('hands off to the hosted login asking for the sign-up screen', () => {
    mockUseAuth.mockReturnValue(CLOUD);
    renderSignUp();
    expect(replaceSpy).toHaveBeenCalledWith(
      'https://api.example/api/v1/auth/sso/login?screen_hint=sign-up'
    );
  });

  it('replaces this page in history rather than pushing onto it', () => {
    // With assign(), /signup stays in history: Back from the IdP remounts
    // this page, the effect re-fires, and the visitor is thrown straight back
    // — Back becomes a loop for the people this route exists to serve.
    mockUseAuth.mockReturnValue(CLOUD);
    renderSignUp();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('appends the hint when the advertised URL already carries a query', () => {
    mockUseAuth.mockReturnValue({
      ...CLOUD,
      loginUrl: 'https://api.example/api/v1/auth/sso/login?foo=bar',
    });
    renderSignUp();
    expect(replaceSpy).toHaveBeenCalledWith(
      'https://api.example/api/v1/auth/sso/login?foo=bar&screen_hint=sign-up'
    );
  });

  it('asks for no credentials on the way — it is a shim, not a page', () => {
    // The real invariant. A form here would satisfy the redirect assertions
    // above and still fail the issue.
    mockUseAuth.mockReturnValue(CLOUD);
    renderSignUp();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });

  it('sends an already-signed-in visitor to their cases, never to sign-up', () => {
    // The marketing CTA sits in the site header on every page, so returning
    // customers click it too. Showing them a sign-up screen invites a second
    // account — the mirror of the defect website#42 describes.
    mockUseAuth.mockReturnValue({ ...CLOUD, isAuthenticated: true });
    renderSignUp();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('cases-page')).toBeInTheDocument();
  });

  it('waits for config rather than guessing while detection is pending', () => {
    mockUseAuth.mockReturnValue({
      deployment: null,
      configStatus: 'pending',
      loginUrl: null,
      isAuthenticated: false,
    });
    renderSignUp();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it.each([
    ['standalone — single-user, no hosted login and no sign-up', { deployment: 'standalone', configStatus: 'ok', loginUrl: null }],
    ['cloud advertising no IdP', { deployment: 'cloud', configStatus: 'ok', loginUrl: null }],
  ])('falls to /login: %s', (_label, state) => {
    mockUseAuth.mockReturnValue({ ...state, isAuthenticated: false });
    renderSignUp();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('does not redirect to the IdP when config is unreachable, even with a stale loginUrl', () => {
    // runConfigDetection sets 'unreachable' WITHOUT clearing deployment or
    // loginUrl, so this state is one retry away. The effect once ignored
    // configStatus, which made the render say "/login" while the effect
    // navigated to the IdP.
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      configStatus: 'unreachable',
      loginUrl: 'https://api.example/api/v1/auth/sso/login',
      isAuthenticated: false,
    });
    renderSignUp();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
