import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { devLogin } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthState } = useAuth();

  const isExtensionLogin = new URLSearchParams(location.search).get('source') === 'extension';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!password || password.length < 3) {
      setError('Password must be at least 3 characters');
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

      // 3. Update AuthContext (also persists via authManager)
      await setAuthState(authState);

      // 4. Check for OAuth redirect after login (MUST be before isExtensionLogin check)
      // This handles the flow: Extension → /auth/authorize → /login → back to /auth/authorize
      const oauthRedirect = sessionStorage.getItem('oauth_redirect_after_login');
      if (oauthRedirect) {
        sessionStorage.removeItem('oauth_redirect_after_login');
        navigate(oauthRedirect);
        return;
      }

      // 5. Handle extension login (when user logs in from extension without OAuth flow)
      if (isExtensionLogin) {
        setLoading(false);
        return;
      }

      // 6. Default redirect to KB
      navigate('/kb');
    } catch (err: unknown) {
      // Enhanced error handling with network-specific messages
      let errorMessage = 'Login failed. Please check your connection to the backend.';

      if (err instanceof Error) {
        errorMessage = err.message;
      }

      // Check if it's a network error (fetch failed)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorMessage = 'Could not reach API. Is the backend running on port 8090?';
      }

      setError(errorMessage);
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
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md relative">
        {/* Local Mode Badge */}
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
            LOCAL MODE ACTIVE
          </div>
          <div className="text-[10px] text-amber-700 text-right mt-1 font-medium">
            Authentication Bypassed
          </div>
        </div>

        {/* Logo and Header */}
        <div className="text-center mb-8 mt-6">
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
            FaultMaven Console
          </h1>
          <p className="text-gray-600">
            Authenticate to access the Knowledge Base, view case metrics, and launch the AI Copilot.
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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your password"
              disabled={loading}
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
      </div>
    </div>
  );
}
