import { describe, it, expect } from 'vitest';
import { kbSubmissionKeys, type SubmissionKeyHolder } from '../../../lib/knowledge/submissionKey';

const pick = (name = 'redis.md', lastModified = 1000) =>
  new File(['# rb'], name, { type: 'text/markdown', lastModified });
const fields = { title: 'Redis', scope: 'personal' };
const edited = { ...fields, title: 'Redis OOM' };

// The holders live for the loaded app, so each test takes its own user.
let user = 0;
const freshKeys = () => kbSubmissionKeys('upload', `unit-${++user}`);
const keyOf = (keys: SubmissionKeyHolder, file: File, f: Record<string, string>) => keys.begin(file, f).key;

describe('kbSubmissionKeys', () => {
  it('holds one key for the same file identity and fields, a NEW File object included', () => {
    const keys = freshKeys();
    const first = keyOf(keys, pick(), fields);
    // Same fields in another order: the identity serializes them sorted.
    expect(keyOf(keys, pick(), { scope: 'personal', title: 'Redis' })).toBe(first);
  });

  it('mints a key per identity: a changed field or file takes its own, and a revert returns to the first', () => {
    const keys = freshKeys();
    const first = keyOf(keys, pick(), fields);
    const editedKey = keyOf(keys, pick(), edited);
    const otherFile = keyOf(keys, pick('redis.md', 2000), fields);
    expect(new Set([first, editedKey, otherFile]).size).toBe(3);
    expect(keyOf(keys, pick(), fields)).toBe(first);
    expect(keyOf(keys, pick(), edited)).toBe(editedKey);
  });

  it('a refusal as reused releases only its own key', () => {
    const keys = freshKeys();
    const first = keys.begin(pick(), fields);
    const second = keys.begin(pick(), fields);
    expect(second.key).toBe(first.key);
    first.refusedAsReused();
    const k2 = keyOf(keys, pick(), fields);
    expect(k2).not.toBe(first.key);
    // `second` carried the released key: its refusal leaves k2 held.
    second.refusedAsReused();
    expect(keyOf(keys, pick(), fields)).toBe(k2);
  });

  it('keeps one holder per route and user for the life of the app', () => {
    const id = `unit-${++user}`;
    expect(kbSubmissionKeys('upload', id)).toBe(kbSubmissionKeys('upload', id));
    const key = keyOf(kbSubmissionKeys('upload', id), pick(), fields);
    expect(keyOf(kbSubmissionKeys('upload', `${id}-other`), pick(), fields)).not.toBe(key);
    expect(keyOf(kbSubmissionKeys('convert', id), pick(), fields)).not.toBe(key);
  });

  it('mints keys inside the server grammar', () => {
    const key = keyOf(freshKeys(), pick(), fields);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,255}$/);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});
