// Ambient type for the `window.browser` storage shim.
//
// The runtime shim itself is installed by `lib/storage.ts` (imported for
// side-effects in main.tsx). This file only augments the global `Window` type
// so `window.browser` is typed wherever AuthManager reads it — it is a
// declaration-only module (no runtime export).
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

// Declaration-only module: `export {}` keeps it a module (so `declare global`
// augments rather than replaces the global scope) without exporting runtime code.
export {};
