// Authentication types and interfaces

/**
 * Authentication state stored in browser storage
 */
export interface AuthState {
  access_token: string;
  token_type: 'bearer';
  expires_at: number;
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    is_dev_user: boolean;
    is_active: boolean;
    roles?: string[];
    is_admin?: boolean;
  };
}

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
