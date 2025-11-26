import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { devLogin } from '../lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtensionLogin, setIsExtensionLogin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('source') === 'extension') {
      setIsExtensionLogin(true);
    }
  }, [location]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const authState = await devLogin(username.trim());
      
      // 1. Dispatch event for Extension Auth Bridge (primary method)
      window.postMessage({
        type: 'FM_AUTH_SUCCESS',
        payload: authState
      }, window.location.origin);

      // 2. Store in localStorage for Extension Auth Bridge (fallback method)
      localStorage.setItem('fm_auth_state', JSON.stringify(authState));

      // Auth manager will handle internal storage via storage adapter

    if (isExtensionLogin) {
      // Show success message for extension users
      setLoading(false); // Stop loading indicator
      return; // Stop execution, don't redirect
    } else {
      navigate('/kb');
    }
  } catch (err: any) {
    setError(err.message || 'Login failed. Please check your connection to the backend.');
    setLoading(false);
  }
};

if (isExtensionLogin && localStorage.getItem('fm_auth_state') && !loading && !error) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Sign in Successful!</h2>
        <p className="text-gray-600 mb-6">
          You have successfully authenticated with FaultMaven. You can now close this tab and return to the browser extension.
        </p>
        <button 
          onClick={() => window.close()}
          className="px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          Close Tab
        </button>
      </div>
    </div>
  );
}

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            FaultMaven System
          </h1>
          <p className="text-gray-600">
            Sign in to access Knowledge Base or Copilot
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Development mode: any username works</p>
        </div>
      </div>
    </div>
  );
}
