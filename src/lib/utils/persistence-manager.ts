/**
 * Persistence Manager for FaultMaven Copilot Extension
 *
 * Handles intelligent conversation recovery across extension reloads by:
 * 1. Detecting when extension storage is empty (reload scenario)
 * 2. Fetching conversation data from backend APIs
 * 3. Restoring conversations, titles, and state to match backend data
 * 4. Maintaining optimistic UI state during recovery
 */

import { browser } from "wxt/browser";
import { getUserCases, getCaseConversation, authManager, UserCase } from "../api";
import { OptimisticConversationItem } from "../optimistic";

// Backend API message format (from /api/v1/cases/{case_id}/messages)
interface BackendMessage {
  id?: string;
  message_id?: string;
  role: 'user' | 'agent' | 'assistant';
  content: string;
  created_at: string;
}

// Enhanced API response format
interface EnhancedCaseMessagesResponse {
  messages: BackendMessage[];
  total_count: number;
  retrieved_count: number;
  has_more: boolean;
  next_offset?: number;
  debug_info?: {
    redis_key?: string;
    redis_operation_time_ms?: number;
    storage_errors?: string[];
    message_parsing_errors?: number;
  };
}

export interface PersistenceState {
  conversationTitles: Record<string, string>;
  titleSources: Record<string, 'user' | 'backend' | 'system'>;
  conversations: Record<string, OptimisticConversationItem[]>;
  lastSyncTimestamp: number;
  extensionVersion: string;
}

export interface RecoveryResult {
  success: boolean;
  recoveredCases: number;
  recoveredConversations: number;
  errors: string[];
  strategy: 'full_recovery' | 'partial_recovery' | 'no_recovery_needed';
}

/**
 * Manages conversation persistence and recovery across extension lifecycle
 */
export class PersistenceManager {
  private static readonly SYNC_TIMESTAMP_KEY = 'faultmaven_last_sync';
  private static readonly RECOVERY_FLAG_KEY = 'faultmaven_recovery_in_progress';
  private static readonly VERSION_KEY = 'faultmaven_extension_version';
  private static readonly RELOAD_FLAG_KEY = 'faultmaven_reload_detected';
  private static readonly SESSION_ID_KEY = 'faultmaven_session_id';

  // Extension version for detecting updates/reloads
  private static readonly CURRENT_VERSION = browser.runtime.getManifest?.()?.version || '1.0.0';

  /**
   * Robust reload detection using lifecycle flags and structural analysis:
   * 1. Explicit reload flag set during extension lifecycle events
   * 2. Extension version mismatch (update scenario)
   * 3. Session ID mismatch (runtime context changed)
   * 4. Structural inconsistency (titles exist but no conversations)
   */
  static async detectExtensionReload(): Promise<boolean> {
    try {
      const isAuthenticated = await authManager.isAuthenticated();

      if (!isAuthenticated) {
        return false;
      }

      const stored = await browser.storage.local.get([
        'conversationTitles',
        'conversations',
        PersistenceManager.VERSION_KEY,
        PersistenceManager.RELOAD_FLAG_KEY,
        PersistenceManager.SESSION_ID_KEY
      ]);

      // Method 1: Explicit reload flag (most reliable)
      const hasReloadFlag = !!stored[PersistenceManager.RELOAD_FLAG_KEY];

      // Method 2: Version mismatch (extension update)
      const versionMismatch = stored[PersistenceManager.VERSION_KEY] !== PersistenceManager.CURRENT_VERSION;

      // Method 3: Session ID mismatch (runtime context changed)
      const currentSessionId = browser.runtime.id;
      const sessionMismatch = stored[PersistenceManager.SESSION_ID_KEY] &&
                             stored[PersistenceManager.SESSION_ID_KEY] !== currentSessionId;

      // Method 4: Structural inconsistency (titles exist but conversations missing/empty)
      const hasAnyTitles = stored.conversationTitles && Object.keys(stored.conversationTitles).length > 0;
      const hasNoConversations = !stored.conversations ||
                                 Object.keys(stored.conversations).length === 0 ||
                                 Object.values(stored.conversations).every((conv: any) =>
                                   !Array.isArray(conv) || conv.length === 0
                                 );
      const structuralMismatch = hasAnyTitles && hasNoConversations;

      // Recovery needed if ANY indicator is true
      const shouldRecover = hasReloadFlag || versionMismatch || sessionMismatch || structuralMismatch;

      console.log('[PersistenceManager] Reload detection:', {
        isAuthenticated,
        shouldRecover,
        indicators: {
          reloadFlag: hasReloadFlag,
          versionMismatch,
          sessionMismatch,
          structuralMismatch
        },
        state: {
          titleCount: stored.conversationTitles ? Object.keys(stored.conversationTitles).length : 0,
          conversationCount: stored.conversations ? Object.keys(stored.conversations).length : 0,
          version: stored[PersistenceManager.VERSION_KEY],
          currentVersion: PersistenceManager.CURRENT_VERSION,
          sessionId: stored[PersistenceManager.SESSION_ID_KEY],
          currentSessionId
        },
        reason: shouldRecover ? (
          hasReloadFlag ? 'explicit_reload_flag' :
          versionMismatch ? 'version_mismatch' :
          sessionMismatch ? 'session_id_mismatch' :
          'structural_inconsistency'
        ) : 'no_recovery_needed'
      });

      return shouldRecover;

    } catch (error) {
      console.warn('[PersistenceManager] Detection error - defaulting to safe recovery:', error);
      return true;
    }
  }

