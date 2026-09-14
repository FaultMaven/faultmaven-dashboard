import { describe, it, expect } from 'vitest';
import { describe as describeHop } from '../../../scripts/report-contract-hop.mjs';

/**
 * The hop report's own failure states.
 *
 * It exists because `api-types-drift` is satisfied by a hop of ANY size, so a
 * pull request described as adopting one contract can carry several — which
 * happened, and carried an authorization change nobody was shown.
 *
 * A disclosure tool has exactly two outputs it must never produce by accident:
 * silence, and confidence. Both were reachable in the first version. It also
 * screen-scrapes `#` comments out of a Python source file across the network,
 * so every way that coupling can break has to resolve to SAYING SO.
 */

const pin = (contractVersion: string) => ({
  repository: 'FaultMaven/faultmaven',
  ref: 'abc123',
  contractVersion,
});

/** The real file's shape, including the trap: notes are NOT in version order. */
const NOTES = [
  '# 3.7.0 — MINOR. The ordinal reaches the evidence rows.',
  '# Second line of 3.7.0.',
  '#',
  '# 3.5.0 — MINOR. The ordinal reaches the conversation rows.',
  '',
  '# 2.0.0 — MAJOR. The first act of the version.',
  '',
  '# 3.6.0 — MINOR. Upload gains `scope`, and the operator gate moves.',
  '# Appended below 2.0.0 because 3.5.0 was taken while it sat in review.',
  'API_CONTRACT_VERSION = "3.7.0"',
  '',
].join('\n');

describe('the hop report', () => {
  it('says nothing when the pin did not move', () => {
    expect(describeHop({ before: pin('3.7.0'), after: pin('3.7.0'), notes: NOTES })).toBe('');
  });

  it('says nothing when there is no base to compare against', () => {
    // A shallow clone or a first commit. Silence is right HERE — there is no
    // claim to check — and wrong everywhere else in this file.
    expect(describeHop({ before: null, after: pin('3.7.0'), notes: NOTES })).toBe('');
  });

  it('names one contract when exactly one was crossed', () => {
    const out = describeHop({ before: pin('3.6.0'), after: pin('3.7.0'), notes: NOTES });
    expect(out).toContain('One contract adopted');
    expect(out).toContain('The ordinal reaches the evidence rows');
    expect(out).not.toContain('contracts adopted, not one');
  });

  it('WARNS when the bump crossed more than one', () => {
    // The whole point. 3.5.0 → 3.7.0 carries 3.6.0 with it.
    const out = describeHop({ before: pin('3.5.0'), after: pin('3.7.0'), notes: NOTES });
    expect(out).toContain('2 contracts adopted, not one');
    expect(out).toContain('Upload gains `scope`');
    expect(out).toContain('The ordinal reaches the evidence rows');
  });

  it('does not run an entry past the end of the comments', () => {
    // The notes are not in version order, so the LAST entry in the file has no
    // header after it. Ending an entry at "the next header" ran it to EOF and
    // pasted `API_CONTRACT_VERSION = "3.7.0"` into the reviewer-facing prose —
    // measured, not imagined: it is what the first version printed.
    const out = describeHop({ before: pin('3.5.0'), after: pin('3.7.0'), notes: NOTES });
    expect(out).not.toContain('API_CONTRACT_VERSION');
  });

  it('does NOT call a parse failure "one contract"', () => {
    // Zero is not one. A reformatted header, notes moved to a changelog, an
    // entry not yet written — all yield no matches, and the first version
    // printed the most reassuring sentence above an empty code fence: the
    // state most needing a human eye wearing the face of the safest one.
    const out = describeHop({
      before: pin('3.5.0'),
      after: pin('3.7.0'),
      notes: '# 3.7.0 : MINOR. Reformatted so the parser misses it.\n',
    });
    expect(out).toContain('No contract entries matched');
    expect(out).not.toContain('One contract adopted');
  });

  it('says so when the notes could not be read at all', () => {
    const out = describeHop({ before: pin('3.5.0'), after: pin('3.7.0'), notes: '' });
    expect(out).toContain('unlisted');
    expect(out).toContain('by hand');
  });

  it('reports a DOWNGRADE without refusing it', () => {
    // Rolling a contract back is a legitimate act; this is a disclosure, not a
    // rule, so it says what happened and stops.
    const out = describeHop({ before: pin('3.7.0'), after: pin('3.5.0'), notes: NOTES });
    expect(out).toContain('Not an ordinary forward hop');
  });

  it('reports an unparseable version rather than swallowing it', () => {
    const out = describeHop({ before: pin('3.5'), after: pin('3.7.0'), notes: NOTES });
    expect(out).toContain('Not an ordinary forward hop');
  });

  it('accepts an em dash or a hyphen in the header', () => {
    // The upstream file uses an em dash today. Tolerating a hyphen costs
    // nothing and removes one way for the report to go quiet on a reformat.
    const out = describeHop({
      before: pin('3.6.0'),
      after: pin('3.7.0'),
      notes: '# 3.7.0 - MINOR. Hyphenated.\n',
    });
    expect(out).toContain('One contract adopted');
    expect(out).toContain('Hyphenated');
  });
});

import { isExactVersion } from '../../../scripts/lib/exact-version.mjs';

describe('the generator pin rule', () => {
  /**
   * `packageParity` requires the two generated clients byte-identical, so the
   * generator is as much a part of the output as the spec is. The first version
   * of this rule blacklisted `^` and `~` — which passes every other range form
   * while both repositories agree on the same string, and that agreement is
   * exactly what makes the drift invisible until the next install.
   */
  it.each(['7.10.1', '7.10.1-beta.1', '7.10.1+build.2'])('accepts the exact version %s', (v) => {
    expect(isExactVersion(v)).toBe(true);
  });

  it.each(['^7.10.1', '~7.10.1', '>=7.10.1', '7.x', '7.10.x', '*', 'latest', '7.10.1 - 7.11.0', ''])(
    'refuses the range %o',
    (v) => {
      expect(isExactVersion(v)).toBe(false);
    },
  );

  it('refuses a missing version rather than treating absence as exact', () => {
    expect(isExactVersion(undefined)).toBe(false);
    expect(isExactVersion(null)).toBe(false);
  });
});
