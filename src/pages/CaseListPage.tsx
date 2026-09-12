import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { logoutAuth } from '../lib/api';
import { usePrefersExtensionForChat } from '../hooks/useChatSurface';
import { ACCENT_BUTTON } from '../lib/ui/chip';

export default function CaseListPage() {
  const prefersExtension = usePrefersExtensionForChat();
  const { clearAuthState } = useAuth();
  const { teams, teamsById } = useTeamSharing();
  const {
    cases,
    totalCount,
    loading,
    error,
    page,
    pageSize,
    filters,
    setFilters,
    loadPage,
  } = useCaseList();

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Cases</h2>
            <p className="text-fm-text-secondary text-sm">
              {totalCount} case{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          {/*
            `New Case`, not "New investigation" (ADR-018 D5). ADR-005 makes an
            investigation a PHASE a case enters past INQUIRY — `inquiry_only`
            names one that never did — so this control cannot create an
            investigation; it creates a case that may become one. It is also the
            word `@faultmaven/copilot-ui` already uses for the same button
            (`+ New Case`), and one product naming one button two things is the
            drift ADR-016 D2 exists to prevent, arriving through copy instead of
            through code.
          */}
          {/* Absent when chat lives in the extension (ADR-018 D3): that link
              leads to a full-page composer this person has asked not to have.
              The Copilot's own `+ New Case` is where they start one. */}
          {/* DROPPED from the populated header. The nav now renders `+ New Case`
              as a filled action on every page, so a second create button a few
              pixels below it was two affordances for one thing. It survives in
              the empty state, where it is the whole point of the page. */}
        </div>

        <CaseFiltersBar filters={filters} onChange={setFilters} teams={teams} />

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        {!loading && !error && cases.length === 0 ? (
          /*
           * An ordinary empty state, on an ordinary page.
           *
           * This used to be a redirect to `/investigate` keyed on the rows in
           * hand, which made `/cases` unreachable for a person with no cases
           * and bounced anyone who merely paged past the end or cleared a
           * filter — `cases.length` cannot tell those apart. The first-run
           * question is asked once, at sign-in, by `resolvePostSignInLanding`.
           *
           * The wording follows `total_count`, which is the whole account
           * rather than this page of it.
           */
          <div
            data-testid="cases-empty-state"
            className="border border-fm-border rounded-fm-card bg-fm-surface px-6 py-12 text-center"
          >
            <p className="text-fm-text-primary text-sm font-medium mb-1">
              {totalCount === 0 ? 'No cases yet.' : 'No cases match these filters.'}
            </p>
            <p className="text-fm-text-secondary text-sm mb-5">
              {totalCount === 0
                ? prefersExtension
                  ? 'Start a new case from the Copilot and it will show up here.'
                  : 'Start a new case and it will show up here.'
                : prefersExtension
                  ? 'Clear the filters to see everything.'
                  : 'Clear the filters to see everything, or start looking at something new.'}
            </p>
            {/* ADR-018 D3's own note on D6: with the preference on, the
                first-run destination does not exist, so the empty state points
                at the Copilot rather than at a surface that would redirect
                straight back here. The RULE is unchanged — a new user starts a
                case rather than staring at an empty table — only the surface
                that honours it moves. */}
            {!prefersExtension && (
              <Link to="/investigate" className={ACCENT_BUTTON}>
                + New Case
              </Link>
            )}
          </div>
        ) : (
          <>
            <CaseTable cases={cases} loading={loading} teamsById={teamsById} />

            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={(p) => loadPage(p)}
            />
          </>
        )}
      </main>
    </div>
  );
}
