// Authentication module exports

export { AuthManager, authManager } from './AuthManager';
export { devLogin, logoutAuth, getAvailableScopes, type PublishableScope } from './functions';
export { AuthenticationError, type AuthState } from './types';
