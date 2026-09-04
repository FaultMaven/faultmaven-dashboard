import { useEffect, useState } from 'react';

/**
 * Dashboard → Copilot entry point.
 *
 * What this says changed with the built-in panel (ADR-016 D1). It used to tell
 * an installed user to open the Copilot from their toolbar — which was the only
 * way to run an investigation, and is no longer true on this page: the
 * extension YIELDS its side panel here, because this build hosts the panel
 * itself (D4). Telling someone to open a panel that deliberately will not open
 * is worse than saying nothing.
 *
 * So the two states now say what is true:
 * - Copilot installed  → where it still earns its keep: beside Grafana, AWS,
 *                        Datadog — the consoles this Dashboard is not.
 * - Not installed      → the same store CTA as before. Nothing here requires
 *                        the extension, and the product must never imply it
 *                        does; the one thing it adds is reading the page you
 *                        are looking at.
 *
 * Presence is detected via the marker the copilot's content script sets on this
 * page (it runs on the dashboard origin). Contract — keep in sync with the
 * extension's announceCopilotPresence():
 *   attribute: data-faultmaven-copilot="<version>" on <html>
 *   event:     faultmaven-copilot:ready (window)
 *
 * The advertisement travelling the other way — this page telling the extension
 * it hosts a panel — is `src/copilot/advertisement.ts`.
 */
import { COPILOT_STORE_URL } from '../copilot/storeListing';

const PRESENCE_ATTR = 'data-faultmaven-copilot';
const PRESENCE_EVENT = 'faultmaven-copilot:ready';

function useCopilotPresence(): boolean {
  const [present, setPresent] = useState(
    () => typeof document !== 'undefined' && document.documentElement.hasAttribute(PRESENCE_ATTR),
  );

  useEffect(() => {
    if (present) return;
    const mark = () => setPresent(true);
    window.addEventListener(PRESENCE_EVENT, mark);
    // The content script runs at document_end; re-check shortly after mount in
    // case the marker was set before this listener attached.
    const timer = window.setTimeout(() => {
      if (document.documentElement.hasAttribute(PRESENCE_ATTR)) setPresent(true);
    }, 800);
    return () => {
      window.removeEventListener(PRESENCE_EVENT, mark);
      window.clearTimeout(timer);
    };
  }, [present]);

  return present;
}

function CopilotGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-8 8H7l-4 3v-3a8 8 0 1118-8z"
      />
    </svg>
  );
}

export function CopilotEntry() {
  const installed = useCopilotPresence();

  if (installed) {
    return (
      <span
        className="hidden sm:inline-flex items-center gap-1.5 text-sm text-fm-text-tertiary cursor-default"
        title="The Copilot steps aside here — this page runs the investigation itself. Open it on Grafana, AWS or any console you are debugging in."
      >
        <CopilotGlyph className="h-4 w-4" />
        Copilot ready on other tabs
      </span>
    );
  }

  return (
    <a
      href={COPILOT_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-fm-btn text-fm-accent border border-fm-border hover:bg-fm-elevated transition-colors"
      title="Get the FaultMaven Copilot browser extension"
    >
      <CopilotGlyph className="h-4 w-4" />
      Get the Copilot
    </a>
  );
}
