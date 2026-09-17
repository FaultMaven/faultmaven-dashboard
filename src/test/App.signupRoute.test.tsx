import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/**
 * The cross-repo contract nobody else can check.
 *
 * faultmaven-website asserts that its call to action points at `/signup`
 * (`tests/links.test.ts`), and `SignUpPage.test.tsx` renders the component
 * directly in its own router. Neither touches `App`, so deleting the
 * `<Route path="/signup">` line leaves both suites green while the catch-all
 * `<Route path="*">` swallows the marketing CTA into `/cases` → ProtectedRoute
 * → `/login` — which is website#42, restored, with nothing red on either side.
 *
 * This is the only test that mounts the real router at that path.
 */

vi.mock('../pages/SignUpPage', () => ({
  default: () => <span data-testid="signup-page" />,
}));

// The app shell pulls in the world; stub what a bare route render would
// otherwise drag along. Nothing here touches the routing decision itself.
vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../context/AuthContext');
  return {
    ...actual,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: () => ({
      deployment: 'cloud',
      configStatus: 'ok',
      loginUrl: 'https://api.example/login',
      isAuthenticated: false,
      authState: null,
      role: null,
    }),
  };
});

describe('the /signup route', () => {
  it('is registered, and is not swallowed by the catch-all', async () => {
    window.history.pushState({}, '', '/signup');
    const { default: App } = await import('../App');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('signup-page')).toBeInTheDocument();
    });
    // 20s, and the budget is the TEST's, not waitFor's — a waitFor timeout
    // above the 5s default testTimeout can never be reached, which is how
    // raising it the first time changed nothing. Mounting the real App pulls
    // in the whole shell and takes ~4s alone, over 5s under a full parallel
    // run; this test is deliberately the only one that pays that cost.
  }, 20000);
});
