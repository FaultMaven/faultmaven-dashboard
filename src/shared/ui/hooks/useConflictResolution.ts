/**
 * Conflict Resolution Hook
 *
 * Manages optimistic update conflict detection and resolution UI.
 * Extracted from SidePanelApp to reduce component complexity.
 */

import { useState, useCallback } from 'react';
import { ConflictDetectionResult, MergeResult } from '../../../lib/optimistic';
import { ConflictResolution } from '../components/ConflictResolutionModal';
import { createLogger } from '../../../lib/utils/logger';

const log = createLogger('ConflictResolution');

interface ConflictResolutionState {
  isOpen: boolean;
  conflict: ConflictDetectionResult | null;
  localData: any;
  remoteData: any;
  mergeResult?: MergeResult<any>;
  resolveCallback?: (resolution: ConflictResolution) => void;
}

export function useConflictResolution() {
  const [state, setState] = useState<ConflictResolutionState>({
    isOpen: false,
    conflict: null,
    localData: null,
    remoteData: null
  });

  const showConflictResolution = useCallback((
    conflict: ConflictDetectionResult,
    localData: any,
    remoteData: any,
    mergeResult?: MergeResult<any>
  ): Promise<ConflictResolution> => {
    log.info('Showing conflict resolution UI', {
      conflictType: conflict.conflictType,
      hasAutoMerge: !!mergeResult
    });

    return new Promise((resolve) => {
      setState({
        isOpen: true,
        conflict,
        localData,
        remoteData,
        mergeResult,
        resolveCallback: resolve
      });
    });
  }, []);

  const handleConflictResolution = useCallback((resolution: ConflictResolution) => {
    log.info('Conflict resolved', { choice: resolution.choice });

    if (state.resolveCallback) {
      state.resolveCallback(resolution);
    }

    setState(prev => ({
      ...prev,
      isOpen: false,
      resolveCallback: undefined
    }));
  }, [state.resolveCallback]);

  const cancelConflictResolution = useCallback(() => {
    log.info('Conflict resolution cancelled - keeping local');

    if (state.resolveCallback) {
      state.resolveCallback({ choice: 'keep_local' });
    }

    setState(prev => ({
      ...prev,
      isOpen: false,
      resolveCallback: undefined
    }));
  }, [state.resolveCallback]);

  return {
    conflictResolutionData: state,
    showConflictResolution,
    handleConflictResolution,
    cancelConflictResolution
  };
}
