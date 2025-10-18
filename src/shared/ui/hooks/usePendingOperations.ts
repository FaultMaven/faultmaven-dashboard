/**
 * Pending Operations Hook
 *
 * Manages failed operations and retry logic.
 * Extracted from SidePanelApp to reduce component complexity.
 */

import { useCallback } from 'react';
import { pendingOpsManager, PendingOperation } from '../../../lib/optimistic';
import { createLogger } from '../../../lib/utils/logger';

const log = createLogger('PendingOperations');

interface OperationError {
  title: string;
  message: string;
  recoveryHint: string;
}

export function usePendingOperations(
  activeCaseId: string | undefined,
  onError: (error: any, context?: any) => void
) {
  const getFailedOperationsForUser = useCallback((): PendingOperation[] => {
    return pendingOpsManager.getByStatus('failed').filter(op =>
      // Only show operations that affect current context
      op.type === 'create_case' && op.optimisticData?.case_id === activeCaseId ||
      op.type === 'submit_query' && op.optimisticData?.caseId === activeCaseId ||
      op.type === 'update_title' && op.optimisticData?.caseId === activeCaseId
    );
  }, [activeCaseId]);

  const handleUserRetry = useCallback(async (operationId: string) => {
    try {
      log.info('User triggered retry', { operationId });
      await pendingOpsManager.retry(operationId);
      log.info('Retry successful', { operationId });
    } catch (error) {
      log.error('Retry failed', error);
      onError(error, { operation: 'retry_operation', metadata: { operationId } });
    }
  }, [onError]);

  const handleDismissFailedOperation = useCallback((operationId: string) => {
    log.info('User dismissed failed operation', { operationId });
    pendingOpsManager.remove(operationId);
  }, []);

  const getErrorMessageForOperation = useCallback((operation: PendingOperation): OperationError => {
    const baseError = operation.error || 'An unknown error occurred';

    switch (operation.type) {
      case 'create_case':
        return {
          title: 'Failed to Create Chat',
          message: baseError,
          recoveryHint: 'Check your internet connection and try again. If the problem persists, refresh the page.'
        };
      case 'submit_query':
        return {
          title: 'Failed to Send Message',
          message: baseError,
          recoveryHint: 'Your message was not sent. Try sending it again or check your connection.'
        };
      case 'update_title':
        return {
          title: 'Failed to Update Title',
          message: baseError,
          recoveryHint: 'The title change was not saved. You can try again or continue without changing it.'
        };
      default:
        return {
          title: 'Operation Failed',
          message: baseError,
          recoveryHint: 'Please try again or contact support if the issue persists.'
        };
    }
  }, []);

  return {
    getFailedOperationsForUser,
    handleUserRetry,
    handleDismissFailedOperation,
    getErrorMessageForOperation
  };
}
