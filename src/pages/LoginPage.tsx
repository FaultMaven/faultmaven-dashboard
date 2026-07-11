import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { devLogin } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const inputClass = 'w-full px-4 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { deployment, setAuthState } = useAuth();

  const isStandalone = deployment !== 'cloud';
  const isExtensionLogin = new URLSearchParams(location.search).get('source') === 'extension';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!isStandalone && (!password || password.length < 3)) {
      setError('Password must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const authState = await devLogin(username.trim());

      window.postMessage({
        type: 'FM_AUTH_SUCCESS',
        payload: authState
      }, window.location.origin);

      localStorage.setItem('fm_auth_state', JSON.stringify(authState));
      await setAuthState(authState);

      const oauthRedirect = sessionStorage.getItem('oauth_redirect_after_login');
      if (oauthRedirect) {
        sessionStorage.removeItem('oauth_redirect_after_login');
        navigate(oauthRedirect);
        return;
      }

      if (isExtensionLogin) {
        setLoading(false);
        return;
      }

      navigate('/kb');
    } catch (err: unknown) {
      let errorMessage = 'Login failed. Please check your connection to the backend.';

      if (err instanceof Error) {
        errorMessage = err.message;
      }

      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorMessage = 'Could not reach API. Is the backend running on port 8090?';
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  if (isExtensionLogin && localStorage.getItem('fm_auth_state') && !loading && !error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-fm-success-bg text-fm-success rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-fm-text-primary mb-2">Sign in Successful!</h2>
          <p className="text-fm-text-secondary mb-6">
            You have successfully authenticated with FaultMaven. You can now close this tab and return to the browser extension.
          </p>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-fm-elevated text-fm-text-secondary font-medium rounded-fm-btn hover:bg-fm-surface-alt transition-colors"
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
      <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md relative">
        {/* Local Mode Badge — only for a confirmed standalone backend, never cloud */}
        {deployment === 'standalone' && (
          <div className="absolute top-4 right-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-fm-warning-bg text-fm-warning text-xs font-semibold rounded-full border border-fm-warning-border">
              <span className="w-2 h-2 bg-fm-warning rounded-full animate-pulse-dot"></span>
              LOCAL MODE ACTIVE
            </div>
            <div className="text-fm-xs text-fm-text-tertiary text-right mt-1 font-medium">
              Authentication Bypassed
            </div>
          </div>
        )}

        {/* Logo and Header */}
        <div className="text-center mb-8 mt-6">
          <img src="/icon/design-transparent.svg" alt="FaultMaven — Always on call" className="h-12 mx-auto mb-6" />
          <p className="text-fm-text-secondary">
            Authenticate to access the Knowledge Base, view case metrics, and launch the AI Copilot.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-fm-text-secondary mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-fm-text-secondary mb-2">
              Password{isStandalone && <span className="text-fm-text-tertiary font-normal ml-1">(optional)</span>}
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border p-3 rounded-fm-btn">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-fm-accent text-white font-medium rounded-fm-btn hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
