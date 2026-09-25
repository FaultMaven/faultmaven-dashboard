import type { components } from '../../types/api.generated';
import type { GuardNarrowing, GuardSubset } from '../../types/contractGuards';

// API types and interfaces

/**
 * A Knowledge Base document, as the PINNED CONTRACT declares it.
 *
 * Bound to the generated schema rather than restated here, so a field the
 * backend renames or drops fails `tsc` in this repository instead of becoming
 * a runtime `undefined` (faultmaven-dashboard#165). The hand-written version
 * this replaces had drifted in exactly that way: it declared a REQUIRED
 * `user_id` that the backend model has never carried, so `doc.user_id`
 * type-checked everywhere and was `undefined` on every response. `team_id` was
 * invented here too, and read nowhere.
 *
 * ‼ THIS IS THE SINGLE-DOCUMENT SHAPE, and only that.
 * `KnowledgeBaseDocument` is the declared `response_model` of
 * `GET /knowledge/documents/{id}`. It is NOT what the other three routes
 * return, and using it for them asserts fields that are never sent — the same
 * defect as `user_id`, with a REQUIRED type, which is worse. Each route below
 * gets the shape it actually answers with.
 *
 * ‼ The contract's name is `KnowledgeBaseDocument`; this alias keeps the local
 * `KBDocument` spelling that 38 references already use. The NAMES differing is
 * why this was never bound before — a grep for `KBDocument` in the contract
 * finds nothing, which reads as "the contract does not cover this".
 */
export type KBDocument = components['schemas']['KnowledgeBaseDocument'];

/**
 * Type alias for admin KB documents
 * Structurally identical to KBDocument, used for semantic clarity in admin-scoped contexts
 */
export type AdminKBDocument = KBDocument;

/**
 * One row of `GET /knowledge/documents` — a STRICT SUBSET of the document.
 *
 * The list route is `-> dict` with no `response_model`, so the contract types
 * its whole body `{[key: string]: unknown}` and `api-types-drift` can see
 * nothing about it. The rows are assembled by hand in
 * `knowledge_service.list_documents` and carry exactly the keys below —
 * notably NO `content`, `status`, `category`, `verification_level`,
 * `verification_status` or `source_suggestion_id`. The single-document route
 * has those filled by FastAPI's `response_model` coercion; this one does not.
 *
 * So it is derived with `Pick`, not aliased to `KBDocument`. That binds every
 * NAME and TYPE to the contract — rename `owner_id` upstream and this stops
 * compiling — while asserting only the fields the endpoint actually sends.
 * Aliasing to the full document instead would promise `content: string` on
 * every row, and `doc.content.slice(0, 200)` for a preview would compile and
 * throw. Bind the names, not guarantees the server never made.
 */
export type KBDocumentListItem = Pick<
  KBDocument,
  | 'document_id'
  | 'title'
  | 'document_type'
  | 'tags'
  | 'scope'
  | 'owner_id'
  | 'source_url'
  | 'created_at'
  | 'updated_at'
  | 'metadata'
>;

/** Admin-scoped list rows are the same shape; the alias marks intent. */
export type AdminKBDocumentListItem = KBDocumentListItem;

/**
 * What `POST /knowledge/documents` answers with — an upload RECEIPT, not a
 * document. `{document_id, status, metadata: {title, document_type, category,
 * tags, created_at}}`. Note `title` and `created_at` are NESTED under
 * `metadata` here, which is the shape most likely to be dereferenced wrongly.
 * No caller reads it today; typing it honestly is what keeps that true.
 */
export type KBDocumentUploadResult = Pick<KBDocument, 'document_id' | 'status' | 'metadata'>;

/**
 * What `PUT /knowledge/documents/{id}` answers with: the updated fields only —
 * no `scope`, `owner_id`, `created_at` or `verification_*`. Also an untyped
 * `-> dict` upstream.
 */
export type KBDocumentUpdateResult = Pick<
  KBDocument,
  'document_id' | 'title' | 'content' | 'document_type' | 'category' | 'tags' | 'updated_at'
