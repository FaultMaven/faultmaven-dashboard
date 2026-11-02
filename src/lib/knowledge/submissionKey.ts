/**
 * One `Idempotency-Key` per KB submission (FaultMaven/faultmaven#2433).
 *
 * `POST /knowledge/documents` and `POST /knowledge/convert` publish once per
 * key (core contract 14.11.0): a send under a key core already answered replays
 * that 201, and an unkeyed request publishes every time. So the key belongs to
 * the SUBMISSION, not the request. The rule:
 * - one key per submission identity, per signed-in user, until a page reload.
 *   The holders are module-level, so in-app navigation keeps them;
 * - only an `IDEMPOTENCY_KEY_REUSE` refusal of that key releases it;
 * - so an unchanged retry, and an identical re-submission after a 201, replay
 *   instead of publishing again.
 *
 * A runbook's receipt is deleted with the runbook, so after deleting it an
 * identical upload runs again. A conversion's receipt lives as long as its job,
 * which the Dashboard never deletes (a draft delete is a soft delete).
 *
 * The identity is the file's `(name, size, lastModified, type)` plus the
 * fields, not the `File` object. Picking the same file again is a new `File`
 * with the same identity, so it is the same submission only when the fields are
 * the same too (picking a file re-fills the title from its name).
 */

export const IDEMPOTENCY_KEY_REUSE = 'IDEMPOTENCY_KEY_REUSE';
export const KB_REQUEST_IN_PROGRESS = 'KB_REQUEST_IN_PROGRESS';
export const IDEMPOTENCY_REPLAY_UNAVAILABLE = 'IDEMPOTENCY_REPLAY_UNAVAILABLE';
export const KB_INGEST_OUTCOME_UNKNOWN = 'KB_INGEST_OUTCOME_UNKNOWN';

/** One send of a submission. */
export interface SubmissionSend {
  readonly key: string;
  /** Core refused this key as reused by other content: the next send mints another. */
  refusedAsReused(): void;
}

export interface SubmissionKeyHolder {
  /** This submission's key: minted the first time its identity is sent, held after. */
  begin(file: File, fields: Record<string, string>): SubmissionSend;
}

function identityOf(file: File, fields: Record<string, string>): string {
  const ordered = Object.keys(fields).sort().map((name) => [name, fields[name]]);
  return JSON.stringify([file.name, file.size, file.lastModified, file.type, ordered]);
}

// `getRandomValues`, never `crypto.randomUUID()`: randomUUID exists only in a
// secure context, and a self-hosted Dashboard at http://<lan-ip>:3333 is not one.
function mintKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function createSubmissionKeyHolder(): SubmissionKeyHolder {
  const held = new Map<string, string>();
  return {
    begin(file, fields) {
      const identity = identityOf(file, fields);
      const key = held.get(identity) ?? mintKey();
      held.set(identity, key);
      return {
        key,
        refusedAsReused() {
          // Only this send's own entry: a later send of the identity may
          // already hold a newer key, which this refusal says nothing about.
          if (held.get(identity) === key) held.delete(identity);
        },
      };
    },
  };
}

const holders = new Map<string, SubmissionKeyHolder>();

/**
 * The holder for one route and signed-in user, kept for the life of the loaded
 * app. Per user, because core keeps its receipts per author: another user in
 * the same tab never sends a key minted for someone else.
 */
export function kbSubmissionKeys(route: 'upload' | 'convert', userId: string): SubmissionKeyHolder {
  const slot = `${route}:${userId}`;
  let holder = holders.get(slot);
  if (holder === undefined) {
    holder = createSubmissionKeyHolder();
    holders.set(slot, holder);
  }
  return holder;
}

/** What a user reads when a keyed retry is refused because the first is still running. */
export function stillProcessingMessage(subject: 'upload' | 'conversion', retryAfterSeconds?: number): string {
  const when =
    retryAfterSeconds === undefined
      ? 'shortly'
      : `in about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}`;
  return `This ${subject} is still being processed. Try again ${when} from this tab, without changing it or reloading; it will not be published twice.`;
}

export const KEY_REUSE_MESSAGE = "The file's contents differ from what was submitted under this name. Submit it again.";
