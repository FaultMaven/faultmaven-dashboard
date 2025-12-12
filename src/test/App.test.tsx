import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

// Mock the API calls and auth manager
vi.mock('../lib/api', () => {
  return {
    devLogin: vi.fn(),
    logoutAuth: vi.fn(),
    uploadDocument: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 0, offset: 0 }),
    deleteDocument: vi.fn(),
    uploadAdminDocument: vi.fn(),
    listAdminDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 0, offset: 0 }),
    deleteAdminDocument: vi.fn(),
    authManager: {
      getAuthState: vi.fn().mockResolvedValue(null),
      saveAuthState: vi.fn(),
      clearAuthState: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
    },
    config: { apiUrl: 'http://localhost:8000' },
    AuthenticationError: class AuthenticationError extends Error {
      constructor(message: string) { super(message); this.name = 'AuthenticationError'; }
    },
  };
});

describe('App Smoke Tests', () => {
  it('renders without crashing', async () => {
    await act(async () => {
      render(<App />);
    });

    // Intentional failure for CI gate verification (will be reverted)
    expect(true).toBe(false);
  });

  it('redirects to login page when unauthenticated', async () => {
    // Ensure local storage is empty
    localStorage.clear();
    
    await act(async () => {
      render(<App />);
    });
    
    // Check for login page elements
    expect(await screen.findByText(/Sign in to access Knowledge Base/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
  });
});
