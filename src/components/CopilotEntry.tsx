import { useEffect, useState } from 'react';

/**
 * Dashboard → Copilot entry point.
 *
 * What this says changed with the built-in panel (ADR-016 D1). It used to tell
 * an installed user to open the Copilot from their toolbar — which was the only
 * way to run an investigation, and is no longer true on this page.
 *
 * The wording is deliberately VERSION-AGNOSTIC. The marker says an extension is
 * present, not which one: an extension older than the yield behaviour (D4)
 * still opens its own side panel here, so copy asserting that the Copilot
 * "steps aside" would be flatly wrong for that user. Pointing at where the
 * extension is useful is true for every version.
 *
 * So the three states now say what is true:
 * - Installed, chat HERE  → an OFFER to move chat to the extension (ADR-018
 *                           D3). This is the "at that moment" the ADR means:
 *                           the Dashboard has just learned the extension
 *                           exists, which is exactly when proposing it makes
 *                           sense.
 * - Installed, chat THERE → a statement of where chat now lives. Not a
 *                           control; the account menu owns the reversal.
 * - Not installed         → the same store CTA as before. Nothing here
 *                           requires the extension, and the product must never
 *                           imply it does; the one thing it adds is reading the
 *                           page you are looking at.
 *
 * OFFER, NEVER APPLY. The Dashboard can detect "installed"; it cannot detect
 * "side panel open". Applying the preference on detection would strand three
 * real people with no chat anywhere: someone whose panel is simply closed, a
 * Firefox user (the MV2 build has no `browser.sidePanel` at all, so there is no
 * panel to move chat INTO), and a self-hosted user without host permission —
 * where the content script never registers, so this component cannot see the
 * extension in the first place. A preference cannot strand anyone, because the
 * person who set it is the person who can unset it.
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
import { COPILOT_PRESENCE_ATTR, COPILOT_READY_EVENT } from '../copilot/copilotCapability';
import { usePrefersExtensionForChat } from '../hooks/useChatSurface';
import { setPrefersExtensionForChat } from '../lib/copilot/chatSurfacePreference';

// IMPORTED, not re-spelled. These two strings are the extension's to choose,
// and a second copy here could drift while both sides stayed green — the
// install CTA would keep working while the withdrawal gate silently stopped, or
// the reverse. `copilotCapability` is where the Dashboard states them once.
const PRESENCE_ATTR = COPILOT_PRESENCE_ATTR;
const PRESENCE_EVENT = COPILOT_READY_EVENT;

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
  const prefersExtension = usePrefersExtensionForChat();

  // Chat already lives in the extension: say so, and stop offering.
  if (installed && prefersExtension) {
    return (
      <span
        className="hidden sm:inline-flex items-center gap-1.5 text-sm text-fm-text-tertiary cursor-default"
        title="Chat is in the Copilot side panel, on every tab. Turn this off in the account menu to chat here instead."
      >
        <CopilotGlyph className="h-4 w-4" />
        Chat is in the Copilot
      </span>
    );
  }

  // Installed, but chat is still here — the moment to OFFER.
  if (installed) {
    return (
      <button
        type="button"
        onClick={() => setPrefersExtensionForChat(true)}
        className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-fm-btn text-fm-accent border border-fm-accent hover:bg-fm-accent/10 transition-colors"
        title="Chat in the Copilot side panel instead, so it follows you onto Grafana, AWS or any console you are debugging in. Reversible from the account menu."
      >
        <CopilotGlyph className="h-4 w-4" />
        Move chat to Copilot
      </button>
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
