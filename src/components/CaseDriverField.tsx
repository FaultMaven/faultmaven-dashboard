import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';
import { CasePersonName } from './CasePersonName';
import { getDriverCandidates, reassignCaseDriver } from '../lib/api';
import {
  driverLabel,
  effectiveDriverId,
  mayReassignDriver,
  personLabel,
  type CaseParties,
} from '../lib/cases/driver';
import { APIError } from '../lib/knowledge/errors';
import type { CaseDriverCandidate, CaseSummary } from '../lib/api';

interface CaseDriverFieldProps {
  caseId: string;
  /** The case's parties: `user_id` (creator) and `driver_id` (EFFECTIVE driver). */
  parties: CaseParties;
  /**
   * The case's shares. Who may drive is the creator plus the members of these
   * teams, so a share change makes the candidate list in hand stale.
   */
  sharedTeamIds?: string[];
  viewerId: string | null | undefined;
  /**
   * The hand-off landed. `updated` is the server's row: its `driver_id` is the
   * new effective driver. The page applies it AT ONCE — the dock and the
   * read-only state follow the driver — and then re-reads the whole case.
   */
  onReassigned: (updated: CaseSummary) => void;
  /**
   * What the page holds about case `caseId` is out of date: re-read it. A lost
   * version race (409), or a refusal that says the viewer may no longer move
   * the driver (403) or read the case (404). The id travels with the call so
   * the page can refuse a notice about a case it no longer shows.
   */
  onCaseStale: (caseId: string) => void;
}

interface Notice {
  text: string;
  tone: 'info' | 'error';
}

/**
 * The case's DRIVER (ADR-020), and — for the two people allowed — the hand-off.
 *
 * Always renders the driver's name. The "Change driver" control is offered
 * only when BOTH hold:
 *
 * - the viewer is the case's creator or its effective driver (D4; a terminal
 *   case is not excluded — it still has driver-only writes), and
 * - `GET /cases/{id}/driver-candidates` names someone other than the current
 *   driver. In standalone, and for a case shared with nobody, the creator is
 *   the only candidate and drives, so there is nobody to offer and the control
 *   stays hidden.
 *
 * A DISCLOSURE OF BUTTONS, NOT A `<select>`. A native select fires `change`
 * on every arrow key while closed in some browsers, and here a change is a
 * hand-off: an arrow key could take the composer away from the person using
 * it. Each candidate is its own button, so a hand-off is always an explicit
 * activation — Tab moves between them, Enter or Space picks one, Escape closes
 * the list and returns focus to the toggle.
 *
 * The status line is ALWAYS rendered (a live region inserted with text already
 * in it is the case assistive technology handles least consistently), and it
 * sits outside the control so it survives the control disappearing — which it
 * does when a driver who is not the creator hands the case away.
 */
