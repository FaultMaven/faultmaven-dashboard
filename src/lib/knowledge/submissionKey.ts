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

export interface SubmissionKeyHolder {
  /** This submission's key, minted and held the first time its identity is seen. */
  keyFor(file: File, fields: Record<string, string>): string;
  /** Drop this submission's key only: its next send takes a new one, others keep theirs. */
  release(file: File, fields: Record<string, string>): void;
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

export function createSubmissionKeyHolder(): SubmissionKeyHolder {
  // Per identity, never one slot: a slot let an edit-then-revert land under a
  // third key, and let one submission's success drop another's in-flight key.
  const held = new Map<string, string>();
  return {
    keyFor(file, fields) {
      const identity = identityOf(file, fields);
      let key = held.get(identity);
      if (key === undefined) {
        key = mintKey();
        held.set(identity, key);
      }
      return key;
    },
    release(file, fields) {
      held.delete(identityOf(file, fields));
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
