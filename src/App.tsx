import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import AdminKBPage from './pages/AdminKBPage';
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
    return <Navigate to="/kb" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signin" element={<Navigate to="/login" replace />} />
            <Route path="/" element={<Navigate to="/kb" replace />} />
            <Route
              path="/auth/authorize"
              element={
                <ProtectedRoute>
                  <OAuthAuthorizePage />
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
              path="/admin/kb"
              element={
                <AdminProtectedRoute>
                  <AdminKBPage />
                </AdminProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/kb" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
