/**
 * MergeStrategies - Handles merging of conflicting optimistic and real data
 *
 * Provides different strategies for resolving data conflicts:
 * - Conversation merging (combining messages from different sources)
 * - Title merging (respecting user vs system precedence)
 * - State merging (resolving conflicting case states)
 */

import { ConversationItem, OptimisticConversationItem } from './types';

export interface MergeResult<T> {
  merged: T;
  conflicts: string[];
  strategy: string;
  confidence: 'high' | 'medium' | 'low';
  requiresUserInput: boolean;
}

export interface MergeContext {
  caseId: string;
  userId?: string;
  timestamp: number;
  source: 'optimistic' | 'backend' | 'cross_tab';
}

export class MergeStrategies {
  /**
   * Merge conversation arrays with conflict resolution
   */
  static mergeConversations(
    optimisticConversation: OptimisticConversationItem[],
    realConversation: ConversationItem[],
    context: MergeContext
  ): MergeResult<ConversationItem[]> {
    const merged: ConversationItem[] = [];
    const conflicts: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'high';

    // Create maps for faster lookup
    const optimisticMap = new Map<string, OptimisticConversationItem>();
    const realMap = new Map<string, ConversationItem>();

    optimisticConversation.forEach(item => {
      const key = item.originalId || item.id;
      optimisticMap.set(key, item);
    });

    realConversation.forEach(item => {
      realMap.set(item.id, item);
    });

    // Process all unique message IDs
    const allIds = new Set([...optimisticMap.keys(), ...realMap.keys()]);

    for (const id of allIds) {
      const optimisticItem = optimisticMap.get(id);
      const realItem = realMap.get(id);

      if (optimisticItem && realItem) {
        // Both exist - merge them
        const mergedItem = this.mergeConversationItem(optimisticItem, realItem, context);
        merged.push(mergedItem.merged);
        conflicts.push(...mergedItem.conflicts);
        if (mergedItem.confidence === 'low') confidence = 'low';
        else if (mergedItem.confidence === 'medium' && confidence === 'high') confidence = 'medium';
      } else if (optimisticItem && !realItem) {
        // Only optimistic exists - check if it's failed or pending
        if (optimisticItem.failed) {
          conflicts.push(`Message ${id} failed to submit and was not saved`);
          confidence = 'medium';
          // Include failed message with error indicator
          merged.push({
            id: optimisticItem.id,
            question: optimisticItem.question || '',
            response: optimisticItem.response || '❌ Message failed to send',
            error: true,
            timestamp: optimisticItem.timestamp || new Date().toISOString()
          });
        } else if (optimisticItem.optimistic) {
          conflicts.push(`Message ${id} is still pending submission`);
          confidence = 'medium';
          // Include pending message
          merged.push({
            id: optimisticItem.id,
            question: optimisticItem.question || '',
            response: optimisticItem.response || '⏳ Submitting...',
            error: false,
            timestamp: optimisticItem.timestamp || new Date().toISOString()
          });
        } else {
          // Include confirmed optimistic message
          merged.push({
            id: optimisticItem.id,
            question: optimisticItem.question || '',
            response: optimisticItem.response || '',
            error: optimisticItem.error || false,
            timestamp: optimisticItem.timestamp || new Date().toISOString()
          });
        }
      } else if (!optimisticItem && realItem) {
        // Only real exists - include it
        merged.push(realItem);
      }
    }

    // Sort by timestamp to maintain conversation order
    merged.sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return aTime - bTime;
    });

    return {
      merged,
      conflicts,
      strategy: 'conversation_merge',
      confidence,
      requiresUserInput: confidence === 'low' || conflicts.length > 3
    };
  }

  /**
   * Merge individual conversation items
   */
  private static mergeConversationItem(
    optimistic: OptimisticConversationItem,
    real: ConversationItem,
    context: MergeContext
  ): MergeResult<ConversationItem> {
    const conflicts: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'high';

    // Start with real data as base (it's authoritative)
    const merged: ConversationItem = { ...real };

    // Check for conflicts in key fields
    if (optimistic.question && real.question && optimistic.question !== real.question) {
      conflicts.push(`Question text differs: optimistic="${optimistic.question}" vs real="${real.question}"`);
      confidence = 'low';
      // Real data wins for questions (user input should be consistent)
    }

    if (optimistic.response && real.response && optimistic.response !== real.response) {
      if (optimistic.response.includes('Thinking...') || optimistic.response.includes('Submitting...')) {
        // Optimistic was just a placeholder - real wins
      } else {
        conflicts.push(`Response differs between optimistic and real data`);
        confidence = 'medium';
        // Real data wins for responses (backend is authoritative)
      }
    }

    // Merge additional fields that might exist in optimistic but not real
    if (optimistic.loading && !real.response) {
      merged.response = optimistic.response || '⏳ Loading...';
    }

    return {
      merged,
      conflicts,
      strategy: 'item_merge',
      confidence,
      requiresUserInput: confidence === 'low'
    };
  }

  /**
   * Merge title conflicts with source precedence
   */
  static mergeTitles(
    optimisticTitle: string,
    realTitle: string,
    context: MergeContext & {
      optimisticSource: 'user' | 'system' | 'backend';
      realSource: 'user' | 'system' | 'backend';
    }
  ): MergeResult<string> {
    const conflicts: string[] = [];
    let merged = realTitle; // Default to real
    let confidence: 'high' | 'medium' | 'low' = 'high';

    // Apply source precedence: user > system > backend
    const sourcePrecedence = { user: 3, system: 2, backend: 1 };

    if (optimisticTitle !== realTitle) {
      conflicts.push(`Title conflict: optimistic="${optimisticTitle}" vs real="${realTitle}"`);

      const optimisticPrecedence = sourcePrecedence[context.optimisticSource];
      const realPrecedence = sourcePrecedence[context.realSource];

      if (optimisticPrecedence > realPrecedence) {
        merged = optimisticTitle;
        confidence = 'high';
      } else if (optimisticPrecedence === realPrecedence) {
        // Same precedence level - use timestamp
        merged = realTitle; // Real data is more recent in this context
        confidence = 'medium';
      } else {
        merged = realTitle;
        confidence = 'high';
      }
    }

    return {
      merged,
      conflicts,
      strategy: 'title_precedence',
      confidence,
      requiresUserInput: false // Title conflicts are auto-resolvable
    };
  }

  /**
   * Merge case state conflicts
   */
  static mergeCaseState<T extends Record<string, any>>(
    optimisticState: T,
    realState: T,
    context: MergeContext
  ): MergeResult<T> {
    const merged = { ...realState }; // Start with real state
    const conflicts: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'high';

    // Check for conflicts in important fields
    const importantFields = ['status', 'updated_at', 'message_count'];

    for (const field of importantFields) {
      if (optimisticState[field] !== undefined &&
          realState[field] !== undefined &&
          optimisticState[field] !== realState[field]) {

        conflicts.push(`Case ${field} differs: optimistic=${optimisticState[field]} vs real=${realState[field]}`);

        // Special handling for different fields
        if (field === 'message_count') {
          // Use the higher count (might include pending messages)
          (merged as any)[field] = Math.max(optimisticState[field], realState[field]);
          if (confidence === 'high') confidence = 'medium';
        } else if (field === 'updated_at') {
          // Use the more recent timestamp
          const optimisticTime = new Date(optimisticState[field]).getTime();
          const realTime = new Date(realState[field]).getTime();
          (merged as any)[field] = optimisticTime > realTime ? optimisticState[field] : realState[field];
        } else if (field === 'status') {
          // Status conflicts are more serious
          if (confidence !== 'low') confidence = 'low';
        }
        // For other fields, real state wins by default
      }
    }

    // Preserve optimistic fields that don't exist in real state
    Object.keys(optimisticState).forEach(key => {
      if (realState[key] === undefined && optimisticState[key] !== undefined) {
        (merged as any)[key] = optimisticState[key];
      }
    });

    return {
      merged,
      conflicts,
      strategy: 'state_merge',
      confidence,
      requiresUserInput: confidence === 'low' || conflicts.length > 2
    };
  }

  /**
   * Intelligent array merge that preserves order and handles duplicates
   */
  static mergeArrays<T extends { id: string; timestamp?: string }>(
    optimisticArray: T[],
    realArray: T[],
    context: MergeContext
  ): MergeResult<T[]> {
    const conflicts: string[] = [];
    const seenIds = new Set<string>();
    const merged: T[] = [];

    // Combine arrays and sort by timestamp
    const combined = [...optimisticArray, ...realArray].sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return aTime - bTime;
    });

    // Deduplicate while preserving order
    for (const item of combined) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        merged.push(item);
      } else {
        conflicts.push(`Duplicate item found: ${item.id}`);
      }
    }

    return {
      merged,
      conflicts,
      strategy: 'array_merge',
      confidence: conflicts.length > 0 ? 'medium' : 'high',
      requiresUserInput: false
    };
  }

  /**
   * Cross-tab conflict resolution
   * Handles cases where multiple browser tabs have made changes
   */
  static resolveCrossTabConflict<T>(
    localData: T,
    remoteData: T,
    context: MergeContext & { localTimestamp: number; remoteTimestamp: number }
  ): MergeResult<T> {
    const conflicts: string[] = [];
    let merged = remoteData; // Default to remote (more recent)
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    // Use timestamp to determine which data is more recent
    if (context.localTimestamp > context.remoteTimestamp) {
      merged = localData;
      conflicts.push('Local data is newer than remote data');
    } else if (context.remoteTimestamp > context.localTimestamp) {
      merged = remoteData;
      conflicts.push('Remote data is newer than local data');
    } else {
      // Same timestamp - this is suspicious
      conflicts.push('Simultaneous changes detected from multiple tabs');
      confidence = 'low';
      // Keep remote data but flag for user attention
    }

    return {
      merged,
      conflicts,
      strategy: 'cross_tab_resolution',
      confidence,
      requiresUserInput: confidence === 'low'
    };
  }
}