/**
 * Higher-order function to wrap API calls with error handling
 *
 * Usage:
 *   const result = await withErrorHandling(
 *     () => apiCall(),
 *     { showError, context: 'operation_name' }
 *   );
 */

import { classifyError, formatErrorForAlert } from './api-error-handler';
import { createLogger } from './logger';

const log = createLogger('withErrorHandling');

export interface ErrorHandlingOptions {
  /** Function to display error to user */
  showError: (message: string) => void;

  /** Context/operation name for logging */
  context: string;

  /** Called when auth error detected */
  onAuthError?: () => void;

  /** If true, rethrows error after handling */
  rethrow?: boolean;

  /** If true, suppresses error UI (only logs) */
  silent?: boolean;
}

/**
 * Wraps an async API call with standardized error handling
 */
export async function withErrorHandling<T>(
  apiCall: () => Promise<T>,
  options: ErrorHandlingOptions
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    // Classify the error
    const errorInfo = classifyError(error, options.context);

    // Log the error
    log.error(`${options.context} failed:`, {
      type: errorInfo.type,
      message: errorInfo.technicalMessage
    });

    // Handle auth errors
    if (errorInfo.shouldLogout && options.onAuthError) {
      options.onAuthError();
    }

    // Show error to user (unless silent)
    if (!options.silent) {
      options.showError(formatErrorForAlert(errorInfo));
    }

    // Rethrow if requested
    if (options.rethrow) {
      throw error;
    }

    return null;
  }
}

/**
 * Wraps a sync API call with error handling
 */
export function withErrorHandlingSync<T>(
  apiCall: () => T,
  options: ErrorHandlingOptions
): T | null {
  try {
    return apiCall();
  } catch (error) {
    // Classify the error
    const errorInfo = classifyError(error, options.context);

    // Log the error
    log.error(`${options.context} failed:`, {
      type: errorInfo.type,
      message: errorInfo.technicalMessage
    });

    // Handle auth errors
    if (errorInfo.shouldLogout && options.onAuthError) {
      options.onAuthError();
    }

    // Show error to user (unless silent)
    if (!options.silent) {
      options.showError(formatErrorForAlert(errorInfo));
    }

    // Rethrow if requested
    if (options.rethrow) {
      throw error;
    }

    return null;
  }
}
