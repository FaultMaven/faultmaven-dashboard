import type { CaseState } from './case';

export type { CaseState };

export type InvestigationStage =
  | 'symptom_verification'
  | 'hypothesis_formulation'
  | 'hypothesis_validation'
  | 'solution';

export interface CaseSummary {
  case_id: string;
  title: string;
  description: string;
  state: CaseState;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  closure_reason: string | null;
  user_id: string;
  organization_id: string;
  current_turn: number;
  milestones_completed: number;
  total_milestones: number;
  is_archived: boolean;
  is_stuck: boolean;
  is_terminal: boolean;
}

export interface CaseDetail extends Omit<CaseSummary, 'milestones_completed'> {
  turns_without_progress: number;
  current_stage: InvestigationStage | null;
  milestones_completed: string[];
  pending_milestones: string[];
  evidence_count: number;
  hypothesis_count: number;
  solution_count: number;
  degraded_mode_active: boolean;
  escalated: boolean;
}

export interface CaseListResponse {
  cases: CaseSummary[];
  total_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface CaseFilters {
  state?: CaseState;
  date_from?: string;
  date_to?: string;
  search?: string;
  include_archived?: boolean;
}

export interface CaseAnnotation {
  resolution_notes?: string;
  closure_reason?: string;
}

export interface CaseMessage {
  message_id: string;
  case_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface CaseMessagesResponse {
  messages: CaseMessage[];
  total_count: number;
  retrieved_count?: number;
}

export interface UploadedFile {
  file_id: string;
  filename: string;
  size_bytes: number;
  size_display: string;
  uploaded_at_turn: number;
  uploaded_at: string;
  source_type: string;
  analysis_status: string;
  summary?: string | null;
}

export interface UploadedFilesResponse {
  case_id: string;
  total_count: number;
  files: UploadedFile[];
}

export interface DerivedEvidence {
  evidence_id: string;
  summary: string;
  category: string;
  collected_at_turn: number;
  source_type: string;
  primary_purpose?: string | null;
  related_hypothesis_ids?: string[];
}

export interface UploadedFileDetails {
  file_id: string;
  filename: string;
  size_bytes: number;
  size_display: string;
  uploaded_at_turn: number;
  uploaded_at: string;
  source_type: string;
  data_type: string;
  summary?: string | null;
  evidence_count: number;
  derived_evidence?: DerivedEvidence[];
}

export type HypothesisStatus =
  | 'captured'
  | 'active'
  | 'validated'
  | 'refuted'
  | 'inconclusive'
  | 'retired';

export interface HypothesisSummary {
  hypothesis_id: string;
  text: string;
  likelihood: number;
  status: HypothesisStatus;
  evidence_count: number;
}

export type CaseUIStatus = 'inquiry' | 'investigating' | 'resolved' | 'closed';

export interface CaseUIResponse {
  case_id: string;
  state: CaseUIStatus;
  title: string;
  current_turn: number;
  active_hypotheses?: HypothesisSummary[];
  agent_status?: string;
}

export interface SourceFileReference {
  file_id: string;
  filename: string;
  uploaded_at_turn: number;
}

export interface RelatedHypothesis {
  hypothesis_id: string;
  statement: string;
  /** SUPPORTS | REFUTES | NEUTRAL */
  stance: string;
}

export interface EvidenceDetails {
  evidence_id: string;
  case_id: string;
  summary: string;
  /** SYMPTOM_EVIDENCE | CAUSAL_EVIDENCE | MITIGATION_EVIDENCE | SOLUTION_EVIDENCE */
  category: string;
  primary_purpose: string;
  collected_at_turn: number;
  collected_at: string;
  collected_by: string;
  source_file?: SourceFileReference | null;
  related_hypotheses?: RelatedHypothesis[];
  /** Verbatim quote from the source — present when the LLM grounded the summary in a specific slice. */
  extract?: string | null;
  analysis?: string | null;
}

export interface CaseEvidenceListResponse {
  case_id: string;
  total_count: number;
  evidence: EvidenceDetails[];
}

export interface CaseReport {
  report_id: string;
  case_id: string;
  report_type: string;
  generated_at: string;
  content: string;
}

// Report generation types
export type ReportType = 'resolution_summary' | 'closure_summary' | 'runbook';

export interface ReportGenerationRequest {
  report_types: ReportType[];
}

export interface ReportGenerationResponse {
  case_id: string;
  reports: CaseReport[];
  remaining_regenerations: number;
}

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

// Case issue (structured investigation outcome for Issue tab)
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

// Knowledge suggestion types
export type SuggestionStatus = 'pending_review' | 'approved' | 'rejected' | 'draft';
export type PIIScanStatus = 'not_scanned' | 'scanning' | 'clean' | 'pii_detected' | 'remediated' | 'scan_failed';

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
