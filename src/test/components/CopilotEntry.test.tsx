import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { CopilotEntry } from '../../components/CopilotEntry';
import {
  prefersExtensionForChat,
  resetChatSurfaceForTests,
  setPrefersExtensionForChat,
} from '../../lib/copilot/chatSurfacePreference';
import {
  COPILOT_CAPABILITIES_ATTR,
  COPILOT_PRESENCE_ATTR,
} from '../../copilot/copilotCapability';

/**
 * The published Chrome Web Store listing for FaultMaven Copilot (#119).
 *
 * Before publication the CTA pointed at `.../detail/faultmaven-copilot` behind a
 * TODO — a URL with no extension ID, which does not address the listing. The
 * checks below bind the invariant that no such placeholder can ship again. The
 * load-bearing part is the ID segment, so the guard is a shape rather than a
 * string comparison, and it is proven to reject the old value before it is
 * trusted.
 */
const PUBLISHED_LISTING =
  'https://chromewebstore.google.com/detail/faultmaven-copilot/fghoagggojmkdopidfopijfnlmchjcng';

/** The pre-publication placeholder this test exists to keep out. */
const PLACEHOLDER = 'https://chromewebstore.google.com/detail/faultmaven-copilot';

/**
 * A Chrome Web Store listing URL: `/detail/<slug>/<extension id>`. An extension
 * ID is exactly 32 characters drawn from `a`–`p` (Chrome's base-16 alphabet), so
 * a URL that omits or truncates that segment fails to match.
 */
const LISTING_URL = /^https:\/\/chromewebstore\.google\.com\/detail\/[a-z0-9-]+\/[a-p]{32}$/;

/**
 * Every non-test source under `src/`, read as text, globbed through Vite.
 */
