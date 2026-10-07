import type { ProblemVerification } from '../../types/cases';

/** One secondary line under the problem statement. */
export interface ProblemNote {
  text: string;
  tone: 'warning' | 'muted';
}

/** How the Issue tab renders the problem statement. */
export interface ProblemStatementView {
  statement: string;
  /** The evidence showed the reported problem was not present. */
  struck: boolean;
  notes: ProblemNote[];
}

/**
 * The problem statement, read against where it stands
 * (`problem_verification.problem_status`, a `ProblemStatus` since contract
 * 11.2.0). Without it the Issue tab stated the problem as fact in every state,
 * including an open case whose evidence showed the problem never occurred.
 *
 * - `invalidated`: struck, with the finding that showed it was not present.
 * - `revision_pending`: the statement in force, plus the revised wording the
 *   conversation is asking the user to confirm.
 * - `original_problem_statement`, in any status: where the statement started,
 *   when a revision or an edit has since changed it.
 *
 * A parallel copy of the Copilot panel's rule (`ProblemStatement` in
 * `packages/copilot-ui/shared/ui/components/case-header/CaseDetails.tsx`,
 * copilot#301): the Dashboard may import that package only through its entry,
 * dynamically. Change one, look at the other.
 */
export function problemStatementView(
  statement: string,
  verification: ProblemVerification | null | undefined,
): ProblemStatementView {
  const status = verification?.problem_status ?? null;
  const original = verification?.original_problem_statement?.trim();
  const originally: ProblemNote[] = original
    ? [{ text: `Originally reported as: ${original}`, tone: 'muted' }]
    : [];

  switch (status) {
    case 'invalidated': {
      const finding = verification?.invalidation_finding?.trim();
      return {
        statement,
        struck: true,
        notes: [
          {
            text: finding
              ? `Not present: ${finding}`
              : 'The evidence shows this problem was not present.',
            tone: 'warning',
          },
          ...originally,
        ],
      };
    }
    case 'revision_pending': {
      const revision = verification?.pending_revision?.trim();
      return {
        statement,
        struck: false,
        notes: [
          {
            text: revision
              ? `Revision awaiting your confirmation: ${revision}`
              : 'A revised statement awaits your confirmation.',
            tone: 'muted',
          },
          ...originally,
        ],
      };
    }
    case 'verified':
    case 'unverified':
    case null:
      break;
    default: {
      // Unreachable while `ProblemStatus` has these four values: a value the
      // contract adds fails to compile here first. At runtime (a server newer
      // than this build) it renders like a status with no note of its own.
      const unhandled: never = status;
      void unhandled;
    }
  }
  return { statement, struck: false, notes: originally };
}
