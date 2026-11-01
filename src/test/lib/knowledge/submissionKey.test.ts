import { describe, it, expect } from 'vitest';
import { createSubmissionKeyHolder } from '../../../lib/knowledge/submissionKey';

const pick = (name = 'redis.md', lastModified = 1000) =>
  new File(['# rb'], name, { type: 'text/markdown', lastModified });
const fields = { title: 'Redis', scope: 'personal' };

describe('createSubmissionKeyHolder', () => {
  it('holds one key for the same file identity and fields, a NEW File object included', () => {
    const keys = createSubmissionKeyHolder();
    const first = keys.keyFor(pick(), fields);
    // Same fields in another order: the identity serializes them sorted.
    expect(keys.keyFor(pick(), { scope: 'personal', title: 'Redis' })).toBe(first);
  });

  it('mints a new key for a changed field, a different file, or after a release', () => {
    const keys = createSubmissionKeyHolder();
    const first = keys.keyFor(pick(), fields);
    const edited = keys.keyFor(pick(), { ...fields, title: 'Redis OOM' });
    expect(edited).not.toBe(first);
    const otherFile = keys.keyFor(pick('redis.md', 2000), { ...fields, title: 'Redis OOM' });
    expect(otherFile).not.toBe(edited);
    keys.release(pick('redis.md', 2000), { ...fields, title: 'Redis OOM' });
    expect(keys.keyFor(pick('redis.md', 2000), { ...fields, title: 'Redis OOM' })).not.toBe(otherFile);
  });

  it('holds a key per identity: a revert returns to the first key, and a release drops only its own', () => {
    const keys = createSubmissionKeyHolder();
    const first = keys.keyFor(pick(), fields);
    const edited = keys.keyFor(pick(), { ...fields, title: 'Redis OOM' });
    expect(keys.keyFor(pick(), fields)).toBe(first);
    keys.release(pick(), { ...fields, title: 'Redis OOM' });
    expect(keys.keyFor(pick(), fields)).toBe(first);
    expect(keys.keyFor(pick(), { ...fields, title: 'Redis OOM' })).not.toBe(edited);
  });

  it('mints keys inside the server grammar', () => {
    const key = createSubmissionKeyHolder().keyFor(pick(), fields);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,255}$/);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});
