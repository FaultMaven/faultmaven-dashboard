// Case Markdown export (D2) — the builder is pure, so it is asserted directly.

import { describe, it, expect } from 'vitest';
import { buildCaseMarkdown } from './exportMarkdown';
import type {
  CaseDetail,
  CaseMessage,
  EvidenceDetails,
  HypothesisSummary,
} from '../../types/cases';

// Minimal shapes: the builder only reads the fields referenced below. Cast the
// fixtures to the full contract types to keep the test focused on output.
const caseDetail = {
  case_id: 'case-42',
  title: 'DB Outage',
  description: 'Primary DB unresponsive',
  // CLOSED, not resolved: `closure_reason` is only ever set for CLOSED cases
  // (RESOLVED carries null), and it is an engine-derived enum key rather than
  // prose. The previous fixture had it both ways round — a resolved case with a
  // hand-written sentence — which is why nothing caught the raw key reaching
  // users under a "Resolution Notes" heading.
  state: 'closed',
  created_at: '2026-07-01T00:00:00Z',
  resolved_at: null,
  closed_at: '2026-07-01T01:00:00Z',
  closure_reason: 'closed_insufficient_evidence',
  current_turn: 4,
  milestones_completed: ['root_cause_identified', 'solution_verified'],
  pending_milestones: [],
  is_terminal: true,
} as unknown as CaseDetail;

const messages = [
  { message_id: 'm0', role: 'user', content: 'DB is down' },
  { message_id: 'm1', role: 'assistant', content: 'Checking connections' },
] as unknown as CaseMessage[];

const evidence = [
  {
    evidence_id: 'e1',
    category: 'log_line',
    summary: 'pool exhausted',
    extract: 'ERROR: connection pool exhausted',
    analysis: 'All connections were in use.',
    collected_at_turn: 2,
    source_file: { filename: 'db.log' },
    related_hypotheses: [],
  },
] as unknown as EvidenceDetails[];

const hypotheses = [
  { hypothesis_id: 'h1', text: 'Pool exhausted', state: 'validated', likelihood: 0.9, evidence_count: 1 },
] as unknown as HypothesisSummary[];

describe('buildCaseMarkdown', () => {
  it('assembles a self-contained record with every section', () => {
    const md = buildCaseMarkdown({ caseDetail, messages, evidence, hypotheses });

    expect(md).toContain('# DB Outage');
    expect(md).toContain('**Case ID:** `case-42`');
    expect(md).toContain('## Issue');
    expect(md).toContain('Primary DB unresponsive');
    expect(md).toContain('## Milestones');
    expect(md).toContain('- root cause identified');
    expect(md).toContain('## Hypotheses');
    expect(md).toContain('**[validated]** Pool exhausted');
    expect(md).toContain('## Evidence');
    expect(md).toContain('ERROR: connection pool exhausted');
    expect(md).toContain('_Source: db.log · turn 2_');
    expect(md).toContain('## Resolution');
    // The exported document carries the MEANING, not the enum key.
    expect(md).toContain('### Closure Reason');
    expect(md).toContain('**Insufficient evidence**');
    expect(md).toContain('without establishing the problem or its cause');
    expect(md).not.toContain('closed_insufficient_evidence');
    expect(md).toContain('## Transcript');
    expect(md).toContain('#### You · Turn 1');
    expect(md).toContain('#### FaultMaven · Turn 1');
  });

  it('omits optional sections when their data is absent', () => {
    const bare = {
      ...caseDetail,
      description: '',
      closure_reason: null,
      milestones_completed: [],
    } as unknown as CaseDetail;

    const md = buildCaseMarkdown({ caseDetail: bare, messages: [], evidence: [], hypotheses: [] });

    expect(md).toContain('_No problem statement recorded._');
    expect(md).not.toContain('## Milestones');
    expect(md).not.toContain('## Hypotheses');
    expect(md).not.toContain('## Evidence');
    expect(md).not.toContain('## Transcript');
    expect(md).not.toContain('### Closure Reason');
  });
});
