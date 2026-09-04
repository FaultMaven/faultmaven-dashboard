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

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="h-screen flex flex-col bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />
      <main className="flex-1 min-h-0">
        <CopilotPanelMount initialCase={{ kind: 'new' }} />
      </main>
    </div>
  );
}
