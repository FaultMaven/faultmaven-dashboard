import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStateBadge } from '../components/CaseStateBadge';
import { TranscriptView } from '../components/TranscriptView';
import { BreakGlassRequestDialog } from '../components/BreakGlassRequestDialog';
import { useAuth } from '../context/AuthContext';
import { logoutAuth } from '../lib/api';
import {
  openAdminCaseContent,
  openAdminCaseTranscript,
  revokeBreakGlassGrant,
} from '../lib/breakGlass/api';
import type {
  AdminCaseContentResponse,
  AdminCaseMessagesResponse,
  BreakGlassGrant,
} from '../types/cases';

/** Minutes remaining on a grant, floored at 0. */
function minutesRemaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

/**
 * A live countdown on a grant's remaining window.
 *
 * Computed on a ticker rather than once at render: a break-glass window is
 * minutes long and a page left open outlives it easily, so a figure captured at
 * mount would keep asserting the original time indefinitely — with the content
 * still on screen. The tick is what turns "expires in N min" from a label into
 * a statement that stays true.
 *
 * Calls `onLapsed` once when it reaches zero. The caller reloads, the backend
 * refuses, and the content leaves the screen — expiry is enforced by the gate,
 * never by this timer, which only decides *when to ask again*.
 */
function useRemainingMinutes(expiresAt: string, onLapsed: () => void): number {
  const [remaining, setRemaining] = useState(() => minutesRemaining(expiresAt));
  const lapsedRef = useRef(false);
  // Held in a ref, and synced in its own effect rather than during render, so
  // the ticker below can call the latest callback without listing it as a
  // dependency — which would restart the interval on every parent re-render.
  const onLapsedRef = useRef(onLapsed);
  useEffect(() => {
    onLapsedRef.current = onLapsed;
  }, [onLapsed]);

  useEffect(() => {
    lapsedRef.current = false;
    const tick = () => {
      const next = minutesRemaining(expiresAt);
      setRemaining(next);
      if (next <= 0 && !lapsedRef.current) {
        lapsedRef.current = true;
        onLapsedRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

/**
 * The operator's break-glass banner: how this content was reached.
 *
 * Rendered from the response's own `access` discriminator rather than from the
 * app's notion of the deployment, so it can never claim standing access for a
 * read that actually consumed a grant, or vice versa.
 */
function AccessBanner({
  access,
  grant,
  onRevoked,
}: {
  access: AdminCaseContentResponse['access'];
  grant: BreakGlassGrant | null | undefined;
  onRevoked: () => void;
}) {
  if (access === 'standing' || !grant) {
    return (
      <div className="mb-6 text-xs text-fm-text-tertiary border border-fm-border rounded-fm-btn px-3 py-2">
        Operator access. This read is recorded in the operator access trail.
      </div>
    );
  }

  return <BreakGlassBanner grant={grant} onRevoked={onRevoked} />;
}

function BreakGlassBanner({
  grant,
  onRevoked,
}: {
  grant: BreakGlassGrant;
  onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A lapsed window reloads, the backend refuses, and the content comes off
  // screen — the same path a revocation takes.
  const remaining = useRemainingMinutes(grant.expires_at, onRevoked);

  const handleRevoke = async () => {
    setRevoking(true);
    setError(null);
    try {
      await revokeBreakGlassGrant(grant.grant_id);
      onRevoked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
      setRevoking(false);
    }
  };

  return (
    <div className="mb-6 border border-fm-warning-border bg-fm-warning-bg rounded-fm-btn px-3 py-2">
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs text-fm-text-secondary">
          <p className="font-medium text-fm-text-primary">
            Break-glass access — expires in {remaining} min
          </p>
          <p className="mt-0.5">
            Reason: <span className="italic">{grant.reason}</span>
          </p>
          <p className="mt-0.5 text-fm-text-tertiary">
            This read, and every other taken under this grant, is recorded permanently.
          </p>
        </div>
        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="shrink-0 px-3 py-1 border border-fm-border rounded-fm-btn text-xs text-fm-text-secondary hover:text-fm-text-primary transition-colors disabled:opacity-50"
        >
          {revoking ? 'Ending...' : 'End access now'}
        </button>
      </div>
      {error && <p className="text-xs text-fm-critical mt-2">{error}</p>}
    </div>
  );
}

/**
 * Operator view of one case's content (ADR-012 D9, faultmaven#815 /
 * faultmaven-dashboard#62).
 *
 * Reads through `GET /api/v1/admin/cases/{id}` and its transcript sibling — the
 * audited operator path — rather than `GET /cases/{id}`, which gates on owner ∪
 * shared-to-my-teams with no operator arm and therefore 404s on every case an
 * operator does not own (faultmaven#846). That is why the All Cases view's rows
 * link here.
 *
 * The two deployments differ in what happens when there is no grant, and the
 * page does not decide that itself:
 *
 * - **Standalone** — the backend answers with `access: "standing"`. Recorded,
 *   not gated; the operator and the data controller are the same party.
 * - **Cloud** — without a live grant the backend refuses (403) and nothing is
 *   rendered but the refusal and a way to request access. Fail-closed is
 *   structural here: content only ever arrives inside a successful response, so
 *   there is no state in which this page holds content it should be hiding.
 *
 * The organization needed to request a grant is carried in the query string from
 * the list row (`?org=`). Under multi-tenant cloud the case's own organization
 * cannot be read before the grant exists — that is precisely what the grant
 * unlocks — so it has to travel with the navigation rather than be looked up.
 */
export default function AdminCaseContentPage() {
  const { caseId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get('org') ?? '';
  const { clearAuthState } = useAuth();

  const [content, setContent] = useState<AdminCaseContentResponse | null>(null);
  const [transcript, setTranscript] = useState<AdminCaseMessagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  // Monotonic request id: only the latest load may apply its result. Without it
  // a slow Retry that rejects *after* a newly-granted load succeeded would wipe
  // the just-authorised content back to the stale refusal — the same guard
  // `AdminCaseListPage` carries, and it matters more here because the loads race
  // by construction (Retry and grant-then-reload are one click apart).
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const opened = await openAdminCaseContent(caseId);
      // Fetched only after the content read succeeded. Ordering it this way
      // means one refusal, not two: the gate is the same for both, so a failed
      // open has already answered the question for the transcript.
      const messages = await openAdminCaseTranscript(caseId);
      if (reqId !== reqIdRef.current) return; // superseded by a newer load
      setContent(opened);
      setTranscript(messages);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to open case');
      // Drop anything previously loaded. A revoked or lapsed grant must take
      // the content off the screen, not leave it visible under a banner.
      setContent(null);
      setTranscript(null);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <Link
          to="/admin/cases"
          className="text-sm text-fm-text-secondary hover:text-fm-text-primary transition-colors"
        >
          ← All Cases
        </Link>

        <p className="font-mono text-xs text-fm-text-tertiary select-all mt-4 mb-4">{caseId}</p>

        {loading ? (
          <div className="text-fm-text-tertiary text-sm py-8">Opening case...</div>
        ) : error ? (
          <div className="border border-fm-critical-border bg-fm-critical-bg rounded-fm-btn p-4">
            <p className="text-sm text-fm-critical">{error}</p>
            <div className="mt-3 flex gap-2">
              {/* Offered whenever the open failed, not only on a 403: a grant
                  that lapsed mid-session and one that never existed lead to the
                  same next step, and guessing which from the message text would
                  couple this page to the backend's wording. */}
              <button
                onClick={() => setRequesting(true)}
                disabled={!organizationId}
                title={
                  organizationId
                    ? undefined
                    : 'Open this case from the All Cases list to request access'
                }
                className="px-3 py-1 bg-fm-accent text-white rounded-fm-btn text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Request access
              </button>
              <button
                onClick={load}
                className="px-3 py-1 border border-fm-border rounded-fm-btn text-sm text-fm-text-secondary hover:text-fm-text-primary transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : content ? (
          <>
            <AccessBanner access={content.access} grant={content.grant} onRevoked={load} />

            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-fm-heading font-bold text-fm-text-primary">
                {content.case.title || 'Untitled Case'}
              </h2>
              <CaseStateBadge state={content.case.state} />
            </div>
            {content.case.description && (
              <p className="text-sm text-fm-text-secondary mb-6">{content.case.description}</p>
            )}

            <h3 className="text-sm font-semibold text-fm-text-primary border-t border-fm-border pt-6">
              Transcript
            </h3>
            <TranscriptView messages={transcript?.messages.messages ?? []} />
          </>
        ) : null}
      </main>

      {requesting && (
        <BreakGlassRequestDialog
          caseId={caseId}
          organizationId={organizationId}
          onGranted={() => {
            setRequesting(false);
            load();
          }}
          onCancel={() => setRequesting(false)}
        />
      )}
    </div>
  );
}
