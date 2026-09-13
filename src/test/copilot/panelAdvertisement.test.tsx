import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DASHBOARD_PANEL_MESSAGE,
  DASHBOARD_PANEL_WITHDRAWN_MESSAGE,
} from '@faultmaven/copilot-ui/contract';
import {
  usePanelAdvertisement,
  type PanelVisibility,
} from '../../copilot/usePanelAdvertisement';
import {
  CAPABILITY_PANEL_WITHDRAW,
  COPILOT_CAPABILITIES_ATTR,
  COPILOT_PRESENCE_ATTR,
  COPILOT_PRESENCE_EVENT,
} from '../../copilot/copilotCapability';

/**
 * The advertisement is a LIVE claim, and it can be unmade (ADR-018 D0, row 5).
 *
 * It used to mean "this build renders a panel", asserted once on mount and
 * never retracted. That was monotonic, and monotonic is what made a preference
 * impossible: a user who turned the built-in panel off on an already-yielded
 * tab was left with NEITHER surface, and the only way back was navigating off
 * the origin.
 *
 * The asymmetry to hold on to while reading these: asserting wrongly costs a
 * user their only chat surface (severe); withdrawing wrongly costs them a
 * second panel on screen (mild). Every case below resolves towards withdrawal.
 */

function Harness({ showing }: { showing: PanelVisibility }) {
  usePanelAdvertisement(showing);
  return <div data-testid="harness" />;
}

let postMessage: ReturnType<typeof vi.spyOn>;

function postedTypes(): unknown[] {
  return postMessage.mock.calls.map((call) => (call[0] as { type?: unknown })?.type);
}

beforeEach(() => {
  postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
});
afterEach(() => {
  postMessage.mockRestore();
});

describe('a mount that has not settled yet', () => {
  it('says NOTHING — pending is not a retraction', async () => {
    // Treating "still loading its chunk" as "not showing" made every mount post
    // a withdrawal before it ever asserted: the extension's side panel was
    // released for the whole load and re-yielded a few hundred milliseconds
    // later. On every page load, every `key`ed remount, every first open of the
    // dock, and every breakpoint crossing.
    render(<Harness showing="pending" />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(postedTypes()).toEqual([]);
  });

  it('asserts once it settles, with no withdrawal in between', async () => {
    const { rerender } = render(<Harness showing="pending" />);
    rerender(<Harness showing="showing" />);

    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
    expect(postedTypes()).not.toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE);
  });
});

describe('an extension that could not take the assertion back', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(COPILOT_PRESENCE_ATTR);
  });

  it('is never told a panel is showing', async () => {
    // Asserting makes ANY extension yield; only one carrying
    // faultmaven-copilot#257 can hear the retraction. Creating that state for
    // an older install leaves a tab with NEITHER surface — so the Dashboard
    // declines to create it, and that install keeps what it has today.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.3');

    render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes().length).toBeGreaterThan(0));

    expect(postedTypes()).not.toContain(DASHBOARD_PANEL_MESSAGE);
  });

  it('is still sent the WITHDRAWAL, which costs nothing and can only help', async () => {
    // A no-op for an extension that cannot hear it. The one thing worse than a
    // redundant withdrawal is a missing one.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.3');

    render(<Harness showing="showing" />);

    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE));
  });

  it('starts asserting once a NEWER extension announces itself mid-page', async () => {
    // The bridge stamps its version at document_end and this hook can run
    // first. Reading once at mount would see no extension, assert, and hand a
    // yield to an install that cannot release it.
    render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
    postMessage.mockClear();

    // An OLDER one appears: the assertion must stop.
    act(() => {
      document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.3');
      window.dispatchEvent(new Event(COPILOT_PRESENCE_EVENT));
    });
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE));
    postMessage.mockClear();

    // …and a newer one: it resumes.
    act(() => {
      document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
      window.dispatchEvent(new Event(COPILOT_PRESENCE_EVENT));
    });
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
  });
});

describe('while a panel is showing', () => {
  it('asserts, to the page’s OWN origin and not a wildcard', async () => {
    render(<Harness showing="showing" />);

    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
    // A wildcard would hand the claim to any frame embedding the Dashboard.
    expect(postMessage).toHaveBeenCalledWith(
      { type: DASHBOARD_PANEL_MESSAGE },
      window.location.origin,
    );
  });

  it('re-asserts on pageshow, where React does not re-run', async () => {
    // The extension releases a tab whose document is being replaced, and
    // `tabs.onUpdated` reports `status: 'loading'` for a back/forward bfcache
    // restore that creates NO new document. React does not re-run there, so
    // without this nothing says so again and the tab never yields for the life
    // of that document.
    //
    // Not gated on `event.persisted`: the yield is idempotent, so re-asserting
    // on an ordinary load too costs one message, while depending on a property
    // happy-dom drops entirely — and older browsers vary on — would trade that
    // free duplicate for a silent failure to re-assert.
    render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
    postMessage.mockClear();

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE);
  });
});

