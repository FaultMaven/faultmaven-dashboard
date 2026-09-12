import { useLocation } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import CopilotPanelMount from '../copilot/CopilotPanelMount';
import { useAuth } from '../context/AuthContext';
import { logoutAuth } from '../lib/api';

/**
 * A new investigation, in the built-in Copilot panel (ADR-016 D1, D6).
 *
 * This is the surface the product was missing: before it, the only place a
 * person could RUN an investigation was the browser extension, and the
 * Dashboard could show a case but never continue one. Nothing here is
 * installable — the panel is the same UI the extension renders, from the same
 * package, against the same API and the same identity.
 *
 * Inside `ProtectedRoute` like every other authenticated route. The panel has
 * no sign-in of its own and cannot acquire one: its host contract makes the
 * session non-nullable, so there is no value it can be mounted with that lacks
 * a signed-in user (ADR-016 D3).
 *
 * `initialCase: { kind: 'new' }` is D6 in one word: the person arrives ON a new
 * investigation, at the composer, rather than on the panel's "Start a new case"
 * screen one click short of it.
 */
export default function InvestigatePage() {
  const { clearAuthState } = useAuth();
  // A NEW history entry each time, which is what `New Case` in the nav pushes
  // even from this very page. The panel applies `initialCase` once, at its own
  // mount, and React Router reconciles a same-path navigation rather than
  // remounting — so without this the primary call to action was inert exactly
  // where a user is most likely to press it: ten turns into a case, wanting a
  // fresh one, clicking a highlighted button that did nothing at all.
  const { key: historyKey } = useLocation();

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="h-dvh min-h-[40rem] flex flex-col bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />
      <main className="flex-1 min-h-0">
        <CopilotPanelMount key={historyKey} initialCase={{ kind: 'new' }} />
      </main>
    </div>
  );
}
