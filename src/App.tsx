import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import AdminKBPage from './pages/AdminKBPage';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  // Check if user is authenticated
  const authStateStr = localStorage.getItem('faultmaven_authState');

  if (!authStateStr) {
    return <Navigate to="/login" replace />;
  }

  // Parse and validate auth state
  let authState;
  try {
    authState = JSON.parse(authStateStr);
  } catch {
    return <Navigate to="/login" replace />;
  }

  // Check if token is expired
  if (Date.now() >= authState.expires_at) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin) {
    // Check if user is admin
    const isAdmin = authState.user?.roles?.includes('admin') || authState.user?.is_admin;
    if (!isAdmin) {
      return <Navigate to="/kb" replace />;
    }
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/kb" replace />} />
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
            <ProtectedRoute requireAdmin>
              <AdminKBPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/kb" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
