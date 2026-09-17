import type { components } from '../../types/api.generated';

// API types and interfaces

/**
 * A Knowledge Base document, as the PINNED CONTRACT declares it.
 *
 * Bound to the generated schema rather than restated here, so a field the
 * backend renames or drops fails `tsc` in this repository instead of becoming
 * a runtime `undefined` (faultmaven-dashboard#165). The hand-written version
 * this replaces had drifted in exactly that way: it declared a REQUIRED
 * `user_id` that the backend model has never carried, so `doc.user_id`
 * type-checked everywhere and was `undefined` on every response.
 *
 * `user_id` was not the only invention: `team_id` was declared here too and is
 * likewise absent from the contract. Nothing read it, which is the point —
 * a hand-written shape accumulates fields nobody can disprove.
 *
 * ‼ The contract's name is `KnowledgeBaseDocument`; this alias keeps the local
 * `KBDocument` spelling that 38 references already use. The NAMES differing is
 * why this was never bound before — a grep for `KBDocument` in the contract
 * finds nothing, which reads as "the contract does not cover this".
 *
 * ⚠️ Optional here does not mean absent on the wire. `tags`, `metadata` and the
 * `verification_*` trio are Pydantic fields WITH DEFAULTS, so FastAPI marks
 * them not-required in the schema and `openapi-typescript` renders them `?`.
 * The server fills every one of them on a response. Guard them (`?? []`) at
 * the point of use rather than asserting them away: the guard costs nothing
 * and is correct if the field ever genuinely goes missing.
 */
export type KBDocument = components['schemas']['KnowledgeBaseDocument'];

/**
 * Type alias for admin KB documents
 * Structurally identical to KBDocument, used for semantic clarity in admin-scoped contexts
 */
export type AdminKBDocument = KBDocument;

/**
 * Response from document list endpoints
 */
export interface ScopeCounts {
  global: number;
  team: number;
  personal: number;
}

export interface DocumentListResponse {
  documents: KBDocument[];
  total_count: number;
  limit: number;
  offset: number;
  scope_counts?: ScopeCounts;
}

/**
 * Response from admin document list endpoints
 */
export interface AdminDocumentListResponse {
  documents: AdminKBDocument[];
  total_count: number;
  limit: number;
  offset: number;
  scope_counts?: ScopeCounts;
}

/**
 * Parameters for uploading a document to personal KB
 */
export interface UploadDocumentParams {
  file: File;
  title: string;
  document_type: string;
  /** Which tier to publish at. `global` requires platform admin. */
  scope: string;
  /** Required when scope is `team`. */
  team_id?: string;
  category?: string;
  tags?: string;
  source_url?: string;
  description?: string;
}

/**
 * Parameters for uploading a document to admin KB
 */
export interface UploadAdminDocumentParams {
  /** Publishing tier. Required since FaultMaven/faultmaven#1377 — the upload
   *  route no longer assumes global, and a missing value stringifies to the
   *  literal "undefined" in the FormData the client builds. */
  scope: string;
  file: File;
  title: string;
  document_type: string;
  category?: string;
  tags?: string;
  source_url?: string;
  description?: string;
}
