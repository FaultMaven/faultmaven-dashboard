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
 * A human sentence out of a refusal body, built against bodies that were
 * CAPTURED FROM THE SERVER rather than imagined.
 *
 * The first version of this was written against two shapes this API does not
 * send, and its commit message claimed they had been measured. They had not: a
 * body was reconstructed in Node from an assumption and the assumption was then
 * tested against itself. What the server actually puts on the wire, with the
 * handlers `main.py` registers (`http_exception_handler` and
 * `request_validation_exception_handler` — note that `get_exception_handlers()`
 * returns NEITHER, so a test app built from it sees raw FastAPI instead):
 *
 *   inverted date window   {"detail": "created_after must not be later than …"}
 *   unparseable datetime   {"detail": "Validation error",
 *                           "errors": [{loc, msg, type, input}, …]}
 *
 * So `detail` arrives as a STRING in both cases. `[object Object]` was never
 * reachable from those endpoints, and the pre-existing chain already rendered
 * the first one correctly.
 *
 * THE REAL GAP IS THE SECOND. `detail` is the useless constant "Validation
 * error" while every word that identifies the offending parameter sits in
 * `errors`, which nothing read — so a mistyped date produced a banner saying
 * "Validation error" and nothing else.
 *
 * The non-string branch remains as a GUARD, not as a claim: it is not known to
 * be reachable through these handlers, and it exists only so that a body from
 * somewhere that bypasses them can never render as `[object Object]`.
 */
function readValidationErrors(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  const messages = errors
    .map((item) => (item && typeof item === 'object' ? (item as { msg?: unknown }).msg : null))
    .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
  return messages.length ? messages.join('; ') : undefined;
}

function readDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail || undefined;
  if (detail === null || detail === undefined) return undefined;

  // Defensive only — see the note above. Never stringify an object wholesale.
  if (Array.isArray(detail)) return readValidationErrors(detail);
  if (typeof detail === 'object') {
    const nested = (detail as { error?: unknown }).error;
    if (nested && typeof nested === 'object') {
      const message = (nested as { message?: unknown }).message;
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
      errors?: unknown;
      message?: string;
      error?: string;
      error_code?: string;
    } | null = null;
    try {
      errorData = await response.json();
    } catch {
      // Response body is not JSON or empty
    }

    // `errors` FIRST when it carries anything: a validation refusal puts the
    // constant "Validation error" in `detail` and the words that identify the
    // offending parameter in `errors`, so preferring `detail` would show the
    // useless half of a body that contains the useful half.
    const message =
      readValidationErrors(errorData?.errors)
      || readDetail(errorData?.detail)
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
