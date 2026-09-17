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
import type { UserCaseState } from '@faultmaven/copilot-ui';

/**
 * The case lifecycle: phases (`inquiry`, `investigating`) then dispositions
 * (`resolved`, `closed`).
 *
 * Taken from the Copilot UI package rather than declared here. It used to be a
 * second hand-written copy of the same four strings in `types/case.ts`, which
 * is the shape ADR-016 D2 exists to retire — a byte-identical duplicate that
 * nothing compared, in a repository that renders the same cases as the
 * package. The union is not in the generated contract (the enum left the
 * published spec with the replay API, fm#1002), so a copy here could not have
 * been checked against anything.
 *
 * A type-only import: erased at build, so nothing about the panel's runtime
 * reaches the pages that render a case list.
 */
export type CaseState = UserCaseState;

// ==================== Case core (list + detail) ====================

/** Case origin (ADR-012), derived from the creator's account kind. */
export type CaseSource = 'copilot' | 'slack' | 'api';

/**
 * `shared_team_ids` (ADR-013 §D4) is now published in the generated schema
 * (the former `TeamSharingFields` local seam is collapsed, #58). The only
 * remaining local delta is narrowing the generated `source: string` to the
 * `CaseSource` union — same pattern as `AdminCaseMetadata` below.
 */
export type CaseSummary = components['schemas']['CaseSummary'] & {
  /** ADR-012 case origin; narrows the generated `string`. */
  source?: CaseSource;
};

/**
 * A Team the caller belongs to, from `GET /api/v1/teams`.
 *
 * Declared in `types/teams.ts` (its home module) and re-exported here because
 * the case-sharing consumers — share badges, the team filter, the share picker
 * — read their team shape alongside the case shapes.
 */
export type { Team } from './teams';

export type CaseDetail = components['schemas']['CaseDetail'] & {
  /** ADR-012 case origin; narrows the generated `string`. */
  source?: CaseSource;
};

/**
 * The generated `CaseListResponse.cases` is the raw generated `CaseSummary`,
 * which lacks the `source` narrowing above — override `cases` to the
 * narrowed alias.
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
  // Same seam as `CaseListResponse`: carry the `source`-narrowed `CaseSummary`.
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

// ==================== Operator break-glass (ADR-012 D9) ====================

/**
 * One operator's time-boxed license to read ONE case's content
 * (faultmaven#815).
 *
 * `is_live` is computed by the backend and must be used as-is. Approval state,
 * revocation and expiry are three independent ways for a grant to stop
 * authorising, and a UI that re-derived that predicate from `expires_at` alone
 * would disagree with the gate that actually enforces it — showing "active" for
 * a grant the backend has already revoked.
 */
export type BreakGlassGrant = components['schemas']['BreakGlassGrant'];

export type BreakGlassGrantRequest = components['schemas']['BreakGlassGrantRequest'];

/**
 * How an operator content read was authorised.
 *
 * `standing` is the self-hosted posture — the operator and the data controller
 * are the same party, so the read is recorded but not gated. `break_glass` means
 * a live grant authorised it, and names that grant.
 *
 * Read this off the response rather than inferring it from the deployment, for
 * the same reason `AdminCaseListResult` is narrowed on `view`: the response says
 * how it was served, so the UI and the policy cannot drift.
 */
export type OperatorContentAccess = AdminCaseContentResponse['access'];

/** Operator-opened case content — `GET /api/v1/admin/cases/{case_id}`. */
export type AdminCaseContentResponse = Omit<
  components['schemas']['AdminCaseContentResponse'],
  'case'
> & {
  // Same seam as `CaseListResponse`: the generated `CaseDetail` trails the
  // backend on fields the `types/cases.ts` aliases already patch.
  case: CaseDetail;
};

/** Operator-opened transcript — `GET /api/v1/admin/cases/{case_id}/messages`. */
export type AdminCaseMessagesResponse = Omit<
  components['schemas']['AdminCaseMessagesResponse'],
  'messages'
> & {
  messages: CaseMessagesResponse;
};

/**
 * The `POST /cases/search` request body, as the pinned contract declares it.
 *
 * Lives here with the other generated aliases rather than in the client that
 * sends it, so the case domain keeps ONE home for contract types — and so
 * faultmaven-dashboard#165 has an obvious place to put the next dozen.
 *
 * ‼ Build the body by assigning this type to an object literal with the
 * optional keys WRITTEN OUT. TypeScript does not excess-property-check spread
 * operands, so `...(state && { state })` compiles clean even against a
 * contract that has no `state` at all, and the binding becomes decoration.
 * Measured both ways — see `searchCases`.
 */