>;

/**
 * Response from document list endpoints
 */
export interface ScopeCounts {
  global: number;
  team: number;
  personal: number;
}

export interface DocumentListResponse {
  documents: KBDocumentListItem[];
  total_count: number;
  limit: number;
  offset: number;
  scope_counts?: ScopeCounts;
}

/**
 * Response from admin document list endpoints
 */
export interface AdminDocumentListResponse {
  documents: AdminKBDocumentListItem[];
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

// =============================================================================
// Compile-time guards
// =============================================================================
//
// These live HERE, not in a test: a type-level assertion in an app file is
// enforced by `pnpm typecheck`, the same check the build that ships runs.
// `tsconfig.json` excludes `src/test/**`, so a test file is type-checked only
// by the separate `pnpm typecheck:tests` (and `pnpm lint:tests` is ESLint,
// which reports lint violations, not assignability).
//
// They erase completely — no runtime cost, no emitted code.

/**
 * `KBDocument` is the contract schema itself, BOTH WAYS ROUND.
 *
 * One direction would be satisfied by a hand-written SUBSET, which is precisely
 * the shape that drifts without anyone noticing (the `user_id` mistake, in its
 * next disguise). Two guards, one per direction, is how "exactly this shape" is
 * said — and each is a constraint, so it rejects rather than evaluates.
 *
 * ‼ BOTH ARE TAUTOLOGIES TODAY, and that is not a defect — it is what they are
 * for. `KBDocument` IS the schema (line 29), so nothing can make either side
 * disagree while that alias holds. They are a TRIPWIRE for the day someone
 * replaces the alias with a hand-written shape, which is the drift this file
 * has already suffered once. Do not read them as evidence that the KB shapes
 * are being checked against the contract: the alias is what does that.
 *
 * ‼ The previous version could not even do that much. It was a nested
 * conditional resolving to `never`, and a conditional that resolves to `never`
 * IS NOT AN ERROR — `document: never` is a legal member, so it reported nothing
 * no matter what it found. It was the fourth divergent copy of the idiom #174
 * consolidated.
 */
type _DocumentIsContractShape = GuardNarrowing<
  components['schemas']['KnowledgeBaseDocument'],
  KBDocument
>;
type _ContractIsDocumentShape = GuardNarrowing<
  KBDocument,
  components['schemas']['KnowledgeBaseDocument']
>;

/**
 * Every key of the list row exists on the contract document, and each one still
 * has a compatible type.
 *
 * A SUBSET is not a subtype — it is missing required properties — so this is
 * `GuardSubset`, not `GuardNarrowing`. It is `Pick`-derived today, so both
 * halves are true by construction; that is the point. Replace it with a
 * hand-written object type that invents a field, or that retypes one it does
 * carry, and the guard stops compiling — here, in the build that ships.
 */
type _ListItemMatchesContract = GuardSubset<KBDocument, KBDocumentListItem>;

/**
 * The other two read models, guarded the same way.
 *
 * ‼ EVERY subset, not the one that happened to have a guard already.
 * `KBDocumentUploadResult` and `KBDocumentUpdateResult` are the same shape and
 * the same risk as `KBDocumentListItem`, and shipped unguarded beside it — a
 * guard applied to one of three siblings is how the gap reopens.
 */
type _UploadResultMatchesContract = GuardSubset<KBDocument, KBDocumentUploadResult>;
type _UpdateResultMatchesContract = GuardSubset<KBDocument, KBDocumentUpdateResult>;

// Referenced so `noUnusedLocals` keeps them, and so a reader sees they are
// assertions rather than dead aliases.
export type KnowledgeTypeGuards = {
  document: _DocumentIsContractShape;
  documentReverse: _ContractIsDocumentShape;
  listItem: _ListItemMatchesContract;
  uploadResult: _UploadResultMatchesContract;
  updateResult: _UpdateResultMatchesContract;
};