const sources = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Chrome Web Store install CTA', () => {
  afterEach(() => {
    // EVERY signal this component reads, not just presence. The offer test
    // clicks the button, which writes the chat-surface preference to
    // localStorage AND into a module-level cache — so without resetting both,
    // every later test rendered the "chat is in the Copilot" state and the
    // branch it meant to exercise was unreachable.
    document.documentElement.removeAttribute(COPILOT_PRESENCE_ATTR);
    document.documentElement.removeAttribute(COPILOT_CAPABILITIES_ATTR);
    localStorage.clear();
    resetChatSurfaceForTests();
  });

  it('rejects a listing URL that carries no extension ID', () => {
    // The guard's own failure state. Without this the checks below could pass
    // against a pattern that accepts anything.
    expect(LISTING_URL.test(PLACEHOLDER)).toBe(false);
    expect(LISTING_URL.test(`${PLACEHOLDER}/fghoagggojmkdopidfopijfnlmchj`)).toBe(false);
    expect(LISTING_URL.test(PUBLISHED_LISTING)).toBe(true);
  });

  it('points the CTA at the published listing when the copilot is not detected', () => {
    render(<CopilotEntry />);
    const link = screen.getByText(/get the copilot/i).closest('a');
    expect(link).toBeInTheDocument();
    const href = link?.getAttribute('href') ?? '';
    expect(href).toMatch(LISTING_URL);
    expect(href).toBe(PUBLISHED_LISTING);
  });

  it('leaves no other store URL anywhere in the dashboard sources', () => {
    // Rendering only covers this component. Any future install link elsewhere in
    // src/ is held to the same listing.
    const found: Array<[string, string]> = [];
    for (const [file, text] of Object.entries(sources)) {
      const urls = text.match(/https:\/\/chromewebstore\.google\.com[^'"`\s)]*/g) ?? [];
      for (const url of urls) found.push([file, url]);
    }

    // Fail closed: with no hits the loop below asserts nothing, so a moved or
    // renamed CTA must break this test rather than silently pass it.
    expect(found.length).toBeGreaterThan(0);
    for (const [file, url] of found) {
      expect(url, `${file} links a store URL that is not the published listing`).toBe(
        PUBLISHED_LISTING,
      );
    }
  });

  it('no longer tells an installed user to open the panel from their toolbar', () => {
    // The Dashboard now hosts the panel itself, and the extension YIELDS its
    // side panel on this origin (ADR-016 D4). "Copilot in your toolbar" pointed
    // at a panel that deliberately will not open — worse than saying nothing.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '0.4.0');
    render(<CopilotEntry />);

    expect(screen.queryByText(/in your toolbar/i)).not.toBeInTheDocument();
  });

  it('OFFERS to move chat to the extension, rather than just describing it', async () => {
    // ADR-018 D3: detection may OFFER the preference at the moment it learns
    // the extension exists. It may never APPLY it — the Dashboard can see
    // "installed", not "side panel open", and applying on detection would
    // strand a user whose panel is merely closed, a Firefox user (no
    // `browser.sidePanel` at all in MV2), or a self-hosted user whose content
    // script never registered.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    render(<CopilotEntry />);

    const offer = screen.getByRole('button', { name: /move chat to copilot/i });
    expect(offer).toBeInTheDocument();
    // Nothing has been applied yet.
    expect(prefersExtensionForChat()).toBe(false);
  });

  it('applies the preference only when the offer is TAKEN', async () => {
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    render(<CopilotEntry />);

    fireEvent.click(screen.getByRole('button', { name: /move chat to copilot/i }));
    fireEvent.click(screen.getByRole('button', { name: /close this chat and move/i }));

    expect(prefersExtensionForChat()).toBe(true);
    // …and the offer is replaced by a statement, not repeated.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /move chat to copilot/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Chat is in the Copilot/i)).toBeInTheDocument();
  });

  it('OFFERS to an old build too — taking it is what collapses two panels to one', async () => {
    // An earlier version of this withheld the offer from a build too old to
    // withdraw, on the premise that moving chat there would leave the user with
    // both panels. That was INVERTED: with the preference on the Dashboard
    // renders no panel at all, so the offer is precisely the one click that
    // fixes the two-panel state an old extension causes.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.3');
    render(<CopilotEntry />);

    expect(screen.getByRole('button', { name: /move chat to copilot/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /update/i })).not.toBeInTheDocument();
  });

  it('takes two clicks, because the first would destroy work in progress', async () => {
    // On `/investigate` accepting redirects away with `replace`, so a half-typed
    // question and any in-flight turn are gone and the back button cannot
    // recover them. Correct once meant; far too easy to hit by accident from a
    // header button beside the navigation.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    render(<CopilotEntry />);

    fireEvent.click(screen.getByRole('button', { name: /move chat to copilot/i }));
    expect(prefersExtensionForChat()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /close this chat and move/i }));
    expect(prefersExtensionForChat()).toBe(true);
  });

  it('forgets the half-taken offer when focus leaves it', async () => {
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    render(<CopilotEntry />);

    const button = screen.getByRole('button', { name: /move chat to copilot/i });
    fireEvent.click(button);
    fireEvent.blur(button);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /move chat to copilot/i })).toBeInTheDocument(),
    );
    expect(prefersExtensionForChat()).toBe(false);
  });

  it('says where chat is even when the extension cannot be DETECTED', () => {
    // Self-hosted without host permission: the content script never registers,
    // so `installed` is false — but the preference is the authority on where
    // chat lives. Gating this on detection told a user already chatting in the
    // Copilot to go and get the Copilot.
    setPrefersExtensionForChat(true);
    render(<CopilotEntry />);

    expect(screen.getByText(/Chat is in the Copilot/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /get the copilot/i })).not.toBeInTheDocument();
  });

  it('never offers when the extension is absent', () => {
    // There is nowhere to move chat TO, and the store CTA is the right ask.
    render(<CopilotEntry />);

    expect(screen.queryByRole('button', { name: /move chat to copilot/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('http'));
  });

  it('notices an extension that starts announcing AFTER the first render', async () => {
    // #144's mild twin. A self-hosted user grants the host permission from the
    // options page and comes back to the tab they already had open;
    // `chrome.scripting` injects the bridge, which stamps the attribute.
    //
    // NO READY EVENT IS DISPATCHED HERE, deliberately — that is what makes this
    // prove the MutationObserver rather than the event listener, and it is the
    // case the old one-shot 800ms re-check could not see at all, because it had
    // fired long before the click.
    render(<CopilotEntry />);
    expect(screen.getByText(/get the copilot/i)).toBeInTheDocument();

    await act(async () => {
      document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /move chat to copilot/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/get the copilot/i)).not.toBeInTheDocument();
  });

  it('keeps the install CTA for a visitor who has not installed it', () => {
    // Nothing here requires the extension, but page capture does — so the one
    // install prompt the product makes must survive this copy change.
    render(<CopilotEntry />);
    expect(screen.getByText(/get the copilot/i)).toBeInTheDocument();
  });
});
