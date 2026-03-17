import type { CaseStatus } from './case';

export type { CaseStatus };

export type InvestigationStage =
  | 'symptom_verification'
  | 'hypothesis_formulation'
  | 'hypothesis_validation'
  | 'solution';

export interface CaseSummary {
  case_id: string;
  title: string;
  description: string;
  status: CaseStatus;
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
  is_stuck: boolean;
  is_terminal: boolean;
}

export interface CaseDetail extends CaseSummary {
  turns_without_progress: number;
  current_stage: InvestigationStage | null;
  milestones_completed_list: string[];
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
  status?: CaseStatus;
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
}

export interface CaseEvidenceFile {
  data_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface CaseEvidenceResponse {
  files: CaseEvidenceFile[];
  total_count: number;
}

export interface CaseReport {
  report_id: string;
  case_id: string;
  report_type: string;
  created_at: string;
  content: string;
}
