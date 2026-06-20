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
 * 3. Dynamic (Development / self-hosted): Auto-detect based on window.location.hostname
 *    - Uses the SAME host that served the dashboard (localhost, 127.0.0.1, or a
 *      LAN IP / hostname such as 192.168.0.200), with the backend on port 8090.
 *    - Keeps the API on the machine the user actually reached the dashboard at, so
 *      opening http://192.168.0.200:3333 targets http://192.168.0.200:8090
 *      (NOT 127.0.0.1, which would point at the user's own machine).
 *
 * Other Environment Variables (set before build):
 * - VITE_DATA_MODE_LINES: Lines threshold for data mode (default: 100)
 * - VITE_MAX_QUERY_LENGTH: Max input characters (default: 200000 = 200KB, matches backend)
 * - VITE_MAX_FILE_SIZE_MB: Max file size in MB (default: 10, matches backend MAX_UPLOAD_SIZE_MB)
 */
const runtimeEnv = (globalThis as { ENV?: { API_URL?: string } }).ENV;

/**
 * Resolve the backend API base URL. The dashboard appends `/api/v1/...` to this
 * value, so it must be an origin (scheme://host[:port]) or an empty string —
 * never a path prefix like "/api".
 *
 * Resolution order:
 *  1. Runtime injection (window.ENV.API_URL, written by inject-config.sh). An
 *     EXPLICITLY-SET value wins, INCLUDING the empty string: "" means "same
 *     origin" (relative `/api/v1/...`), used by the cloud reverse-proxy model
 *     where the dashboard and API share an origin and `/api/*` is proxied to the
 *     backend. A non-empty value is an absolute origin for split-host setups.
 *  2. Build-time VITE_API_URL (rarely used; the shipped image bakes nothing).
 *  3. Same-host detection: the API is assumed to be on the host that served the
 *     dashboard, at port 8090. Covers localhost, 127.0.0.1, and LAN IPs /
 *     hostnames (e.g. a self-hosted box at 192.168.0.200), so the copilot's
 *     "Open Dashboard" link to http://192.168.0.200:3333 signs in against
 *     http://192.168.0.200:8090 with zero per-host config.
 *
 * Note on (1): an UNSET API_URL (key absent — the self-hosted default) falls
 * through to same-host detection; only an explicitly-set key (even "") is
 * authoritative. This is why the check is key-presence, not truthiness.
 */
function getApiUrl(): string {
  // Priority 1: Runtime injection — honour an explicitly-set key (even empty).
  if (
    runtimeEnv &&
    Object.prototype.hasOwnProperty.call(runtimeEnv, 'API_URL') &&
    typeof runtimeEnv.API_URL === 'string'
  ) {
    return runtimeEnv.API_URL;
  }

  // Priority 2: Build-time environment variable (production)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Priority 3: Same-host detection — backend on the host that served the dashboard
  if (typeof window !== 'undefined' && window.location.hostname) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8090`;
  }

  // Fallback (non-browser context, e.g. tests/SSR): default local development URL
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