export function CaseDriverField({
  caseId,
  parties,
  sharedTeamIds,
  viewerId,
  onReassigned,
  onCaseStale,
}: CaseDriverFieldProps) {
  const allowed = mayReassignDriver(parties, viewerId);
  const [candidates, setCandidates] = useState<CaseDriverCandidate[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Bumped to re-read the candidates when the server says the list is stale.
  const [candidatesEpoch, setCandidatesEpoch] = useState(0);

  const listId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  // Monotonic: a candidates read that a newer one superseded must not land.
  const readIdRef = useRef(0);
  // Whether this field is still mounted. A hand-off answer can arrive after the
  // user has navigated to another case (the page keys this field by case, so
  // it unmounts); nothing from that answer may reach the page that now shows a
  // different case.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const sharesKey = (sharedTeamIds ?? []).join(',');
  const driverId = effectiveDriverId(parties);

  useEffect(() => {
    const readId = ++readIdRef.current;
    // Not allowed: nothing is read, and `offered` below ignores whatever an
    // earlier read left. (The page keys this field by case, so a list read for
    // one case is never shown on another.)
    if (!allowed) return;
    getDriverCandidates(caseId)
      .then((list) => {
        if (readId === readIdRef.current) setCandidates(list);
      })
      .catch(() => {
        // Nothing to offer is the safe reading of a failed read: the server
        // refuses a hand-off it would not list anyway.
        if (readId === readIdRef.current) setCandidates(null);
      });
    // `driverId` and `sharesKey` are inputs to WHO the candidates are (the
    // current driver is marked; a share adds or removes a team's members).
  }, [caseId, allowed, driverId, sharesKey, candidatesEpoch]);

  // Offered when there is someone to hand to: any candidate who is not the
  // current driver. Not "more than one candidate" — a driver who is no longer a
  // candidate (a release that failed, or an unshare that raced a reassignment,
  // ADR-020 D3) leaves the creator as the ONLY candidate, and handing the case
  // back to them is exactly the recovery the ADR names.
  const offered =
    allowed && candidates !== null && candidates.some((c) => c.user_id !== driverId);

  // A list left open must not outlive the control it belongs to.
  if (!offered && open) setOpen(false);

  const handOff = useCallback(
    async (target: CaseDriverCandidate) => {
      setBusy(true);
      setNotice(null);
      try {
        const updated = await reassignCaseDriver(caseId, target.user_id);
        if (!liveRef.current) return;
        const name = personLabel(target.display_name, target.user_id)?.text ?? target.user_id;
        setOpen(false);
        setNotice({ text: `${name} now drives this case.`, tone: 'info' });
        onReassigned(updated);
        // The button the user pressed is gone (the list closed) and the toggle
        // may be too, so focus lands on the name it changed rather than <body>.
        nameRef.current?.focus();
      } catch (err) {
        if (!liveRef.current) return;
        const status = err instanceof APIError ? err.statusCode : undefined;
        setOpen(false);
        if (status === 409) {
          setNotice({
            text: 'Someone else changed this case at the same time. It has been reloaded; choose again.',
            tone: 'error',
          });
          onCaseStale(caseId);
          setCandidatesEpoch((n) => n + 1);
        } else if (status === 422) {
          setNotice({
            text: 'That person can no longer drive this case. The list has been refreshed.',
            tone: 'error',
          });
          setCandidatesEpoch((n) => n + 1);
        } else if (status === 403 || status === 404) {
          setNotice({ text: 'You can no longer change who drives this case.', tone: 'error' });
          onCaseStale(caseId);
        } else {
          setNotice({
            text: err instanceof Error ? err.message : 'Could not change who drives this case.',
            tone: 'error',
          });
        }
        nameRef.current?.focus();
      } finally {
        if (liveRef.current) setBusy(false);
      }
    },
    [caseId, onReassigned, onCaseStale],
  );

  // A press anywhere outside the control closes the list. A document listener,
  // not `blur`: Safari and Firefox on macOS do not focus a button on click, so
  // pressing a candidate blurs the toggle with no `relatedTarget`, and a
  // blur-to-close would hide the list before the click landed. `pointerdown`,
  // not `mousedown`: it covers touch and pen as well (an iOS tap).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!controlRef.current?.contains(e.target as Node | null)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    }
  };

  // Close when keyboard focus MOVES somewhere outside the control (Tab past the
  // last option), never while it moves between its own buttons, and never on
  // a blur with nowhere to go (see the press listener above).
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="case-driver-field">
      <span>
        Driver{' '}
        <span
          ref={nameRef}
          tabIndex={-1}
          className="text-fm-text-secondary outline-none"
          data-testid="case-driver-name"
        >
          <CasePersonName label={driverLabel(parties)} />
        </span>
      </span>

      {offered && (
        <div ref={controlRef} className="relative" onKeyDown={onKeyDown} onBlur={onBlur}>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            disabled={busy}
            onClick={() => setOpen((o) => !o)}
            className="px-2 py-0.5 text-xs text-fm-text-secondary border border-fm-border rounded-fm-btn hover:text-fm-accent hover:border-fm-accent/40 hover:bg-fm-accent/10 transition-colors disabled:opacity-50"
          >
            {busy ? 'Changing driver…' : 'Change driver'}
          </button>
          <ul
            id={listId}
            aria-label="Hand this case to"
            hidden={!open}
            className="absolute left-0 z-10 mt-1 min-w-[12rem] rounded-fm-card border border-fm-border bg-fm-surface py-1 shadow-lg"
          >
            {(candidates ?? []).map((c) => {
              const isCurrent = c.user_id === driverId;
              const label = personLabel(c.display_name, c.user_id);
              const notes = [
                c.user_id === parties.user_id ? 'creator' : null,
                c.user_id === viewerId ? 'you' : null,
                isCurrent ? 'driving now' : null,
              ].filter(Boolean);
              return (
                <li key={c.user_id}>
                  <button
                    type="button"
                    disabled={isCurrent || busy}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => void handOff(c)}
                    className="w-full text-left px-3 py-1.5 text-xs text-fm-text-primary hover:bg-fm-elevated disabled:text-fm-text-tertiary disabled:hover:bg-transparent"
                  >
                    <CasePersonName label={label} />
                    {notes.length > 0 && (
                      <span className="text-fm-text-tertiary"> ({notes.join(', ')})</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <span
        role="status"
        data-testid="case-driver-status"
        className={notice?.tone === 'error' ? 'text-fm-critical' : 'text-fm-text-secondary'}
      >
        {notice?.text ?? ''}
      </span>
    </span>
  );
}
