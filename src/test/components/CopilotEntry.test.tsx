import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { CopilotEntry } from '../../components/CopilotEntry';
import {
  prefersExtensionForChat,
  resetChatSurfaceForTests,
} from '../../lib/copilot/chatSurfacePreference';

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
 * Every non-test source under `src/`, read as text. Globbed through Vite rather
 * than `node:fs` because this repo ships no `@types/node`, so a filesystem walk
 * would be untyped.
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
    document.documentElement.removeAttribute('data-faultmaven-copilot');
    document.documentElement.removeAttribute('data-faultmaven-copilot-capabilities');
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
    document.documentElement.setAttribute('data-faultmaven-copilot', '0.4.0');
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
    document.documentElement.setAttribute('data-faultmaven-copilot', '1.0.4');
    render(<CopilotEntry />);

    const offer = screen.getByRole('button', { name: /move chat to copilot/i });
    expect(offer).toBeInTheDocument();
    // Nothing has been applied yet.
    expect(prefersExtensionForChat()).toBe(false);
  });

  it('applies the preference only when the offer is TAKEN', async () => {
    document.documentElement.setAttribute('data-faultmaven-copilot', '1.0.4');
    render(<CopilotEntry />);

    fireEvent.click(screen.getByRole('button', { name: /move chat to copilot/i }));

    expect(prefersExtensionForChat()).toBe(true);
    // …and the offer is replaced by a statement, not repeated.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /move chat to copilot/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Chat is in the Copilot/i)).toBeInTheDocument();
  });

  it('tells an OLD build to update, and does not offer', async () => {
    // Offering would be a trap: the Dashboard declines to assert to a build
    // that cannot hear a withdrawal, so it never yields — the user would get
    // chat in the extension AND the Dashboard's panel, which is the two-panel
    // state they can already see and cannot explain (ADR-019 D4).
    document.documentElement.setAttribute('data-faultmaven-copilot', '1.0.3');
    render(<CopilotEntry />);

    expect(screen.getByRole('link', { name: /update the copilot/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move chat to copilot/i })).not.toBeInTheDocument();
  });

  it('offers again once that build advertises the capability', async () => {
    // The dev-build case: same version number, now saying what it can do.
    document.documentElement.setAttribute('data-faultmaven-copilot', '1.0.3');
    document.documentElement.setAttribute(
      'data-faultmaven-copilot-capabilities',
      'panel-withdraw',
    );
    render(<CopilotEntry />);

    expect(screen.getByRole('button', { name: /move chat to copilot/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /update the copilot/i })).not.toBeInTheDocument();
  });

  it('never offers when the extension is absent', () => {
    // There is nowhere to move chat TO, and the store CTA is the right ask.
    render(<CopilotEntry />);

    expect(screen.queryByRole('button', { name: /move chat to copilot/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('http'));
  });

  it('keeps the install CTA for a visitor who has not installed it', () => {
    // Nothing here requires the extension, but page capture does — so the one
    // install prompt the product makes must survive this copy change.
    render(<CopilotEntry />);
    expect(screen.getByText(/get the copilot/i)).toBeInTheDocument();
  });
});
