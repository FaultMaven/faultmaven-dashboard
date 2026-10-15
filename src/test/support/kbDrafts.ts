import { APIError } from '../../lib/knowledge/errors';
import type {
  ConversionDraft,
  ConversionResponse,
  DraftSummary,
} from '../../lib/knowledge/conversion';

/**
 * Wire-shaped fixtures for the KB page's Drafts tab and draft editor.
 *
 * The runbook text is built to clear core's 100-character floor
 * (`DraftUpdateRequest`), so an unedited draft is saveable once it is touched.
 */

export const RUNBOOK_TEXT = [
  '---',
  'id: redis-oom',
  'title: Redis out of memory',
  'status: draft',
  '---',
  '# Redis out of memory',
  'Check used_memory against maxmemory, then raise the limit or evict.',
].join('\n');

export function makeDraft(overrides: Partial<ConversionDraft> = {}): ConversionDraft {
  const content = overrides.content ?? RUNBOOK_TEXT;
  return {
    draft_id: 'draft-1',
    runbook_id: 'redis-oom',
    title: 'Redis out of memory',
    scope: 'personal',
    status: 'draft',
    source_type: 'document',
    case_id: null,
    validation: { passed: true, errors: [], warnings: [] },
    quality_score: {
      overall: 80,
      grade: 'B',
      completeness: 80,
      clarity: 80,
      actionability: 80,
      comprehensiveness: 80,
    },
    content_preview: content.slice(0, 500),
    quality_warning: null,
    ...overrides,
    content,
  };
}

export function makeConversion(
  drafts: ConversionDraft[] = [makeDraft()],
  overrides: Partial<ConversionResponse> = {},
): ConversionResponse {
  return {
    conversion_id: 'conv-1',
    status: 'completed',
    source_file: { filename: 'redis.md', size_bytes: 512, content_type: 'text/markdown' },
    analysis: {
      is_actionable: true,
      failure_modes: [],
      source_assessment: {
        content_type: 'document',
        actionability_rating: 'high',
        missing_information: [],
      },
    },
    drafts,
    warnings: [],
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export function makeDraftSummary(overrides: Partial<DraftSummary> = {}): DraftSummary {
  return {
    conversion_id: 'conv-1',
    draft_id: 'draft-1',
    runbook_id: 'redis-oom',
    title: 'Redis out of memory',
    scope: 'personal',
    status: 'draft',
    source_type: 'document',
    case_id: null,
    validation_passed: true,
    quality_score: 80,
    quality_details: null,
    created_at: '2026-10-01T00:00:00Z',
    verified_at: null,
    ...overrides,
  };
}

/**
 * The 409 core sends for a refused draft save or verify. On the wire the body
 * is `{"error": "Conflict", "detail": <sentence>, "status_code": 409,
 * "resource_type": "draft", "resource_id": …, "conflict_reason": <reason>}`;
 * `handleAPIResponse` puts `detail` in the message and the whole body in
 * `details`.
 */
export function draftConflict(reason: string, sentence: string): APIError {
  return new APIError(sentence, 409, 'Conflict', {
    error: 'Conflict',
    detail: sentence,
    status_code: 409,
    resource_type: 'draft',
    resource_id: 'draft-1',
    conflict_reason: reason,
  });
}
