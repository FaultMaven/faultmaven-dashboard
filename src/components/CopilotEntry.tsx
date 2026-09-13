import { useEffect, useState } from 'react';

/**
 * Dashboard → Copilot entry point.
 *
 * What this says changed with the built-in panel (ADR-016 D1). It used to tell
 * an installed user to open the Copilot from their toolbar — which was the only
 * way to run an investigation, and is no longer true on this page.
 *
 * The wording carries no version claim. The marker says an extension is
 * present, not what it can do — and since the OFFER is the cure for the
 * two-panel state an older build causes, the copy never needs to distinguish
 * them (ADR-019 D4).
 *
 * So the three states now say what is true:
 * - Installed, chat HERE  → an OFFER to move chat to the extension (ADR-018
 *                           D3). This is the "at that moment" the ADR means:
 *                           the Dashboard has just learned the extension
 *                           exists, which is exactly when proposing it makes
 *                           sense.
 * - CHAT THERE           → a statement of where chat now lives. Keyed on the
 *                           PREFERENCE, not detection: the preference is the
 *                           authority on where chat is, and a self-hosted user
 *                           we cannot detect was otherwise told to go and get
 *                           the extension they are already chatting in.
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
import {
  COPILOT_PRESENCE_ATTR,
  COPILOT_PRESENCE_RECHECK_MS,
  COPILOT_READY_EVENT,
} from '../copilot/copilotCapability';
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
    }, COPILOT_PRESENCE_RECHECK_MS);
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

  /**
   * TWO CLICKS, because one is destructive.
   *
   * Taking the offer removes the Dashboard's chat surface immediately: on
   * `/investigate` the route guard redirects to `/cases` with `replace`, so a
   * half-typed question and any in-flight turn are gone and the back button
   * cannot recover them; on case detail the live panel becomes a read-only
   * transcript. That is correct once the user means it, and far too easy to
   * hit by accident from a header button beside the navigation.
   *
   * Blur resets it, so a mis-click that wanders away costs nothing.
   */
  const [confirming, setConfirming] = useState(false);

  /**
   * Chat already lives in the extension: say so, and stop offering.
   *
   * Keyed on the PREFERENCE, not on detection. The preference is the authority
   * on where chat lives; detection only decides whether to propose moving it.
   * Gating this on `installed` too meant a self-hosted user without host
   * permission — where the content script never registers, so we cannot see the
   * extension — was told to "Get the Copilot" on a page that had already
   * removed its own chat because they are using the one they have.
   */
  if (prefersExtension) {
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

  // Installed, and chat is still here — the moment to OFFER.
  if (installed) {
    return (
      <button
        type="button"
        onClick={() => (confirming ? setPrefersExtensionForChat(true) : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-fm-btn text-fm-accent border border-fm-accent hover:bg-fm-accent/10 transition-colors"
        title="Chat in the Copilot side panel instead, so it follows you onto Grafana, AWS or any console you are debugging in. If you are seeing two chat panels, this collapses them to one. Reversible from the account menu."
      >
        <CopilotGlyph className="h-4 w-4" />
        {confirming ? 'Close this chat and move?' : 'Move chat to Copilot'}
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
