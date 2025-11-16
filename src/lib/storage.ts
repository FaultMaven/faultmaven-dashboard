/**
 * Storage Adapter for Web Application
 * Provides localStorage-based storage compatible with the API client's expectations
 */

interface StorageData {
  [key: string]: any;
}

class LocalStorageAdapter {
  async get(keys: string[]): Promise<StorageData> {
    const result: StorageData = {};
    for (const key of keys) {
      const value = localStorage.getItem(`faultmaven_${key}`);
      if (value !== null) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      }
    }
    return result;
  }

  async set(items: StorageData): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(`faultmaven_${key}`, serialized);
    }
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) {
      localStorage.removeItem(`faultmaven_${key}`);
    }
  }
}

// Create a browser-like storage interface for web
export const storage = {
  local: new LocalStorageAdapter()
};

// Make it available globally for the API client
if (typeof window !== 'undefined') {
  (window as any).browser = { storage };
}
