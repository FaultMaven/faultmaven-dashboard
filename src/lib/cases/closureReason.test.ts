/**
 * `closure_reason` is an engine-derived CLASSIFICATION, not prose. The Dashboard
 * rendered the raw value under a "Resolution Notes" heading, so a user saw
 * `closed_insufficient_evidence` presented as if it were a sentence someone
 * wrote — and saw it under copy promising resolution notes, on a field that is
 * only ever set for CLOSED cases.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  CLOSURE_REASON_DISPLAY,
  closureReasonDisplay,
} from './closureReason';

describe('closureReasonDisplay', () => {
  it('labels a declined resolution as a confirmed fix, not the bare fallback', () => {
    // Contract 14.8.0: before this entry the Issue tab read "Closed — closed
    // without a recorded resolution" for a case whose fix was confirmed.
    const fallback = closureReasonDisplay('closed_after_investigation');
    const info = closureReasonDisplay('resolution_declined');
    expect(info).not.toEqual(fallback);
    expect(info).toEqual({
      label: 'Fix confirmed',
      description:
        'The fix was confirmed to work; the case was closed rather than marked resolved.',
    });
  });

  it('never leaks the raw key to a user', () => {
    for (const [key, info] of Object.entries(CLOSURE_REASON_DISPLAY)) {
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.label).not.toContain(key);
      expect(info.label).not.toContain('_');
      expect(info.description.length).toBeGreaterThan(0);
    }
  });

  it('degrades an unknown reason instead of showing the token', () => {
    // A case can still carry a value retired from the vocabulary, and the
    // backend can add a reason before this build ships.
    const info = closureReasonDisplay('closed_after_investigation');
    expect(info.label).not.toContain('closed_after_investigation');
    expect(info.label.length).toBeGreaterThan(0);
    expect(info.description.length).toBeGreaterThan(0);
  });

  it('handles null, undefined and the empty string rather than throwing', () => {
    expect(closureReasonDisplay(null).label.length).toBeGreaterThan(0);
    expect(closureReasonDisplay(undefined).label.length).toBeGreaterThan(0);
    expect(closureReasonDisplay('')).toEqual(closureReasonDisplay(null));
  });

  it('degrades a prototype key, not resolving it to a function', () => {
    // `constructor` used to index through to Object, which has no label.
    expect(closureReasonDisplay('constructor')).toEqual(
      closureReasonDisplay('closed_after_investigation'),
    );
  });

  it('returns the real entry for every known reason', () => {
    for (const [key, info] of Object.entries(CLOSURE_REASON_DISPLAY)) {
      expect(closureReasonDisplay(key)).toBe(info);
    }
  });

  it('is the only closure-reason resolution path in the UI', () => {
    // Source-level property, asserted at the source level: the Copilot's
    // equivalent lookup was hand-rolled per consumer and one of them drifted
    // into dropping the row entirely for an unrecognised value.
    const consumers = [
      'src/components/IssueTab.tsx',
      'src/lib/cases/exportMarkdown.ts',
    ];
    for (const rel of consumers) {
      const src = readFileSync(rel, 'utf8');
      expect(
        src.includes('closureReasonDisplay('),
        `${rel} must resolve closure reasons through closureReasonDisplay()`,
      ).toBe(true);
      expect(
        /\{\s*caseDetail\.closure_reason\s*\}/.test(src) ||
          src.includes('lines.push(caseDetail.closure_reason)'),
        `${rel} renders closure_reason raw`,
      ).toBe(false);
    }
  });
});
