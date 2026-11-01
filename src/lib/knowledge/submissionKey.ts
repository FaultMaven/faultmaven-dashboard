/**
 * One `Idempotency-Key` per KB submission (FaultMaven/faultmaven#2433).
 *
 * `POST /knowledge/documents` and `POST /knowledge/convert` publish once per
 * key (core contract 14.11.0): a retry under the same key replays the first
 * 201, and an unkeyed request publishes every time. So the key belongs to the
 * SUBMISSION, not the request: one key per identity, the file plus its fields.
 * An unchanged retry carries that identity's key, a change carries another
 * identity's, and reverting the change returns to the first key.
 *
 * The file is identified by `(name, size, lastModified, type)`, not by object.
 * Picking the same file again after a cancel is a new `File` with the same
 * identity, so it is the same submission only when the fields are the same too
 * (picking a file re-fills the title from its name).
 */

export const IDEMPOTENCY_KEY_REUSE = 'IDEMPOTENCY_KEY_REUSE';
export const KB_REQUEST_IN_PROGRESS = 'KB_REQUEST_IN_PROGRESS';

/** How a send settled: a success, one of the two keyed-retry refusals, or any other failure. */
export type SendOutcome = 'succeeded' | 'failed' | typeof KB_REQUEST_IN_PROGRESS | typeof IDEMPOTENCY_KEY_REUSE;

/** The outcome of a failed send, from its refusal's code. */
export function failureOutcome(errorCode: string | undefined): SendOutcome {
  return errorCode === KB_REQUEST_IN_PROGRESS || errorCode === IDEMPOTENCY_KEY_REUSE ? errorCode : 'failed';
}

/** One send of a submission. Settle it exactly once, in a `finally`. */
export interface SubmissionSend {
  readonly key: string;
  settle(outcome: SendOutcome): void;
}

export interface SubmissionKeyHolder {
  /** Start a send: this submission's key, minted and held the first time its identity is seen. */
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

interface Held {
  key: string;
  /** Sends begun under this key and not yet settled. */
  inFlight: number;
  /** A send under this key was told KB_REQUEST_IN_PROGRESS, and its retry is still to come. */
  contested: boolean;
}

export function createSubmissionKeyHolder(): SubmissionKeyHolder {
  // Per identity, never one slot: a slot let an edit-then-revert land under a
  // third key, and let one submission's success drop another's in-flight key.
  const held = new Map<string, Held>();
  return {
    begin(file, fields) {
      const identity = identityOf(file, fields);
      let entry = held.get(identity);
      if (entry === undefined) {
        entry = { key: mintKey(), inFlight: 0, contested: false };
        held.set(identity, entry);
      }
      const own = entry;
      own.inFlight += 1;
      let settled = false;
      // Only this entry: a later send of the identity may already hold a new one.
      const release = () => {
        if (held.get(identity) === own) held.delete(identity);
      };
      return {
        key: own.key,
        settle(outcome) {
          if (settled) return;
          settled = true;
          own.inFlight -= 1;
          if (outcome === KB_REQUEST_IN_PROGRESS) {
            own.contested = true;
          } else if (outcome === IDEMPOTENCY_KEY_REUSE) {
            release();
          } else if (outcome === 'succeeded') {
            // A sibling send still in flight, or told to retry, under this key
            // keeps it: a new key for its retry would publish a second time. Its
            // replay then settles as a success and releases.
            if (own.inFlight === 0 && !own.contested) release();
            else own.contested = false;
          }
        },
      };
    },
  };
}

/** What a user reads when a keyed retry is refused because the first is still running. */
export function stillProcessingMessage(subject: 'upload' | 'conversion', retryAfterSeconds?: number): string {
  const when =
    retryAfterSeconds === undefined
      ? 'shortly'
      : `in about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}`;
  return `This ${subject} is still being processed. Try again ${when} without changing it; it will not be published twice.`;
}

export const KEY_REUSE_MESSAGE = 'This submission changed while it was being retried. Submit it again.';
