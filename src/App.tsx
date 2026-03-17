import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import CaseListPage from './pages/CaseListPage';
import CaseDetailPage from './pages/CaseDetailPage';
import LLMConfigPage from './pages/LLMConfigPage';
import UserManagementPage from './pages/UserManagementPage';
import OAuthAuthorizePage from './pages/OAuthAuthorizePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authState, loading, isAdmin } = useAuth();

  if (loading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/cases" replace />;
  }

  return <>{children}</>;
}

function LLMConfigRoute({ children }: { children: React.ReactNode }) {
  const { deployment, role, loading, authState } = useAuth();

  if (loading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (deployment === 'local' || role === 'platform_admin') {
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
            <Route path="*" element={<Navigate to="/cases" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
