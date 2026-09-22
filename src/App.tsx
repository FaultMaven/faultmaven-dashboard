import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import KBPage from './pages/KBPage';
import CaseListPage from './pages/CaseListPage';
import CaseDetailPage from './pages/CaseDetailPage';
import InvestigatePage from './pages/InvestigatePage';
import LLMConfigPage from './pages/LLMConfigPage';
import UserManagementPage from './pages/UserManagementPage';
import OrganizationPage from './pages/OrganizationPage';
import TeamsPage from './pages/TeamsPage';
import AdminCaseListPage from './pages/AdminCaseListPage';
import AdminCaseContentPage from './pages/AdminCaseContentPage';
import OAuthAuthorizePage from './pages/OAuthAuthorizePage';
import SSOCallbackPage from './pages/SSOCallbackPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useCapabilities } from './hooks/useCapabilities';
import { ProtectedRoute } from './components/ProtectedRoute';
import { usePrefersExtensionForChat } from './hooks/useChatSurface';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { canManageConsole, canManageLlmConfig, canUseTeams, canViewAllCases } from './lib/access';

function LLMConfigRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, authState } = useAuth();

  if (loading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  // Same predicate as the nav item, so the two cannot drift and neither can
  // drift from the backend's operator gate.
  if (canManageLlmConfig(isAdmin)) {
    return <>{children}</>;
  }

  return <Navigate to="/cases" replace />;
}

