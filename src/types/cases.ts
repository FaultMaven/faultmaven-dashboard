/**
 * Case types — sourced from the OpenAPI-generated contract.
 *
 * `api.generated.ts` is the single source of truth (regenerated from the
 * backend OpenAPI schema). Hand-written shapes here previously drifted from it
 * (`status` vs `state`, `page/page_size` vs `limit/offset`, `case_id` on
 * messages, `source_type/data_type` on file details, …), which let contract
 * bugs reach runtime instead of failing the type check. Everything below now
 * aliases the generated schema. The only locally-declared shapes are
 * frontend-only ones with no backend counterpart (request DTOs, the filter
 * query bag, and the narrowed `/ui` read-adapter) — each is marked as such.
 */
import type { components } from './api.generated';
import type { CaseState } from './case';

export type { CaseState };

// ==================== Case core (list + detail) ====================

/**
 * Team-sharing seam (U12 / ADR-013 §D4). The backend surfaces `shared_team_ids`
 * on case reads, but openapi-typescript's generated `CaseSummary`/`CaseDetail`
 * do not carry it yet (not published in the OpenAPI schema). This small local
 * extension — same pattern as `ArchiveSeamFields` — keeps the team-sharing UI
 * (badges, team filter, share action) typechecking. Empty in standalone (team
 * sharing is a Cloud collaboration feature — unwired there) and for a case
 * shared with no Team. Resolve ids to names via `GET /api/v1/teams`.
 */
interface TeamSharingFields {
  shared_team_ids: string[];
}

/** Case origin (ADR-012), derived from the creator's account kind. */
export type CaseSource = 'copilot' | 'slack' | 'api';

export type CaseSummary = components['schemas']['CaseSummary'] &
  TeamSharingFields & {
    /** ADR-012 case origin; optional until the backend surfaces it on `CaseSummary`. */
    source?: CaseSource;
  };

/**
 * A Team the caller belongs to (ADR-013 §D4), from `GET /api/v1/teams`.
 * Read-only here — team management is the Cloud admin surface.
 */
export interface Team {
  team_id: string;
  name: string;
  description?: string | null;
  organization_id: string;
}

export type CaseDetail = components['schemas']['CaseDetail'] & TeamSharingFields;

/**
 * The generated `CaseListResponse.cases` is the raw generated `CaseSummary`,
 * which lacks the `TeamSharingFields` seam above. The backend returns those
 * fields on list reads (see `TeamSharingFields`), so the page carries the
 * extended `CaseSummary` — override `cases` to it.
 */
export type CaseListResponse = Omit<components['schemas']['CaseListResponse'], 'cases'> & {
  cases: CaseSummary[];
};

export type InvestigationStage = components['schemas']['InvestigationStage'];

// ==================== Operator "All Cases" list (ADR-012 D9) ====================

/**
 * One case as *ambient metadata* — the cloud operator row from
 * `GET /api/v1/admin/cases` (ADR-012 D9).
 *
 * There is no `title` or `description` key here, and that is the point: D9
 * classifies user free text as **content**, reachable only through an audited
 * break-glass grant (faultmaven#815). The backend omits the keys rather than
 * sending them as `null` so a client cannot render "withheld by policy" as an
 * untitled case — and this type carries that guarantee into the UI, where a
 * `c.title` on an operator row is a type error rather than "Untitled Case".
 */
export type AdminCaseMetadata = components['schemas']['AdminCaseMetadata'] & {
  /** ADR-012 case origin; narrows the generated `string`. */
  source?: CaseSource;
};

/** The standalone arm: full summaries, titles included. */
export type AdminCaseFullListResponse = Omit<
  components['schemas']['AdminCaseListResponse'],
  'cases'
> & {
  // Same seam as `CaseListResponse`: the generated `CaseSummary` lacks
  // `shared_team_ids`, which the backend does return.
  cases: CaseSummary[];
};

/** The cloud arm: ambient metadata, no content. */
export type AdminCaseMetadataListResponse = Omit<
  components['schemas']['AdminCaseMetadataListResponse'],
  'cases'
> & {
  cases: AdminCaseMetadata[];
};

/**
 * What `GET /api/v1/admin/cases` returns — a union discriminated on `view`.
 *
 * Which arm arrives is fixed by the deployment, but callers must narrow on
 * `view`, **not** on their own notion of the deployment mode: the response says
 * what it is, so the two cannot drift.
 */
