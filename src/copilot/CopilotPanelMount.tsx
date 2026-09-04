import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  CopilotPanelProps,
  InitialCase,
  PanelChrome,
  WiredHost,
} from '@faultmaven/copilot-ui';
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
   * What the panel opens on: a new investigation, or a named case.
   *
   * Handed to the panel as an ARGUMENT. This host briefly expressed the same
   * intent by writing the panel's own active-case pointer into host storage
   * before mounting it, which worked and was the wrong shape: it coupled this
   * file to a key name, an encoding and a race with the panel's hydrate that
   * neither side could see. `initialCase` is the package's answer
   * (faultmaven-copilot#230), and it wins over the persisted restore, so the
   * host no longer has to fight it.
   *
   * Required, not optional. Both routes that mount the panel know exactly why
   * they did; "restore whatever was open last" is a side-panel behaviour that
   * outlives its host, and no Dashboard route means it.
   */
  initialCase: InitialCase;
}

/**
 * The package's own props, not a restatement of them. A local copy would keep
 * compiling while the real signature moved underneath it.
 */
type PanelComponent = ComponentType<CopilotPanelProps>;

/**
 * How much of the panel's own shell this host wants: none of it.
 *
 * Not a prop, because there is no Dashboard route that would want the other
 * answer. The panel's sidebar carries a case list, an account row and an "Open
 * Dashboard" button — every one of which this app already renders around it,
 * and the last of which links to the page it is already on. A real-browser
 * check found all three duplicated inside the page.
 *
 * `embedded` is a statement about THIS HOST, so it is made once, here, rather
 * than repeated at each call site where a third mount could forget it. The
 * package keeps it a prop rather than inferring it from `host.kind` because
 * both hosts genuinely can render either — the extension could embed, and this
 * app could show the full shell; it is a layout choice, not a capability.
 */
const DASHBOARD_CHROME: PanelChrome = 'embedded';

export default function CopilotPanelMount({ initialCase }: CopilotPanelMountProps) {
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

    // Held so the cleanup below can clear exactly what this mount installed,
    // without importing the package a second time.
    const loadedUi = import('@faultmaven/copilot-ui');

    (async () => {
      // In parallel: the chunk is a network fetch and so is the profile, and
      // neither needs the other. Awaiting them in sequence made the panel's
      // time-to-first-paint the sum of two round trips for no reason.
      const [ui, profile] = await Promise.all([loadedUi, getAccountProfile()]);

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
        // Delegated, not reimplemented. Which keys a FaultMaven session occupies
        // is the package's to know, and it is their single writer — restating
        // the list here would be a fourth copy of something that had already
        // drifted over whether `clientId` survives (it does: a fresh /sessions
        // POST presents it to resume rather than start cold).
        clearSession: () => ui.clearPersistedSession(),
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
      // Drop the module singletons this mount installed.
      //
      // They are module-level and outlive the component, so a panel that has
      // unmounted leaves a live transport behind — and anything still in flight
      // (a poll loop, a queued continuation) goes on using it, with the
      // credential and base URL of a session the page has moved on from. Making
      // a read after unmount THROW is the point: the package treats an
      // uninstalled singleton as a wiring bug, which is exactly what a request
      // issued by a dead panel is.
      //
      // Safe because installation is per-mount: the next mount reinstalls
      // before it renders anything.
      void loadedUi.then((ui) => {
        ui.clearApiTransport();
        ui.clearHostEndpoints();
        ui.clearHostStore();
      }).catch(() => {
        // The import never resolved, so nothing was installed to clear.
      });
    };
    // Genuinely empty, not silenced: nothing in here reads `initialCase` any
    // more. Wiring is a once-per-mount job, and the intent now travels as a
    // PROP to the panel rather than as a storage write this effect had to make
    // before the panel existed. Opening on something else is a remount — see
    // the `key` at the case-detail call site.
  }, []);

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
      <Panel host={host} initialCase={initialCase} chrome={DASHBOARD_CHROME} />
    </div>
  );
}
