import { describe, it, expect } from 'vitest';
import {
  createSubmissionKeyHolder,
  type SendOutcome,
  type SubmissionKeyHolder,
} from '../../../lib/knowledge/submissionKey';

const pick = (name = 'redis.md', lastModified = 1000) =>
  new File(['# rb'], name, { type: 'text/markdown', lastModified });
const fields = { title: 'Redis', scope: 'personal' };
const edited = { ...fields, title: 'Redis OOM' };

/** One send that settles at once with `outcome`; the key it carried. */
function send(keys: SubmissionKeyHolder, file: File, f: Record<string, string>, outcome: SendOutcome = 'failed') {
  const s = keys.begin(file, f);
  s.settle(outcome);
  return s.key;
}

describe('createSubmissionKeyHolder', () => {
  it('holds one key for the same file identity and fields, a NEW File object included', () => {
    const keys = createSubmissionKeyHolder();
    const first = send(keys, pick(), fields);
    // Same fields in another order: the identity serializes them sorted.
    expect(send(keys, pick(), { scope: 'personal', title: 'Redis' })).toBe(first);
  });

  it('mints a new key for a changed field, a different file, or after a success', () => {
    const keys = createSubmissionKeyHolder();
    const first = send(keys, pick(), fields);
    const editedKey = send(keys, pick(), edited);
    expect(editedKey).not.toBe(first);
    const otherFile = send(keys, pick('redis.md', 2000), edited, 'succeeded');
    expect(otherFile).not.toBe(editedKey);
    expect(send(keys, pick('redis.md', 2000), edited)).not.toBe(otherFile);
  });

  it('holds a key per identity: a revert returns to the first key, and a success releases only its own', () => {
    const keys = createSubmissionKeyHolder();
    const first = send(keys, pick(), fields);
    const editedKey = send(keys, pick(), edited, 'succeeded');
    expect(send(keys, pick(), fields)).toBe(first);
    expect(send(keys, pick(), edited)).not.toBe(editedKey);
  });

  it('a success keeps the key while a sibling send waits on it; the sibling’s replay releases it', () => {
    const keys = createSubmissionKeyHolder();
    const a = keys.begin(pick(), fields);
    const b = keys.begin(pick(), fields);
    b.settle('KB_REQUEST_IN_PROGRESS');
    a.settle('succeeded');
    expect(send(keys, pick(), fields, 'succeeded')).toBe(a.key);
    expect(send(keys, pick(), fields)).not.toBe(a.key);
  });

  it('mints keys inside the server grammar', () => {
    const key = createSubmissionKeyHolder().begin(pick(), fields).key;
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,255}$/);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});