  /**
   * Sets reload flag (called during extension lifecycle events)
   * Should be called from background script or service worker on install/update
   */
  static async markReloadDetected(): Promise<void> {
    try {
      await browser.storage.local.set({
        [PersistenceManager.RELOAD_FLAG_KEY]: true,
        [PersistenceManager.SESSION_ID_KEY]: browser.runtime.id
      });
      console.log('[PersistenceManager] Reload flag set');
    } catch (error) {
      console.warn('[PersistenceManager] Failed to set reload flag:', error);
    }
  }

  /**
   * Clears reload flag after successful recovery
   */
  static async clearReloadFlag(): Promise<void> {
    try {
      await browser.storage.local.remove([PersistenceManager.RELOAD_FLAG_KEY]);
      console.log('[PersistenceManager] Reload flag cleared');
    } catch (error) {
      console.warn('[PersistenceManager] Failed to clear reload flag:', error);
    }
  }

  /**
   * Recovers conversations from backend API and restores local state
   */
  static async recoverConversationsFromBackend(): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      success: false,
      recoveredCases: 0,
      recoveredConversations: 0,
      errors: [],
      strategy: 'no_recovery_needed'
    };

    try {
      // Set recovery flag to prevent concurrent recovery attempts
      await browser.storage.local.set({ [PersistenceManager.RECOVERY_FLAG_KEY]: true });

      console.log('[PersistenceManager] 🔄 Starting conversation recovery from backend...');

      // Check authentication
      const isAuthenticated = await authManager.isAuthenticated();
      if (!isAuthenticated) {
        result.errors.push('User not authenticated - cannot recover conversations');
        return result;
      }

      // Fetch all user cases from backend
      console.log('[PersistenceManager] 📡 Fetching user cases from backend...');
      const cases: UserCase[] = await getUserCases({
        limit: 100 // Get up to 100 recent cases
      });

      console.log('[PersistenceManager] ✅ Retrieved cases from backend:', {
        count: cases.length,
        caseIds: cases.map(c => c.case_id)
      });

      if (cases.length === 0) {
        console.log('[PersistenceManager] No cases found - new user or no chat history');
        result.strategy = 'no_recovery_needed';
        result.success = true;
        return result;
      }

      // Prepare recovery data structures
      const recoveredTitles: Record<string, string> = {};
      const recoveredTitleSources: Record<string, 'user' | 'backend' | 'system'> = {};
      const recoveredConversations: Record<string, OptimisticConversationItem[]> = {};

      // PARALLEL RECOVERY: Fetch conversations with concurrency limit to avoid overwhelming the API
      const CONCURRENCY_LIMIT = 5; // Process 5 cases at a time
      let conversationCount = 0;

      // Helper function to process a single case
      const processCase = async (userCase: UserCase) => {
        try {
          console.log('[PersistenceManager] 🔄 Recovering case:', userCase.case_id);

          // Set case title
          recoveredTitles[userCase.case_id] = userCase.title || `Chat-${new Date(userCase.created_at || Date.now()).toLocaleString()}`;
          recoveredTitleSources[userCase.case_id] = 'backend';

          // Fetch conversation for this case with debug info enabled
          console.log('[PersistenceManager] 📡 Fetching conversation for case:', userCase.case_id);
          const conversationData: EnhancedCaseMessagesResponse = await getCaseConversation(userCase.case_id, true);

          console.log('[PersistenceManager] 📄 Enhanced conversation data:', {
            caseId: userCase.case_id,
            totalCount: conversationData.total_count,
            retrievedCount: conversationData.retrieved_count,
            hasMore: conversationData.has_more,
            messagesLength: conversationData.messages?.length || 0,
            debugInfo: conversationData.debug_info
          });

          // Check for retrieval issues
          if (conversationData.total_count > 0 && conversationData.retrieved_count === 0) {
            const errorMsg = `Message retrieval failed for case ${userCase.case_id}: total=${conversationData.total_count}, retrieved=0`;
            console.error('[PersistenceManager] 🚨', errorMsg);
            result.errors.push(errorMsg);
            if (conversationData.debug_info?.storage_errors?.length) {
              result.errors.push(...conversationData.debug_info.storage_errors);
            }
          }

          const messages: BackendMessage[] = conversationData.messages || [];

          // Debug: Log the actual message structure to understand what we're receiving
          console.log('[PersistenceManager] 🔍 Message details for case:', userCase.case_id, {
            totalMessages: messages.length,
            messages: messages.map(m => ({
              id: m.message_id || m.id,
              role: m.role,
              contentPreview: m.content.substring(0, 50) + '...',
              created_at: m.created_at
            }))
          });

          // Convert to optimistic format for UI compatibility
          // Pair user messages with agent responses to create proper conversation items
          const optimisticMessages: OptimisticConversationItem[] = [];

          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (msg.role === 'user') {
              // Find the corresponding agent response (next message or search ahead)
              const agentResponse = messages.find((m, idx) =>
                idx > i && (m.role === 'agent' || m.role === 'assistant')
              );

              const conversationItem: OptimisticConversationItem = {
                id: msg.id || `recovered_${userCase.case_id}_${i}`,
                question: msg.content,
                response: agentResponse ? agentResponse.content : '', // Empty if no response yet
                error: false,
                timestamp: msg.created_at, // Use ISO 8601 format from backend
                optimistic: false, // Backend messages are confirmed
                loading: !agentResponse, // Still loading if no response
                failed: false,
                originalId: msg.id || `recovered_${userCase.case_id}_${i}`,
                role: 'user',
                content: msg.content
              };

              optimisticMessages.push(conversationItem);
            }
            // Skip agent messages as they're already included as responses
          }

          // If we only have agent messages (edge case), create items for them
          if (optimisticMessages.length === 0 && messages.some(m => m.role === 'agent' || m.role === 'assistant')) {
            messages.forEach((msg, index) => {
              if (msg.role === 'agent' || msg.role === 'assistant') {
                optimisticMessages.push({
                  id: msg.id || `recovered_agent_${userCase.case_id}_${index}`,
                  question: '', // No user question found
                  response: msg.content,
                  error: false,
                  timestamp: msg.created_at, // Use ISO 8601 format from backend
                  optimistic: false,
                  loading: false,
                  failed: false,
                  originalId: msg.id || `recovered_agent_${userCase.case_id}_${index}`,
                  role: 'assistant',
                  content: msg.content
                });
              }
            });
          }

          // Only store conversations with actual content
          if (optimisticMessages.length > 0) {
            recoveredConversations[userCase.case_id] = optimisticMessages;
            conversationCount += messages.length;
            result.recoveredConversations++;

            console.log('[PersistenceManager] ✅ Recovered conversation for case:', {
              caseId: userCase.case_id,
              messageCount: messages.length,
              retrievedCount: conversationData.retrieved_count,
              totalCount: conversationData.total_count,
              title: recoveredTitles[userCase.case_id]
            });
          } else {
            // Enhanced logging for empty conversations
            if (conversationData.total_count > 0) {
              console.warn('[PersistenceManager] ⚠️ Case has messages but none retrieved:', {
                caseId: userCase.case_id,
                totalCount: conversationData.total_count,
                retrievedCount: conversationData.retrieved_count,
                debugInfo: conversationData.debug_info
              });
            } else {
              console.log('[PersistenceManager] ⚪ Skipping empty conversation for case:', userCase.case_id);
            }
          }

          result.recoveredCases++;
          return { success: true, caseId: userCase.case_id };

        } catch (error) {
          console.warn('[PersistenceManager] ⚠️ Failed to recover case:', userCase.case_id, error);
          result.errors.push(`Failed to recover case ${userCase.case_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);

          // Still add the case title even if conversation failed
          recoveredTitles[userCase.case_id] = userCase.title || `Chat-${new Date(userCase.created_at || Date.now()).toLocaleString()}`;
          recoveredTitleSources[userCase.case_id] = 'backend';
          return { success: false, caseId: userCase.case_id, error };
        }
      };

      // Parallel processing with concurrency limit
      console.log('[PersistenceManager] 📦 Processing cases in parallel (concurrency:', CONCURRENCY_LIMIT, ')');
      const results: Array<{ success: boolean; caseId: string; error?: any }> = [];

      for (let i = 0; i < cases.length; i += CONCURRENCY_LIMIT) {
        const batch = cases.slice(i, i + CONCURRENCY_LIMIT);
        console.log(`[PersistenceManager] 🔄 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(cases.length / CONCURRENCY_LIMIT)}`);

        const batchResults = await Promise.all(batch.map(processCase));
        results.push(...batchResults);
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      console.log('[PersistenceManager] ✅ Parallel processing complete:', {
        total: results.length,
        successful: successCount,
        failed: failureCount
      });

      // Save recovered data to local storage
      console.log('[PersistenceManager] 💾 Saving recovered data to local storage...');
      await browser.storage.local.set({
        conversationTitles: recoveredTitles,
        titleSources: recoveredTitleSources,
        conversations: recoveredConversations,
        [PersistenceManager.SYNC_TIMESTAMP_KEY]: Date.now(),
        [PersistenceManager.VERSION_KEY]: PersistenceManager.CURRENT_VERSION,
        [PersistenceManager.SESSION_ID_KEY]: browser.runtime.id
      });

      // Clear reload flag after successful recovery
      await PersistenceManager.clearReloadFlag();

      // Success metrics - use the count from the result object which tracks actual recovered conversations
      result.success = true;
      result.strategy = result.recoveredConversations > 0 ? 'full_recovery' : 'partial_recovery';

      console.log('[PersistenceManager] ✅ Conversation recovery completed successfully:', result);

      return result;

    } catch (error) {
      console.error('[PersistenceManager] ❌ Conversation recovery failed:', error);
      result.errors.push(`Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.strategy = 'full_recovery'; // Indicate we attempted full recovery
      return result;
    } finally {
      // Clear recovery flag
      await browser.storage.local.remove([PersistenceManager.RECOVERY_FLAG_KEY]);
    }
  }

  /**
   * Checks if recovery is already in progress
   */
  static async isRecoveryInProgress(): Promise<boolean> {
    try {
      const stored = await browser.storage.local.get([PersistenceManager.RECOVERY_FLAG_KEY]);
      return !!stored[PersistenceManager.RECOVERY_FLAG_KEY];
    } catch {
      return false;
    }
  }

  /**
   * Updates sync timestamp to mark successful data persistence
   */
  static async markSyncComplete(): Promise<void> {
    try {
      await browser.storage.local.set({
        [PersistenceManager.SYNC_TIMESTAMP_KEY]: Date.now(),
        [PersistenceManager.VERSION_KEY]: PersistenceManager.CURRENT_VERSION,
        [PersistenceManager.SESSION_ID_KEY]: browser.runtime.id
      });
    } catch (error) {
      console.warn('[PersistenceManager] Failed to mark sync complete:', error);
    }
  }

  /**
   * Gets current persistence state from storage
   */
  static async getCurrentState(): Promise<Partial<PersistenceState>> {
    try {
      const stored = await browser.storage.local.get([
        'conversationTitles',
        'titleSources',
        'conversations',
        PersistenceManager.SYNC_TIMESTAMP_KEY,
        PersistenceManager.VERSION_KEY
      ]);

      return {
        conversationTitles: stored.conversationTitles || {},
        titleSources: stored.titleSources || {},
        conversations: stored.conversations || {},
        lastSyncTimestamp: stored[PersistenceManager.SYNC_TIMESTAMP_KEY] || 0,
        extensionVersion: stored[PersistenceManager.VERSION_KEY] || 'unknown'
      };
    } catch (error) {
      console.warn('[PersistenceManager] Failed to get current state:', error);
      return {};
    }
  }

  /**
   * Forces conversation recovery (for testing/debugging purposes)
   */
  static async forceRecovery(): Promise<RecoveryResult> {
    console.log('[PersistenceManager] 🔧 Force recovery triggered');
    return await PersistenceManager.recoverConversationsFromBackend();
  }

  /**
   * Test enhanced API with detailed debugging (for troubleshooting)
   */
  static async testEnhancedAPI(caseId?: string): Promise<void> {
    console.log('[PersistenceManager] 🧪 Testing enhanced API with debugging...');

    try {
      if (!await authManager.isAuthenticated()) {
        console.error('[PersistenceManager] Not authenticated - cannot test API');
        return;
      }

      // If no specific case ID provided, get the first case
      if (!caseId) {
        console.log('[PersistenceManager] Fetching user cases...');
        const cases = await getUserCases();
        if (!cases || cases.length === 0) {
          console.warn('[PersistenceManager] No cases found for testing');
          return;
        }
        caseId = cases[0].case_id;
        console.log('[PersistenceManager] Using first case for testing:', caseId);
      }

      // Test the enhanced API with debug enabled
      console.log('[PersistenceManager] 🔍 Testing enhanced /messages API...');
      const response = await getCaseConversation(caseId, true);

      console.log('[PersistenceManager] 📊 Enhanced API Test Results:', {
        caseId,
        totalCount: response.total_count,
        retrievedCount: response.retrieved_count,
        hasMore: response.has_more,
        messagesArray: response.messages?.length || 0,
        debugInfo: response.debug_info,
        timestamp: new Date().toISOString()
      });

      // Analyze the results
      if (response.total_count > 0 && response.retrieved_count === 0) {
        console.error('[PersistenceManager] 🚨 ISSUE DETECTED: Messages exist but none retrieved');
        console.error('[PersistenceManager] Debug details:', response.debug_info);
      } else if (response.total_count === response.retrieved_count && response.messages?.length > 0) {
        console.log('[PersistenceManager] ✅ API working correctly - all messages retrieved');
      } else if (response.total_count === 0) {
        console.log('[PersistenceManager] ℹ️ Case is empty (no messages)');
      } else {
        console.warn('[PersistenceManager] ⚠️ Partial retrieval:', {
          total: response.total_count,
          retrieved: response.retrieved_count
        });
      }

    } catch (error) {
      console.error('[PersistenceManager] ❌ Enhanced API test failed:', error);
    }
  }


  /**
   * Clears all persistence data (for debugging/reset purposes)
   */
  static async clearAllPersistenceData(): Promise<void> {
    try {
      await browser.storage.local.remove([
        'conversationTitles',
        'titleSources',
        'conversations',
        'pendingOperations',
        'idMappings',
        PersistenceManager.SYNC_TIMESTAMP_KEY,
        PersistenceManager.VERSION_KEY,
        PersistenceManager.RECOVERY_FLAG_KEY,
        PersistenceManager.RELOAD_FLAG_KEY,
        PersistenceManager.SESSION_ID_KEY
      ]);
      console.log('[PersistenceManager] All persistence data cleared');
    } catch (error) {
      console.warn('[PersistenceManager] Failed to clear persistence data:', error);
    }
  }
}