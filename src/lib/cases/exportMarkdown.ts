import { getCaseMessages, getCaseEvidenceList, getCaseUI } from './api';
import { closureReasonDisplay } from './closureReason';
import { messageAuthorLabel, transcriptTurnNumbers } from './messageAttribution';
import type {
  CaseDetail,
  CaseMessage,
  EvidenceDetails,
  HypothesisSummary,
} from '../../types/cases';

/**
 * Client-side "Export / Archive to Markdown" (D2). Assembles a self-contained
 * Markdown record of a case — issue, transcript, hypotheses, evidence, and
 * resolution — from data the Dashboard can already read. This is a pure export
 * (no mutation): it is NOT the backend retention-archiving transition
 * (`state → archived`, cold storage), which is a separate design-first backend
 * workstream (see ADR-014).
 */
export interface CaseMarkdownInputs {
  caseDetail: CaseDetail;
  messages: CaseMessage[];
  evidence: EvidenceDetails[];
  hypotheses: HypothesisSummary[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const ts = new Date(value).getTime();
  if (isNaN(ts)) return '—';
  return new Date(value).toISOString();
}

/**
 * Build a complete Markdown document for a case. Pure and deterministic given
 * its inputs (no I/O, no `Date.now()`), so it is unit-testable.
 */
export function buildCaseMarkdown({
  caseDetail,
  messages,
  evidence,
  hypotheses,
}: CaseMarkdownInputs): string {
  const lines: string[] = [];
  const title = caseDetail.title || 'Untitled Case';

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- **Case ID:** \`${caseDetail.case_id}\``);
  lines.push(`- **State:** ${caseDetail.state}`);
  lines.push(`- **Created:** ${formatDate(caseDetail.created_at)}`);
  if (caseDetail.resolved_at) lines.push(`- **Resolved:** ${formatDate(caseDetail.resolved_at)}`);
  if (caseDetail.closed_at) lines.push(`- **Closed:** ${formatDate(caseDetail.closed_at)}`);
  lines.push(`- **Turns:** ${caseDetail.current_turn}`);
  lines.push('');

  // Issue
  lines.push('## Issue');
  lines.push('');
  lines.push(caseDetail.description || '_No problem statement recorded._');
  lines.push('');

  // Milestones
  const milestones = caseDetail.milestones_completed || [];
  if (milestones.length > 0) {
    lines.push('## Milestones');
    lines.push('');
    for (const m of milestones) lines.push(`- ${m.replace(/_/g, ' ')}`);
    lines.push('');
  }

  // Hypotheses
  if (hypotheses.length > 0) {
    lines.push('## Hypotheses');
    lines.push('');
    for (const h of hypotheses) {
      const pct = Math.round(h.likelihood * 100);
      lines.push(`- **[${h.state}]** ${h.text} _(${pct}% · ${h.evidence_count} evidence)_`);
    }
    lines.push('');
  }

  // Evidence
  if (evidence.length > 0) {
    lines.push('## Evidence');
    lines.push('');
    for (const ev of evidence) {
      const source = ev.source_file
        ? `${ev.source_file.filename} · turn ${ev.collected_at_turn}`
        : `chat · turn ${ev.collected_at_turn}`;
      lines.push(`### ${ev.category.replace(/_/g, ' ')} — ${ev.summary}`);
      lines.push('');
      lines.push(`_Source: ${source}_`);
      lines.push('');
      if (ev.extract) {
        lines.push('```');
        lines.push(ev.extract);
        lines.push('```');
        lines.push('');
      }
      if (ev.analysis) {
        lines.push(ev.analysis);
        lines.push('');
      }
    }
  }

  // Resolution
  lines.push('## Resolution');
  lines.push('');
  lines.push(`- **Final state:** ${caseDetail.state}`);
  if (caseDetail.closure_reason) {
    // A classification, not prose — see lib/cases/closureReason.ts. Exporting
    // the raw key put `closed_insufficient_evidence` into the document under a
    // "Resolution Notes" heading, which is neither its meaning nor its shape.
    const closure = closureReasonDisplay(caseDetail.closure_reason);
    lines.push('');
    lines.push('### Closure Reason');
    lines.push('');
    lines.push(`**${closure.label}** — ${closure.description}`);
  }
  lines.push('');

  // Transcript
  if (messages.length > 0) {
    lines.push('## Transcript');
    lines.push('');
    // Attribution — the author name and whether the row owns a turn — comes
    // from `messageAttribution`, the same derivation `TranscriptView` renders
    // from. The export is the archival, shareable artifact: if it could reach a
    // different answer than the screen, the misattribution it recorded would
    // outlive the session that produced it. A notice therefore carries no turn
    // heading here either — the export must not assert a membership the app
    // deliberately declines to assert.
    const turns = transcriptTurnNumbers(messages);
    messages.forEach((msg, i) => {
      const who = messageAuthorLabel(msg.role);
      const turn = turns[i];
      lines.push(turn === null ? `#### ${who}` : `#### ${who} · Turn ${turn}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Fetch the pieces of a case the Dashboard can read and assemble them into a
 * single Markdown string via {@link buildCaseMarkdown}. Read-only.
 */
export async function fetchCaseMarkdown(
  caseId: string,
  caseDetail: CaseDetail
): Promise<string> {
  const [messagesRes, evidenceRes, uiRes] = await Promise.all([
    getCaseMessages(caseId),
    getCaseEvidenceList(caseId),
    getCaseUI(caseId).catch(() => null),
  ]);

  return buildCaseMarkdown({
    caseDetail,
    messages: messagesRes.messages,
    evidence: evidenceRes.evidence,
    hypotheses: uiRes?.active_hypotheses ?? [],
  });
}
