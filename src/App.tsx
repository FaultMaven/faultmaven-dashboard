import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
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
function ChatSurfaceRoute({ children }: { children: React.ReactNode }) {
  const prefersExtension = usePrefersExtensionForChat();
  if (prefersExtension) return <Navigate to="/cases" replace />;
  return <>{children}</>;
}

function AllCasesRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, authState } = useAuth();

  if (loading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (canViewAllCases(isAdmin)) {
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
