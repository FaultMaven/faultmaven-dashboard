import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WiredHost } from '@faultmaven/copilot-ui';
import { getAccountProfile } from '../lib/auth/functions';
import { announcePanelAvailableOnce } from './advertisement';
import { createWebHostCapabilities } from './webHost';
import { createWebSession, hostUserFromProfile } from './webSession';

/**
 * The built-in Copilot panel, mounted in the Dashboard (ADR-016 D1).
 *
 * Everything host-specific is settled here, once, before the shared UI renders:
 * the module singletons the plain modules read (they run in effects and
 * background continuations and cannot reach React context), the transport the
 * request path takes its bearer and base URL from, and the session.
 *
 * WHY THE PACKAGE IS LOADED DYNAMICALLY. ADR-016 D3 requires that the panel
 * exist only inside the authenticated app shell — and a static import would put
 * the whole shared UI, its store and its API client into the entry chunk, so
 * every visitor to `/login` would download and evaluate it. Dynamic here means
 * the module graph is not merely unrendered before sign-in, it is not reached.
 * The test asserts exactly that: rendering the login route never invokes this
 * import.
 */

interface CopilotPanelMountProps {
  /**
   * The case to open on, or `null` for a new investigation.
   *
   * Applied by seeding the panel's own active-case pointer in host storage
   * BEFORE the panel mounts, which is the key its hydration reads on load.
   * Sequential, not concurrent: this host writes it while no panel exists, and
   * the panel is the only writer afterwards.
   */
  caseId: string | null;
}

type PanelComponent = ComponentType<{ host: WiredHost }>;

export default function CopilotPanelMount({ caseId }: CopilotPanelMountProps) {
  const [panel, setPanel] = useState<{ Panel: PanelComponent; host: WiredHost } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // The router's `navigate` identity changes; the host object must not be
  // rebuilt for that, so the adapter calls through a ref. `navigation.dashboard`
  // is a path push in this host — where the Dashboard lives, and how it is
  // reached, is the host's business and not the panel's.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ui = await import('@faultmaven/copilot-ui');

      const capabilities = createWebHostCapabilities((path) => navigateRef.current(path));

      // Before anything reads them. Reads before installation throw, which is
      // the point: a request that silently went out unauthenticated, or to the
      // wrong origin, is the failure this boundary exists to prevent.
      ui.setHostStore(capabilities.store);
      ui.setHostEndpoints(capabilities.endpoints);

      // The panel's capability probe is gated on a first-run flag the extension
      // sets from its onboarding screen. This host has no onboarding — the user
      // is already signed in and the backend URL was decided by the origin that
      // served this app — so the host asserts the environment is ready. Without
      // it the panel renders with `capabilities: null` and never asks the
      // backend what it supports.
      await capabilities.store.set({ hasCompletedFirstRun: true });

      // Seeded before the panel exists; see `caseId` above.
      if (caseId) {
        await capabilities.store.set({ faultmaven_current_case: caseId });
      } else {
        await capabilities.store.remove(['faultmaven_current_case']);
      }

      const profile = await getAccountProfile();
      const session = createWebSession(hostUserFromProfile(profile));

      ui.setApiTransport({
        baseUrl: () => capabilities.endpoints.apiUrl(),
        accessToken: () => session.accessToken(),
        // Through the same store everything else reads this key from. A direct
        // `localStorage` read here would work and be a second storage path by
        // another name.
        async sessionId() {
          const stored = await capabilities.store.get(['sessionId']);
          return (stored.sessionId as string | undefined) ?? null;
        },
        // Which keys a FaultMaven session occupies is the package's to know;
        // its own `clearPersistedSession` is not on the supported surface, so
        // this host restates the list. See the PR body — the fix is to export it.
        async clearSession() {
          await capabilities.store.remove(['sessionId', 'sessionCreatedAt', 'sessionResumed']);
        },
        onUnauthorized: () => session.onUnauthorized(),
      });

      if (cancelled) return;
      setPanel({ Panel: ui.CopilotPanel, host: { ...capabilities, session } });
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Could not start the Copilot panel.');
    });

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  // The panel is mounted: tell the extension this build hosts one, so it keeps
  // its own side panel out of the way here (ADR-016 D4). The attribute in the
  // initial HTML is the other half of the same claim — this is the half a page
  // that mounts after hydration can make.
  useEffect(() => {
    if (!panel) return;
    announcePanelAvailableOnce();
  }, [panel]);

  if (error) {
    return (
      <div
        data-testid="copilot-panel-error"
        className="h-full flex items-center justify-center p-6 text-sm text-fm-critical"
      >
        {error}
      </div>
    );
  }

  if (!panel) {
    return (
      <div
        data-testid="copilot-panel-loading"
        className="h-full flex items-center justify-center p-6 text-sm text-fm-text-tertiary"
      >
        Starting the Copilot…
      </div>
    );
  }

  const { Panel, host } = panel;
  return (
    <div data-testid="copilot-panel" className="h-full min-h-0">
      <Panel host={host} />
    </div>
  );
}
