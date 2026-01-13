// API Error classes

/**
 * Base API error class
 *
 * Provides structured error information including HTTP status code,
 * error code, and additional details.
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIError';
  }

  /**
   * Whether this error is retriable (5xx or 429)
   */
  get isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  /**
   * Whether this is a client error (4xx)
   */
  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Whether this is a server error (5xx)
   */
  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

/**
 * Network error (failed to reach server)
 */
export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Helper function to handle API responses and throw appropriate errors
 *
 * @param response - Fetch response
 * @param defaultMessage - Default error message if response doesn't provide one
 * @throws {APIError} If response is not ok
 */
export async function handleAPIResponse(
  response: Response,
  defaultMessage = 'API request failed'
): Promise<void> {
  if (!response.ok) {
    // Try to parse error response
    let errorData: { detail?: string; message?: string; error?: string } | null = null;
    try {
      errorData = await response.json();
    } catch {
      // Response body is not JSON or empty
    }

    const message = errorData?.detail || errorData?.message || errorData?.error || defaultMessage;

    throw new APIError(
      message,
      response.status,
      response.statusText,
      errorData ? (errorData as Record<string, unknown>) : undefined
    );
  }
}