function ManagementConsoleRoute({ children }: { children: React.ReactNode }) {
  const { role, loading, authState } = useAuth();
  const { managementConsole, loading: capLoading } = useCapabilities();

  if (loading || capLoading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  // Same predicate the nav item uses (anti-drift): the console is unreachable by
  // direct URL in standalone / pre-P2 cloud or for non-admins.
  if (canManageConsole(managementConsole, role)) {
    return <>{children}</>;
  }

  return <Navigate to="/cases" replace />;
}

/**
 * The Teams page is reachable by every signed-in account wherever the deployment
 * has teams (ADR-017 D4) — no role, matching the nav item so the two cannot
 * drift. Whether the caller may invite on a given team is that team's roster to
 * say, and the backend says it.
 */
function TeamsRoute({ children }: { children: React.ReactNode }) {
  const { loading, authState } = useAuth();
  const { teamSharing, loading: capLoading } = useCapabilities();

  if (loading || capLoading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (canUseTeams(teamSharing)) {
    return <>{children}</>;
  }

  return <Navigate to="/cases" replace />;
}

/**
 * The full-page composer, absent when chat lives in the extension (ADR-018 D3).
 *
 * The nav item goes with it, but a ROUTE needs its own guard: a bookmark, a
 * back button or a stale link would otherwise mount a second composer for
 * someone who has explicitly asked for one surface. It redirects rather than
 * refusing, because there is nothing wrong with the request — the surface has
 * simply moved, and `/cases` is where this person's work is.
 *
 * `replace`, so the back button does not bounce them straight back into it.
 */
export function ChatSurfaceRoute({ children }: { children: React.ReactNode }) {
  const prefersExtension = usePrefersExtensionForChat();
  if (prefersExtension) return <Navigate to="/cases" replace />;
  return <>{children}</>;
}

/**
 * The cross-tenant operator view, and its per-case content page (ADR-012 D9).
 *
 * Same predicate as the nav item, with NO extra clause of its own — that is the
 * whole invariant. Standalone is single-user, so this page could only show that
 * one account its own cases, and its content arm would write an operator-access
 * audit row for reading them.
 *
 * ‼ DO NOT ADD A WAIT FOR DEPLOYMENT DETECTION HERE. It looks obviously right —
 * `deployment` needs a `/auth/config` round trip, so why decide before it lands?
 * — and it is wrong twice over:
 *
 * 1. **There is no signal that means "detection has finished".**
 *    `configStatus` flips to `'unreachable'` after the FIRST failed attempt and
 *    only then runs the retry ladder (`CONFIG_RETRY_DELAYS_MS`, 1s + 3s), with a
 *    30s background reprobe after that. So `configStatus !== 'pending'` does not
 *    mean settled, and a gate keyed on it guesses through the entire ladder
 *    anyway — the window it was added to close.
 * 2. **Waiting costs the cloud operator more than guessing costs standalone.**
 *    A blank route for up to `CONFIG_FETCH_TIMEOUT_MS` (8s) on a blackholed
 *    host, a signed-out visitor held for a network round trip before being sent
 *    to login, and — because the nav item has no such wait — an offered link
 *    that leads to a blank page and then a redirect. That last one is exactly
 *    the nav/route drift that deleting `offersAllCasesNav` was meant to end.
 *
 * So both surfaces read the bare predicate and therefore agree in every state,
 * including the unconfirmed one (where it allows). The residual cost is a
 * standalone operator briefly seeing the item and the page while
 * `/auth/config` is down — which self-heals on the reprobe AuthContext already
 * runs for precisely this reason, and which the backend bounds anyway.
 */
function AllCasesRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, authState, deployment } = useAuth();

  if (loading) return null;

  // Before the deployment, because authentication is knowable without it: a
  // signed-out visitor should not wait on anything to be sent to login.
  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (canViewAllCases(deployment, isAdmin)) {
    return <>{children}</>;
  }

  return <Navigate to="/cases" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signin" element={<Navigate to="/login" replace />} />
            {/* Public by design, and NOT an alias of /login: it hands off to the
                hosted login's sign-up screen (website#42). See SignUpPage. */}
            <Route path="/signup" element={<SignUpPage />} />
            {/* Public by design: the SSO callback IS the login (no session exists yet). */}
            <Route path="/auth/sso/callback" element={<SSOCallbackPage />} />
            <Route path="/" element={<Navigate to="/cases" replace />} />
            <Route
              path="/auth/authorize"
              element={
                <ProtectedRoute>
                  <OAuthAuthorizePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cases"
              element={
                <ProtectedRoute>
                  <CaseListPage />
                </ProtectedRoute>
              }
            />
            {/* The built-in Copilot panel on a new investigation (ADR-016 D1,
                D6). Inside ProtectedRoute like every other authenticated route:
                the panel has no sign-in of its own and its host contract makes
                the session non-nullable, so there is no value it could be
                mounted with that lacks a signed-in user (D3). */}
            <Route
              path="/investigate"
              element={
                <ProtectedRoute>
                  <ChatSurfaceRoute>
                    <InvestigatePage />
                  </ChatSurfaceRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cases/:caseId"
              element={
                <ProtectedRoute>
                  <CaseDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/kb"
              element={
                <ProtectedRoute>
                  <KBPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/llm"
              element={
                <LLMConfigRoute>
                  <LLMConfigPage />
                </LLMConfigRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminProtectedRoute>
                  <UserManagementPage />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/teams"
              element={
                <TeamsRoute>
                  <TeamsPage />
                </TeamsRoute>
              }
            />
            <Route
              path="/admin/organization"
              element={
                <ManagementConsoleRoute>
                  <OrganizationPage />
                </ManagementConsoleRoute>
              }
            />
            <Route
              path="/admin/cases"
              element={
                <AllCasesRoute>
                  <AdminCaseListPage />
                </AllCasesRoute>
              }
            />
            {/* The operator's break-glass content view (ADR-012 D9). Behind the
                same guard as the list it is reached from: what differs between
                deployments is not who may reach the page but whether the
                backend answers without a grant. */}
            <Route
              path="/admin/cases/:caseId"
              element={
                <AllCasesRoute>
                  <AdminCaseContentPage />
                </AllCasesRoute>
              }
            />
            <Route path="*" element={<Navigate to="/cases" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
