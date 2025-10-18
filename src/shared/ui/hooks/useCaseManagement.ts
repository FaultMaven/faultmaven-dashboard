/**
 * useCaseManagement Hook
 *
 * Manages case lifecycle with session-based lazy creation pattern.
 * Implements the pattern from FRONTEND_IMPLEMENTATION_GUIDE.md
 *
 * Key responsibilities:
 * - Lazy case creation on first action (query or upload)
 * - Case reuse within session
 * - Persistence across browser reloads
 * - Idempotent case creation (prevents duplicates)
 */

import { useState, useCallback, useRef } from 'react';
import { browser } from 'wxt/browser';
import { createLogger } from '../../../lib/utils/logger';

const log = createLogger('useCaseManagement');

interface CaseManagementState {
  currentCaseId: string | null;
  isCreatingCase: boolean;
}

interface CaseCreationResponse {
  case_id: string;
  title: string;
  created_at: string;
  session_id: string;
}

export function useCaseManagement(sessionId: string | null) {
  const [state, setState] = useState<CaseManagementState>({
    currentCaseId: null,
    isCreatingCase: false
  });

  // Track in-flight case creation to prevent duplicate calls
  const caseCreationPromise = useRef<Promise<string> | null>(null);

  /**
   * Ensures a case exists for the current session.
   *
   * Flow:
   * 1. Check memory (currentCaseId state) → Return if exists
   * 2. Check localStorage (persisted across reloads) → Return if exists
   * 3. Call backend /cases/sessions/{session_id}/case → Return new ID
   *
   * This is idempotent - multiple concurrent calls return the same case_id.
   */
  const ensureCaseExists = useCallback(async (): Promise<string> => {
    // Guard: Require session
    if (!sessionId) {
      throw new Error('Cannot create case without session');
    }

    // Step 1: Check memory
    if (state.currentCaseId) {
      log.debug('Case exists in memory:', state.currentCaseId);
      return state.currentCaseId;
    }

    // Step 2: Check localStorage (survives reloads)
    try {
      const stored = await browser.storage.local.get(['active_case_id']);
      if (stored.active_case_id) {
        log.debug('Case restored from storage:', stored.active_case_id);
        setState(prev => ({ ...prev, currentCaseId: stored.active_case_id }));
        return stored.active_case_id;
      }
    } catch (error) {
      log.warn('Failed to read from storage:', error);
    }

    // Step 3: Check if case creation is already in progress
    if (caseCreationPromise.current) {
      log.debug('Case creation already in progress, waiting...');
      return await caseCreationPromise.current;
    }

    // Step 4: Create new case via backend
    log.info('No case exists, creating new case for session:', sessionId);
    setState(prev => ({ ...prev, isCreatingCase: true }));

    const creationPromise = createCaseForSession(sessionId);
    caseCreationPromise.current = creationPromise;

    try {
      const caseId = await creationPromise;

      // Persist to storage
      await browser.storage.local.set({ active_case_id: caseId });

      setState({
        currentCaseId: caseId,
        isCreatingCase: false
      });

      log.info('Case created successfully:', caseId);
      return caseId;
    } catch (error) {
      setState(prev => ({ ...prev, isCreatingCase: false }));
      log.error('Case creation failed:', error);
      throw error;
    } finally {
      caseCreationPromise.current = null;
    }
  }, [sessionId, state.currentCaseId]);

  /**
   * Creates a new case, forcing creation even if one exists.
   * Used when user explicitly clicks "New Chat" after using a case.
   */
  const createNewCase = useCallback(async (): Promise<string> => {
    if (!sessionId) {
      throw new Error('Cannot create case without session');
    }

    log.info('Force creating new case for session:', sessionId);
    setState(prev => ({ ...prev, isCreatingCase: true }));

    try {
      const caseId = await createCaseForSession(sessionId, true);

      // Update state and storage
      await browser.storage.local.set({ active_case_id: caseId });
      setState({
        currentCaseId: caseId,
        isCreatingCase: false
      });

      log.info('New case created successfully:', caseId);
      return caseId;
    } catch (error) {
      setState(prev => ({ ...prev, isCreatingCase: false }));
      log.error('New case creation failed:', error);
      throw error;
    }
  }, [sessionId]);

  /**
   * Sets the active case ID (used when selecting existing case from list)
   */
  const setActiveCase = useCallback(async (caseId: string | null) => {
    log.debug('Setting active case:', caseId);
    setState(prev => ({ ...prev, currentCaseId: caseId }));

    if (caseId) {
      await browser.storage.local.set({ active_case_id: caseId });
    } else {
      await browser.storage.local.remove(['active_case_id']);
    }
  }, []);

  /**
   * Clears the current case (used for "New Chat" button - NO backend call)
   */
  const clearCurrentCase = useCallback(async () => {
    log.debug('Clearing current case (no backend call)');
    setState(prev => ({ ...prev, currentCaseId: null }));
    await browser.storage.local.remove(['active_case_id']);
  }, []);

  return {
    currentCaseId: state.currentCaseId,
    isCreatingCase: state.isCreatingCase,
    ensureCaseExists,
    createNewCase,
    setActiveCase,
    clearCurrentCase
  };
}

/**
 * Backend API call to create or get case for session.
 *
 * @param sessionId - Current session ID
 * @param forceNew - If true, always creates new case (for "New Chat" after using a case)
 * @returns Case ID (UUID from backend)
 */
async function createCaseForSession(
  sessionId: string,
  forceNew: boolean = false
): Promise<string> {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Build URL with optional force_new parameter
  const url = new URL(`/api/v1/cases/sessions/${sessionId}/case`, baseUrl);
  if (forceNew) {
    url.searchParams.append('force_new', 'true');
  }

  // Generate idempotency key to prevent duplicate case creation on retry
  const idempotencyKey = `case_${sessionId}_${Date.now()}`;

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': idempotencyKey
    },
    credentials: 'include'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Case creation failed: ${response.status} - ${errorText}`);
  }

  const data: CaseCreationResponse = await response.json();

  if (!data.case_id) {
    throw new Error('Backend response missing case_id');
  }

  return data.case_id;
}