export type CaseSearchRequest = components['schemas']['CaseSearchRequest'];

// ==================== Frontend-only request / filter shapes ====================
// (no generated counterpart — these are dashboard query/write bags)

export interface CaseFilters {
  state?: CaseState;
  source?: CaseSource;
  /**
   * Creation-date bounds, as CALENDAR DAYS (`YYYY-MM-DD`) — the shape a date
   * picker produces and the shape this filter state is read back into. They are
   * resolved to the API's instants in `listCases` (see `dateRange.ts`), because
   * which instants a day means depends on where the viewer is, and the server
   * correctly refuses to guess.
   *
   * They do NOT apply while `search` is set: `POST /cases/search` accepts no
   * date bounds at all, so `CaseFiltersBar` disables the inputs rather than
   * leave a control that silently does nothing (which is what #51 was).
   */
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

// ============================================================================
// Compile-time guards
// ============================================================================
//
// ‼ `Omit` IS BLIND TO THE RENAME IT LOOKS LIKE IT CATCHES. Its key parameter
// is `keyof any`, not `keyof T`, so `Omit<Wire, 'cases'>` omits NOTHING when
// the wire type no longer has `cases` — and the `& { cases: … }` half then
// puts the field back. The alias goes on promising a key the contract dropped.
//
// Measured on this very file: renaming `CaseListResponse.cases` in
// `api.generated.ts` produced ZERO errors, and `listCases` would have read
// `.cases` as `undefined` and rendered an empty case list with `tsc`,
// `api-types-drift` and the whole suite green. `Pick` constrains to `keyof T`
// and fails the build.
//
// ‼ THE GUARDS DERIVE THEIR KEYS rather than restating them. A hand-written
// `Pick<Wire, 'cases'>` is a second list to keep in step, and the day someone
// overrides a second key and forgets to add it, the guard silently stops
// covering it — the same blindness one level up (faultmaven-dashboard#171).
//
// They live here, in an app file, because `tsconfig.json` excludes
// `src/test/**` and CI's only typecheck (`pnpm typecheck`) runs against it —
// an assertion in a test file is evaluated by nothing. They erase completely.

/**
 * Forces a check to FAIL THE BUILD rather than merely evaluate oddly.
 *
 * A conditional type that resolves to `never` is not an error — it is just
 * `never`. Only a CONSTRAINT rejects it.
 */
type _Assert<T extends true> = T;

/** Each narrowed member is still a subtype of the wire member. */
type _IsSubtype<Narrowed, Wire> = [Narrowed] extends [Wire] ? true : false;

// `Pick<Wire, keyof Narrowed>` is written out per type rather than wrapped in a
// generic helper: inside a generic, `keyof Narrowed` widens to
// `string | number | symbol` and stops satisfying `keyof Wire`, so the helper
// compiles for everything and checks nothing.
export type CaseTypeGuards = {
  listKeys: Pick<components['schemas']['CaseListResponse'], keyof CaseListResponse>;
  listSubtype: _Assert<_IsSubtype<CaseListResponse, components['schemas']['CaseListResponse']>>;

  adminFullKeys: Pick<components['schemas']['AdminCaseListResponse'], keyof AdminCaseFullListResponse>;

  adminMetadataKeys: Pick<
    components['schemas']['AdminCaseMetadataListResponse'],
    keyof AdminCaseMetadataListResponse
  >;

  adminContentKeys: Pick<
    components['schemas']['AdminCaseContentResponse'],
    keyof AdminCaseContentResponse
  >;

  adminMessagesKeys: Pick<
    components['schemas']['AdminCaseMessagesResponse'],
    keyof AdminCaseMessagesResponse
  >;

  // ‼ The `Wire & { source?: CaseSource }` types need a DIFFERENT guard, and
  // the obvious one is a tautology: an intersection is always assignable to
  // its own parts, so `_IsSubtype<CaseSummary, Wire>` is true no matter what
  // the wire does — including dropping `source` entirely, which is the actual
  // risk (the `&` half would keep promising it).
  //
  // The indexed access is what bites: `Wire['source']` stops compiling the
  // moment the wire has no `source`, and the refinement check catches its type
  // changing underneath the narrowing.
  summarySource: _Assert<
    _IsSubtype<CaseSource, NonNullable<components['schemas']['CaseSummary']['source']>>
  >;
  detailSource: _Assert<
    _IsSubtype<CaseSource, NonNullable<components['schemas']['CaseDetail']['source']>>
  >;
  metadataSource: _Assert<
    _IsSubtype<CaseSource, NonNullable<components['schemas']['AdminCaseMetadata']['source']>>
  >;
};
