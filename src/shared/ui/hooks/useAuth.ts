/**
 * Authentication Hook
 *
 * Manages authentication state and operations.
 * Extracted from SidePanelApp to reduce component complexity.
 */

import { useState, useEffect, useCallback } from 'react';
import { devLogin, logoutAuth, authManager, AuthenticationError } from '../../../lib/api';
import { createLogger } from '../../../lib/utils/logger';

const log = createLogger('Auth');

interface AuthState {
  isAuthenticated: boolean;
  loginUsername: string;
  loggingIn: boolean;
  error: string | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    loginUsername: '',
    loggingIn: false,
    error: null
  });

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await authManager.isAuthenticated();
        setAuthState(prev => ({ ...prev, isAuthenticated: isAuth }));
        log.debug('Auth status checked', { isAuthenticated: isAuth });
      } catch (error) {
        log.error('Auth check failed', error);
      }
    };

    checkAuth();
  }, []);

  // Listen for authentication errors from storage changes (when auth state is cleared)
  useEffect(() => {
    const handleStorageChange = (changes: any) => {
      // Check if authState was removed (user logged out or session expired)
      if (changes.authState && !changes.authState.newValue && changes.authState.oldValue) {
        log.warn('Auth state cleared - logging out user');

        setAuthState({
          isAuthenticated: false,
          loginUsername: '',
          loggingIn: false,
          error: 'Your session has expired. Please log in again.'
        });
      }
    };

    // Listen for storage changes
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.onChanged.addListener(handleStorageChange);

      return () => {
        browser.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  const login = useCallback(async (username: string) => {
    setAuthState(prev => ({ ...prev, loggingIn: true, error: null }));

    try {
      log.info('Attempting login', { username });
      await devLogin(username);

      setAuthState({
        isAuthenticated: true,
        loginUsername: '',
        loggingIn: false,
        error: null
      });

      log.info('Login successful');
      return true;
    } catch (error) {
      const errorMessage = error instanceof AuthenticationError
        ? error.message
        : 'Login failed. Please try again.';

      log.error('Login failed', error);
      setAuthState(prev => ({
        ...prev,
        loggingIn: false,
        error: errorMessage
      }));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      log.info('Attempting logout');
      await logoutAuth();

      setAuthState({
        isAuthenticated: false,
        loginUsername: '',
        loggingIn: false,
        error: null
      });

      log.info('Logout successful');
    } catch (error) {
      log.error('Logout failed', error);
      throw error;
    }
  }, []);

  const setLoginUsername = useCallback((username: string) => {
    setAuthState(prev => ({ ...prev, loginUsername: username }));
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    isAuthenticated: authState.isAuthenticated,
    loginUsername: authState.loginUsername,
    loggingIn: authState.loggingIn,
    authError: authState.error,
    login,
    logout,
    setLoginUsername,
    clearAuthError
  };
}