export type AdminCaseListResult = AdminCaseFullListResponse | AdminCaseMetadataListResponse;

// ==================== Frontend-only request / filter shapes ====================
// (no generated counterpart — these are dashboard query/write bags)

export interface CaseFilters {
  state?: CaseState;
  source?: CaseSource;
  date_from?: string;
  date_to?: string;
  search?: string;
  /**
   * Restrict to cases shared with this Team (ADR-013 §D4). Only Teams the caller
   * belongs to yield results; ignored in standalone. Doubles as the "team case
   * view" — selecting a team narrows the list to that team's shared cases.
   */
  team_id?: string;
}

// ==================== Messages ====================

export type CaseMessage = components['schemas']['Message'];
export type CaseMessagesResponse = components['schemas']['CaseMessagesResponse'];

// ==================== Uploaded files ====================

export type UploadedFile = components['schemas']['UploadedFileMetadata'];
export type UploadedFilesResponse = components['schemas']['UploadedFilesList'];
export type UploadedFileDetails = components['schemas']['UploadedFileDetailsResponse'];
export type DerivedEvidence = components['schemas']['DerivedEvidenceSummary'];

// ==================== Hypotheses ====================

export type HypothesisState = components['schemas']['HypothesisState'];
export type HypothesisSummary = components['schemas']['HypothesisSummary'];

// ==================== Case UI snapshot (phase-adaptive) ====================

export type CaseUIStatus = CaseState;

/**
 * Frontend read-adapter over `GET /cases/{id}/ui`. The endpoint returns a
 * phase-discriminated union (see `CaseUIResponse_*` in `case.ts`); the Dashboard
 * only consumes the active-hypotheses slice, so this narrows to the fields
 * actually read rather than forcing every caller to discriminate the union.
 */
export interface CaseUIResponse {
  case_id: string;
  state: CaseUIStatus;
  title: string;
  current_turn: number;
  active_hypotheses?: HypothesisSummary[];
  agent_status?: string;
}

// ==================== Evidence ====================

export type SourceFileReference = components['schemas']['SourceFileReference'];
export type RelatedHypothesis = components['schemas']['RelatedHypothesis'];
export type EvidenceDetails = components['schemas']['EvidenceDetailsResponse'];
export type CaseEvidenceListResponse = components['schemas']['CaseEvidenceListResponse'];

// ==================== Reports ====================

export type CaseReport = components['schemas']['CaseReport'];
export type ReportType = components['schemas']['ReportType'];
export type ReportGenerationRequest = components['schemas']['ReportGenerationRequest'];
export type ReportGenerationResponse = components['schemas']['ReportGenerationResponse'];

/**
 * Report recommendations. The generated `ReportRecommendationResponse` types
 * `runbook_recommendation` as an opaque object (openapi-typescript loses the
 * nested schema), so these hand-written shapes are a strictly-better-typed
 * refinement of the same payload, not drift.
 */
export interface ReportRecommendation {
  case_id: string;
  available_for_generation: ReportType[];
  runbook_recommendation: RunbookRecommendation;
}

export interface RunbookRecommendation {
  action: 'reuse' | 'review_or_generate' | 'generate';
  existing_runbook?: CaseReport;
  similarity_score?: number;
  reason: string;
}

// ==================== Case issue (Issue tab view model) ====================
// Frontend view model assembled from case detail + reports; no single backend type.

export interface CaseIssue {
  problem_statement: string;
  root_cause: string | null;
  solutions: Array<{ description: string; verified: boolean }>;
  validated_hypotheses: string[];
  refuted_hypotheses: string[];
  milestones_completed: string[];
  severity: string | null;
  resolution_time: string | null;
}

// ==================== Knowledge suggestions ====================
// No generated counterpart — kept hand-written.

export type SuggestionStatus = 'pending_review' | 'approved' | 'rejected' | 'draft';
export type PIIScanStatus =
  | 'not_scanned'
  | 'scanning'
  | 'clean'
  | 'pii_detected'
  | 'remediated'
  | 'scan_failed';

export interface KnowledgeSuggestion {
  suggestion_id: string;
  case_id: string;
  status: SuggestionStatus;
  suggested_title: string;
  suggested_content: string;
  extracted_by: string;
  extracted_at: string;
  pii_scan_status: PIIScanStatus;
  pii_remediated_by?: string;
  pii_remediated_at?: string;
  message_count: number;
  evidence_count: number;
  knowledge_item_id?: string;
}