describe('when it stops showing', () => {
  it('withdraws when the panel is hidden rather than unmounted', async () => {
    // The collapse and tab-switch case. The dock keeps its panel mounted so an
    // in-flight turn survives — but the user is looking at no conversation, so
    // the extension's side panel must come back.
    const { rerender } = render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
    postMessage.mockClear();

    rerender(<Harness showing="hidden" />);

    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE));
  });

  it('withdraws on unmount', async () => {
    const { unmount } = render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
    postMessage.mockClear();

    unmount();

    expect(postedTypes()).toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE);
  });

  it('withdraws without ever asserting, when it was never showing', async () => {
    // Silence is not a retraction. A tab yielded by a previous document, or by
    // a page state that has since changed, needs to be told — so a mount that
    // is not showing says so rather than saying nothing.
    render(<Harness showing="hidden" />);

    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE));
    expect(postedTypes()).not.toContain(DASHBOARD_PANEL_MESSAGE);
  });

  it('stops listening for pageshow, so a hidden panel cannot re-assert', async () => {
    // The listener is installed only while showing. Left behind, a bfcache
    // restore would re-assert for a panel that is no longer on screen — the
    // severe direction, and invisible until someone loses their chat surface.
    const { rerender } = render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));

    rerender(<Harness showing="hidden" />);
    postMessage.mockClear();

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(postedTypes()).not.toContain(DASHBOARD_PANEL_MESSAGE);
  });
});

/**
 * An extension that starts announcing itself LATE (#144).
 *
 * The old subscription was the ready event plus one 800ms re-read, which covers
 * a signal missed EARLY and nothing else. A host-permission grant lands on a
 * user click at an arbitrary time: the page reads "no extension" — which means
 * ASSERT, because nobody is listening — the user grants the permission a minute
 * later, `chrome.scripting` injects the bridge, and the timer fired long ago.
 *
 * NO READY EVENT IS DISPATCHED IN THESE TESTS, deliberately. That is what makes
 * them prove the MutationObserver rather than the event listener, and it is the
 * case the old code's own comment conceded it could not see: a bridge injected
 * into a world whose events this listener never receives.
 */
describe('an extension that announces itself after the page has already decided', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(COPILOT_PRESENCE_ATTR);
    document.documentElement.removeAttribute(COPILOT_CAPABILITIES_ATTR);
  });

  it('WITHDRAWS when a build that cannot retract shows up mid-session', async () => {
    // Nothing installed: the assertion reaches nobody, so it is made.
    render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));

    // The grant lands. A pre-#260 build stamps its version and NO capability
    // list — it has no withdrawal listener, so an assertion it hears is a yield
    // it can never give back.
    await act(async () => {
      document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.3');
    });

    // The claim has to come down: the tab would otherwise have neither surface.
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE));
  });

  it('keeps asserting when the build that shows up CAN retract', async () => {
    render(<Harness showing="showing" />);
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));

    await act(async () => {
      // Capabilities first, as the bridge writes them.
      document.documentElement.setAttribute(COPILOT_CAPABILITIES_ATTR, CAPABILITY_PANEL_WITHDRAW);
      document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    });

    // Fail closed on the other side too: withdrawing from a build that can hear
    // the retraction costs the user their second panel for nothing.
    await new Promise((r) => setTimeout(r, 0));
    expect(postedTypes()).not.toContain(DASHBOARD_PANEL_WITHDRAWN_MESSAGE);
  });

  it('notices a capability list stamped after the version', async () => {
    // The two attributes are one answer: `copilotAcceptsWithdrawal` consults
    // capabilities first and falls back to the version, so a list arriving
    // second must re-open the question. Observing only the presence attribute
    // would miss this.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.3');
    render(<Harness showing="showing" />);
    // Below the floor and claiming nothing, so the claim is withheld — the page
    // stands down rather than yield to a build that cannot give it back.
    await waitFor(() => expect(postedTypes()).not.toContain(DASHBOARD_PANEL_MESSAGE));

    await act(async () => {
      document.documentElement.setAttribute(COPILOT_CAPABILITIES_ATTR, CAPABILITY_PANEL_WITHDRAW);
    });

    // A build below the floor that nonetheless says it can withdraw is trusted
    // (ADR-019 D3) — the dev-build case the floor got wrong.
    await waitFor(() => expect(postedTypes()).toContain(DASHBOARD_PANEL_MESSAGE));
  });
});
