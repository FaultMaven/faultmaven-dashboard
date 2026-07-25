import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import CaseListPage from './pages/CaseListPage';
import CaseDetailPage from './pages/CaseDetailPage';
import LLMConfigPage from './pages/LLMConfigPage';
import UserManagementPage from './pages/UserManagementPage';
import OrgTeamManagementPage from './pages/OrgTeamManagementPage';
import AdminCaseListPage from './pages/AdminCaseListPage';
import OAuthAuthorizePage from './pages/OAuthAuthorizePage';
import SSOCallbackPage from './pages/SSOCallbackPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useCapabilities } from './hooks/useCapabilities';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { canManageConsole, canManageLlmConfig, canViewAllCases } from './lib/access';

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

function AllCasesRoute({ children }: { children: React.ReactNode }) {
  const { deployment, isAdmin, loading, authState } = useAuth();

  if (loading) return null;

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
              path="/admin/organization"
              element={
                <ManagementConsoleRoute>
                  <OrgTeamManagementPage />
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
            <Route path="*" element={<Navigate to="/cases" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
