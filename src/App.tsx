import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import AdminKBPage from './pages/AdminKBPage';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  // Check if user is authenticated
  const authToken = localStorage.getItem('faultmaven_authToken');

  if (!authToken) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin) {
    // Check if user is admin (you can enhance this logic based on your auth system)
    const authState = localStorage.getItem('faultmaven_authState');
    if (authState) {
      try {
        const parsed = JSON.parse(authState);
        if (!parsed.is_admin) {
          return <Navigate to="/kb" replace />;
        }
      } catch {
        return <Navigate to="/kb" replace />;
      }
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
