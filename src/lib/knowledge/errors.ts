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
/**
 * A human sentence out of `detail`, whatever shape it arrived in.
 *
 * `detail` IS NOT ALWAYS A STRING, and treating it as one put
 * `[object Object]` in front of users. Three shapes reach this client:
 *
 *  - a plain string, which most of the API's own refusals send;
 *  - the backend's `ErrorResponse` — `{schema_version, error: {code, message}}`
 *    — which is what `HTTPException(..., detail=ErrorResponse(...).model_dump())`
 *    produces, and what an inverted creation-date window now returns (422);
 *  - FastAPI's own validation array, `[{loc, msg, type}, ...]`, for a parameter
 *    the route could not parse at all.
 *
 * Only the first was handled. The other two fell through `errorData?.detail ||
 * …` as truthy objects and were stringified by `new Error(...)`, so the case
 * list rendered a banner reading exactly `[object Object]` — verified by
 * executing the expression against the real 422 body. A user who swapped the
 * ends of a date range got no usable word about it.
 *
 * Returns `undefined` rather than a placeholder when nothing readable is there,
 * so the caller's own fallback chain still runs.
 */
function readDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail || undefined;

  if (Array.isArray(detail)) {
    // FastAPI validation errors: join the messages, which name the offending
    // field between them. `loc` is dropped — it is wire vocabulary
    // (`["query", "created_after"]`), not something to show a user.
    const messages = detail
      .map((item) => (item && typeof item === 'object' ? (item as { msg?: unknown }).msg : null))
      .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
    return messages.length ? messages.join('; ') : undefined;
  }

  if (detail && typeof detail === 'object') {
    const error = (detail as { error?: unknown }).error;
    if (error && typeof error === 'object') {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return undefined;
}

export async function handleAPIResponse(
  response: Response,
  defaultMessage = 'API request failed'
): Promise<void> {
  if (!response.ok) {
    // Try to parse error response
    let errorData: {
      detail?: unknown;
      message?: string;
      error?: string;
      error_code?: string;
    } | null = null;
    try {
      errorData = await response.json();
    } catch {
      // Response body is not JSON or empty
    }

    const message =
      readDetail(errorData?.detail)
      || errorData?.message
      || errorData?.error
      || defaultMessage;
    // Prefer the machine-readable code the backend sends in the body; the HTTP
    // statusText ("Bad Request") is a reason phrase, not an error code, and is
    // often blank over HTTP/2.
    const errorCode = errorData?.error_code || response.statusText || undefined;

    throw new APIError(
      message,
      response.status,
      errorCode,
      errorData ? (errorData as Record<string, unknown>) : undefined
    );
  }
}
