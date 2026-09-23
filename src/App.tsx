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
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { usePrefersExtensionForChat } from './hooks/useChatSurface';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { GatedRoute } from './components/GatedRoute';
import { canManageConsole, canManageLlmConfig, canUseTeams, canViewAllCases } from './lib/access';

function LLMConfigRoute({ children }: { children: React.ReactNode }) {
  // No `requires`: `canManageLlmConfig` reads `isAdmin`, which resolves
  // synchronously from stored auth state, so there is no window to wait out.
  // Still routed through `GatedRoute` so the auth-first ordering is stated once.
  return <GatedRoute allow={({ isAdmin }) => canManageLlmConfig(isAdmin)}>{children}</GatedRoute>;
}

function ManagementConsoleRoute({ children }: { children: React.ReactNode }) {
  // BOTH fetches. `canManageConsole` reads the capability flag, and `role` is
  // derived from `deployment` — so waiting on `capLoading` alone, which is what
  // this guard used to do, left the whole deployment window open. And because the
  // capabilities fetch carried no timeout, `capLoading` could also blank the page
  // indefinitely: measured on `/admin/organization`, empty with no affordance
  // while `/admin/users` showed its retry card. The timeout is now in
  // `lib/meta/capabilities.ts`, and the ordering is `GatedRoute`'s.
  return (
    <GatedRoute
      requires={{ deployment: true, capabilities: true }}
      allow={({ managementConsole, role }) => canManageConsole(managementConsole, role)}
    >
      {children}
    </GatedRoute>
  );
}

/**
 * The Teams page is reachable by every signed-in account wherever the deployment
 * has teams (ADR-017 D4) — no role, matching the nav item so the two cannot
 * drift. Whether the caller may invite on a given team is that team's roster to
 * say, and the backend says it.
 */
function TeamsRoute({ children }: { children: React.ReactNode }) {
  // `capabilities`, because a FAILED capabilities fetch leaves `teamSharing`
  // false — the hook's defaults — which this predicate reads as "no teams here"
  // and the guard would turn into a redirect. Correct for rendering a feature
  // (ADR-019: absent reads as NO), wrong for deciding a page does not exist.
  return (
    <GatedRoute
      requires={{ capabilities: true }}
      allow={({ teamSharing }) => canUseTeams(teamSharing)}
    >
      {children}
    </GatedRoute>
  );
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
 * Same predicate as the nav item, and — ⛔ deliberately — NOTHING in `requires`.
 * `canViewAllCases` fails OPEN on a null deployment, so this guard has no
 * irreversible branch to protect, and waiting for detection would cost a cloud
 * operator up to 8s of blank screen while the nav item beside it still offered
 * the link. It is the one guard that decides immediately; `GatedRoute`'s
 * docstring says why that is a property of the predicate, not an oversight.
 *
 * Standalone is single-user, so this page could only show that one account its
 * own cases, and its content arm would write an operator-access audit row for
 * reading them.
 */
function AllCasesRoute({ children }: { children: React.ReactNode }) {
  return (
    <GatedRoute allow={({ deployment, isAdmin }) => canViewAllCases(deployment, isAdmin)}>
      {children}
    </GatedRoute>
  );
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
