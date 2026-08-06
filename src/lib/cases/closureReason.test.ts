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
  it('covers exactly the backend closure reasons', () => {
    // Mirrors VALID_CLOSURE_REASONS in
    // faultmaven/modules/case/domain/models.py. Nothing shared crosses the repo
    // boundary — `closure_reason` is a bare `string` in the generated types —
    // so this pins the map against a deliberate edit here, NOT against backend
    // drift. The fallback below is what actually protects users from drift.
    expect(Object.keys(CLOSURE_REASON_DISPLAY).sort()).toEqual([
      'closed_insufficient_evidence',
      'closed_rca_infeasible',
      'inquiry_only',
      'mitigation_sufficient',
      'solution_deferred',
    ]);
  });

  it('never leaks the raw key to a user', () => {
    for (const [key, info] of Object.entries(CLOSURE_REASON_DISPLAY)) {
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

  it('handles null and undefined rather than throwing', () => {
    expect(closureReasonDisplay(null).label.length).toBeGreaterThan(0);
    expect(closureReasonDisplay(undefined).label.length).toBeGreaterThan(0);
  });

  it('returns the real entry for every known reason', () => {
    for (const key of Object.keys(CLOSURE_REASON_DISPLAY)) {
      expect(closureReasonDisplay(key)).toBe(CLOSURE_REASON_DISPLAY[key]);
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
