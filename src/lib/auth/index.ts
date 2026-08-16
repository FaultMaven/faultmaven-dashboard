// Authentication module exports

export { AuthManager, authManager } from './AuthManager';
export {
  devLogin,
  ssoExchange,
  logoutAuth,
  getAvailableScopes,
  getAccountProfile,
  SIGNOUT_NOTICE_KEY,
  type PublishableScope,
  type LogoutOutcome,
  type AccountProfile,
  type AccountOrganization,
} from './functions';
export { AuthenticationError, type AuthState } from './types';
