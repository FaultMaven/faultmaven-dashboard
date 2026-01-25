// src/config.ts

interface InputLimitsConfig {
  /** Smart detection threshold: text >= this many lines is treated as data upload */
  dataModeLinesThreshold: number;
  /** Maximum character length for input */
  maxQueryLength: number;
  /** Textarea auto-sizing minimum rows */
  textareaMinRows: number;
  /** Textarea auto-sizing maximum rows */
  textareaMaxRows: number;
  /** Maximum file upload size in bytes */
  maxFileSize: number;
  /** Allowed file extensions for upload */
  allowedFileExtensions: readonly string[];
  /** Allowed MIME types for uploaded files */
  allowedMimeTypes: readonly string[];
}

interface Config {
  apiUrl: string;
  inputLimits: InputLimitsConfig;
}

/**
 * Application Configuration
 *
 * Configuration Sources (in priority order):
 * 1. Runtime (Docker/K8s): window.ENV.API_URL - injected at container startup
 * 2. Build-time: VITE_API_URL - for production/staging builds
 * 3. Dynamic (Development): Auto-detect based on window.location.hostname
 *    - LOCALHOST ONLY: Supports localhost and 127.0.0.1
 *    - For remote servers, use SSH tunnel: ssh -L 3333:localhost:3333 -L 8090:localhost:8090 user@server
 *    - Backend API runs on same host at port 8090
 *
 * Other Environment Variables (set before build):
 * - VITE_DATA_MODE_LINES: Lines threshold for data mode (default: 100)
 * - VITE_MAX_QUERY_LENGTH: Max input characters (default: 200000 = 200KB, matches backend)
 * - VITE_MAX_FILE_SIZE_MB: Max file size in MB (default: 10, matches backend MAX_UPLOAD_SIZE_MB)
 */
const runtimeEnv = (globalThis as { ENV?: { API_URL?: string } }).ENV;

/**
 * Dynamically determine API URL based on current hostname
 *
 * LOCALHOST ONLY DEPLOYMENT:
 * - Supports localhost and 127.0.0.1 only
 * - For remote servers, use SSH tunnel to keep localhost addressing
 * - Example: ssh -L 3333:localhost:3333 -L 8090:localhost:8090 user@server
 */
function getApiUrl(): string {
  // Priority 1: Runtime config (Docker/K8s injection)
  if (runtimeEnv?.API_URL) {
    return runtimeEnv.API_URL;
  }

  // Priority 2: Build-time environment variable (production)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Priority 3: Dynamic detection for localhost development
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    // LOCALHOST ONLY: Support localhost and 127.0.0.1
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1';

    if (isLocalhost) {
      // Backend API is on same host at port 8090
      return `${protocol}//${hostname}:8090`;
    }
  }

  // Fallback: Default local development URL
  return "http://127.0.0.1:8090";
}

const config: Config = {
  // API Configuration with dynamic detection
  apiUrl: getApiUrl(),

  // Input Limits Configuration
  inputLimits: {
    dataModeLinesThreshold: parseInt(import.meta.env.VITE_DATA_MODE_LINES || '100', 10),
    // Match backend QueryRequest.query max_length=200000 (200KB)
    maxQueryLength: parseInt(import.meta.env.VITE_MAX_QUERY_LENGTH || '200000', 10),
    textareaMinRows: 2,
    textareaMaxRows: 8,
    // Match backend MAX_UPLOAD_SIZE_MB=10
    maxFileSize: (parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024,
    allowedFileExtensions: ['.txt', '.log', '.json', '.csv', '.md'],
    allowedMimeTypes: ['text/plain', 'text/markdown', 'application/json', 'text/csv'],
  },
};

export default config;
