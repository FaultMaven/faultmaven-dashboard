import CopilotPanelMount from '../copilot/CopilotPanelMount';

/**
 * The built-in Copilot panel, opened on one existing case.
 *
 * Extracted because two places mount it — the dock and the Transcript tab's
 * live arm — and every one of the decisions below is easy to get right in one
 * of them and forget in the other.
 */
export function CasePanelMount({ caseId, readOnly }: { caseId: string; readOnly: boolean }) {
  return (
    // `h-full min-h-0`, never a viewport fraction or a fixed floor. The panel
    // takes the room its container has left it; naming its own height is what
    // put the composer below the fold (see CaseDetailPage).
    <div className="h-full min-h-0" data-testid="case-panel-holder">
      {/* `key` because the panel applies `initialCase` ONCE, at its own mount:
          React Router keeps the surrounding components alive across a `:caseId`
          change, so without a remount a move from one case to the next would
          leave the previous case's transcript on screen. */}
      <CopilotPanelMount
        key={caseId}
        initialCase={{ kind: 'existing', caseId, readOnly }}
      />
    </div>
  );
}
