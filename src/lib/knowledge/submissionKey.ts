/**
 * One `Idempotency-Key` per KB submission (FaultMaven/faultmaven#2433).
 *
 * `POST /knowledge/documents` and `POST /knowledge/convert` publish once per
 * key (core contract 14.11.0): a retry under the same key replays the first
 * 201, and an unkeyed request publishes every time. So the key belongs to the
 * SUBMISSION, not the request. An unchanged retry carries the held key; any
 * change to the file or a field carries a new one.
 *
 * The file is identified by `(name, size, lastModified, type)`, not by object:
 * picking the same file again after a cancel is a new `File` with the same
 * identity, and it is the same submission.
 */

export const IDEMPOTENCY_KEY_REUSE = 'IDEMPOTENCY_KEY_REUSE';
export const KB_REQUEST_IN_PROGRESS = 'KB_REQUEST_IN_PROGRESS';

export interface SubmissionKeyHolder {
  /** The held key when `file` and `fields` match the held submission; otherwise a new one, held. */
  keyFor(file: File, fields: Record<string, string>): string;
  /** Drop the held key: the next submission takes a new one. */
  release(): void;
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
  let held: { identity: string; key: string } | null = null;
  return {
    keyFor(file, fields) {
      const identity = identityOf(file, fields);
      if (held?.identity !== identity) held = { identity, key: mintKey() };
      return held.key;
    },
    release() {
      held = null;
    },
  };
}

/** What a user reads when a keyed retry is refused because the first is still running. */
export function stillProcessingMessage(subject: 'upload' | 'conversion', retryAfterSeconds?: number): string {
  const when =
    retryAfterSeconds === undefined
      ? 'shortly'
      : `in about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}`;
  return `This ${subject} is still being processed. Try again ${when}; it will not be published twice.`;
}

export const KEY_REUSE_MESSAGE = 'This submission changed while it was being retried. Submit it again.';
