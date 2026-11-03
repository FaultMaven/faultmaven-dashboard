/**
 * `closure_reason` is an engine-derived CLASSIFICATION, not prose. The Dashboard
 * rendered the raw value under a "Resolution Notes" heading, so a user saw
 * `closed_insufficient_evidence` presented as if it were a sentence someone
 * wrote — and saw it under copy promising resolution notes, on a field that is
 * only ever set for CLOSED cases.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import vocabularies from '../../types/contract-vocabularies.json';
import {
  CLOSURE_REASON_DISPLAY,
  closureReasonDisplay,
} from './closureReason';

// No published meaning covers a reason this build does not know, so the
// fallback is client copy.
const FALLBACK = {
  label: 'Closed',
  description: 'The case was closed without a recorded resolution.',
};

describe('closureReasonDisplay', () => {
  it('labels exactly the ClosureReason values the vendored contract publishes', () => {
    const published = vocabularies.ClosureReason.map(({ value }) => value);
    expect(Object.keys(CLOSURE_REASON_DISPLAY).sort()).toEqual(published.sort());
  });

  it('pairs every published reason with its label and its published meaning, verbatim', () => {
    // FaultMaven/faultmaven#2411, Q2: the meaning is the contract's, not ours.
    for (const { value, meaning } of vocabularies.ClosureReason) {
      expect(closureReasonDisplay(value)).toEqual({
        label: CLOSURE_REASON_DISPLAY[value as keyof typeof CLOSURE_REASON_DISPLAY].label,
        description: meaning,
      });
    }
  });

  it('never leaks the raw key to a user', () => {
    for (const [key, info] of Object.entries(CLOSURE_REASON_DISPLAY)) {
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.label).not.toContain(key);
      expect(info.label).not.toContain('_');
    }
  });

  it('degrades an unknown or retired reason instead of showing the token', () => {
    // A case can still carry a value retired from the vocabulary, and the
    // backend can add a reason before this build ships.
    expect(closureReasonDisplay('closed_after_investigation')).toEqual(FALLBACK);
  });

  it('handles null, undefined and the empty string rather than throwing', () => {
    expect(closureReasonDisplay(null)).toEqual(FALLBACK);
    expect(closureReasonDisplay(undefined)).toEqual(FALLBACK);
    expect(closureReasonDisplay('')).toEqual(FALLBACK);
  });

  it('degrades a prototype key, not resolving it to a function', () => {
    // `constructor` used to index through to Object, which has no label.
    expect(closureReasonDisplay('constructor')).toEqual(FALLBACK);
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
