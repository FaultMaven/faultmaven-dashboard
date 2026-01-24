// Browser storage adapter for authentication state

// Import storage adapter to initialize window.browser
import '../storage';

// Use the global browser object provided by storage adapter
declare global {
  interface Window {
    browser?: {
      storage: {
        local: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(items: Record<string, unknown>): Promise<void>;
          remove(keys: string[]): Promise<void>;
        };
      };
    };
  }
}

export const browser = typeof window !== 'undefined' ? window.browser : undefined;
