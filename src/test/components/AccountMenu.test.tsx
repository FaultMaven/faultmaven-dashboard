import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../../components/AccountMenu';

// The two things the menu depends on: who is signed in (stored state) and the
// organization name (a request made only when the menu opens).
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/api', () => ({ getAccountProfile: vi.fn() }));

import { useAuth } from '../../context/AuthContext';
import { getAccountProfile } from '../../lib/api';
import { COPILOT_PRESENCE_ATTR } from '../../copilot/copilotCapability';
import { COPILOT_STORE_URL } from '../../copilot/storeListing';
import {
  resetChatSurfaceForTests,
  setPrefersExtensionForChat,
} from '../../lib/copilot/chatSurfacePreference';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockGetAccountProfile = getAccountProfile as ReturnType<typeof vi.fn>;

const USER = {
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  username: 'rae.kelmen',
  email: 'rae.kelmen@faultmaven.ai',
  display_name: 'Rae Kelmen',
  is_dev_user: false,
  is_active: true,
  roles: ['user'],
};

const PROFILE = {
  ...USER,
  created_at: '2026-01-01T00:00:00Z',
  organization: { organization_id: 'org-1', name: 'Northwind Ops' },
};

function renderMenu(user: Record<string, unknown> = USER, onLogout = vi.fn()) {
  mockUseAuth.mockReturnValue({ authState: { user } });
  render(<AccountMenu onLogout={onLogout} />);
  return { onLogout };
}

describe('AccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccountProfile.mockResolvedValue(PROFILE);
  });

  it('shows the signed-in account on the trigger without fetching anything', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Account: Rae Kelmen' })).toBeInTheDocument();
    expect(screen.getByText('RK')).toBeInTheDocument();
    // The organization is worth a request only once someone asks whose session
    // this is — never on every page load.
    expect(mockGetAccountProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on click and names the account and its organization', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    const panel = screen.getByRole('dialog', { name: 'Account details' });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText('rae.kelmen@faultmaven.ai')).toBeInTheDocument();
    expect(screen.getByText('rae.kelmen')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Northwind Ops')).toBeInTheDocument());
  });

  it('is a dialog, not a menu — the identity rows are read, not chosen', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    // role="menu" puts screen readers into application mode, where the rows
    // this panel exists to show commonly go unannounced.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Account:/ })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('moves focus into the panel when it opens', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: /^Account:/ });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when focus leaves, so it cannot float over the page', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    fireEvent.focusOut(screen.getByRole('dialog'), { relatedTarget: document.body });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fetches the profile once across repeated opens, even while in flight', async () => {
    const user = userEvent.setup();
    // Never resolves: reopening must not queue a second request behind the first.
    mockGetAccountProfile.mockReturnValue(new Promise(() => {}));
    renderMenu();
    const trigger = screen.getByRole('button', { name: /^Account:/ });

    await user.click(trigger);
    await user.click(trigger);
    await user.click(trigger);

    expect(mockGetAccountProfile).toHaveBeenCalledTimes(1);
  });

  it('still renders the stored identity when /auth/me fails', async () => {
    const user = userEvent.setup();
    mockGetAccountProfile.mockRejectedValue(new Error('500'));
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    // The tenant name is the only casualty; what the user came to read stays.
    await waitFor(() =>
      expect(screen.getByText('rae.kelmen@faultmaven.ai')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  });

  it('badges the cross-tenant operator role only', async () => {
    const user = userEvent.setup();
    mockGetAccountProfile.mockResolvedValue({ ...PROFILE, roles: ['platform_admin'] });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    await waitFor(() => expect(screen.getByText('Platform admin')).toBeInTheDocument());
  });

  it('does not badge the org-scoped admin role', async () => {
    const user = userEvent.setup();
    mockGetAccountProfile.mockResolvedValue({ ...PROFILE, roles: ['admin'] });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    await waitFor(() => expect(screen.getByText('Northwind Ops')).toBeInTheDocument());
    expect(screen.queryByText('Platform admin')).not.toBeInTheDocument();
  });

  it('signs out and closes', async () => {
    const user = userEvent.setup();
    const { onLogout } = renderMenu();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to the username when the display name is only whitespace', () => {
    // Both halves of the trigger must agree: a blank name beside a
    // username-derived monogram reads as two different accounts.
    renderMenu({ ...USER, display_name: '   ' });

    expect(screen.getByRole('button', { name: 'Account: rae.kelmen' })).toBeInTheDocument();
    expect(screen.getByText('RK')).toBeInTheDocument();
  });

  it('renders nothing when no one is signed in', () => {
    mockUseAuth.mockReturnValue({ authState: null });
    const { container } = render(<AccountMenu onLogout={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * THE PREREQUISITE ON THE CHAT-SURFACE TOGGLE.
 *
 * This toggle is the only way chat reaches the extension without the extension
 * ever having been seen: `CopilotEntry`'s offer appears only once something is
 * announcing, and the toggle deliberately does not gate on that, because a
 * self-hosted user who never granted host permission is undetectable and would
 * otherwise lose the preference entirely. So the toggle can strand someone —
 * chat moved to a side panel they have not installed, and no chat surface left
 * on the page. The note is what closes that without closing the toggle.
 */
describe('AccountMenu — the Copilot prerequisite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccountProfile.mockResolvedValue(PROFILE);
  });

  afterEach(() => {
    // Both signals this block writes. The preference lives in a module-level
    // cache as well as in localStorage, so clearing one leaves the other
    // asserting the previous test's state.
    document.documentElement.removeAttribute(COPILOT_PRESENCE_ATTR);
    localStorage.clear();
    resetChatSurfaceForTests();
  });

  async function openMenu() {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    return user;
  }

  it('names what the switch needs, and links the published listing', async () => {
    await openMenu();

    expect(
      screen.getByText(/needs the copilot extension, and a browser with a side panel/i),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /get the copilot/i });
    expect(link).toHaveAttribute('href', COPILOT_STORE_URL);
    // A new tab, and no window.opener handed to the store page.
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('still offers the way out AFTER the switch, not only before it', async () => {
    // The person this rescues has already flipped it, found no side panel, and
    // come back. Showing the link only while the preference is off would hide
    // it from exactly them.
    setPrefersExtensionForChat(true);
    await openMenu();

    expect(screen.getByRole('link', { name: /get the copilot/i })).toBeInTheDocument();
  });

  it('stops asking once the extension announces itself', async () => {
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    await openMenu();

    expect(
      screen.getByText(/copilot extension detected/i),
    ).toBeInTheDocument();
    // Announcing PROVES installed, so a store link here is a nag for something
    // the user demonstrably already has.
    expect(screen.queryByRole('link', { name: /get the copilot/i })).not.toBeInTheDocument();
  });

  it('never claims the extension is ABSENT, only that the switch needs it', async () => {
    // Detection is one-directional. The content script registers only once host
    // permission for this origin is granted, so a self-hosted user chatting in
    // their side panel right now reads as "not announcing" here. Told they do
    // not have it, they would simply know the sentence was wrong.
    await openMenu();

    const note = screen.getByText(/needs the copilot extension/i);
    expect(note.textContent).not.toMatch(/not installed|don't have|do not have/i);
  });

  it('describes the checkbox rather than renaming it', async () => {
    // In the label, the note would be part of the ACCESSIBLE NAME — and a
    // control whose name changes when an extension appears is announced as a
    // different control.
    await openMenu();

    const checkbox = screen.getByRole('checkbox', {
      name: /Use the Copilot extension for chat/,
    });
    expect(checkbox.getAttribute('aria-describedby')).toContain('chat-surface-requirement');
  });

  it('does not flip the preference when the store link is followed', async () => {
    // A link nested inside the `<label>` is reachable but not usable: the click
    // bubbles to the control, so going to install the extension would first
    // move chat to the extension that is not there yet.
    //
    // `window.open` is stubbed because happy-dom ACTUALLY NAVIGATES a
    // `target="_blank"` anchor on click — measured: a userEvent click on a link
    // pointed at a local server delivered a real request to it. Unstubbed, this
    // line performed a live DNS + TLS round trip to the Chrome Web Store on
    // every `pnpm test`, and on an isolated CI runner the rejection is swallowed
    // into a detached page's console, leaving a slow test whose assertion would
    // pass even if the click did nothing.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      const user = await openMenu();
      const checkbox = screen.getByRole('checkbox', {
        name: /Use the Copilot extension for chat/,
      }) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      const link = screen.getByRole('link', { name: /get the copilot/i });
      expect(link.closest('label')).toBeNull();
      await user.click(link);

      expect(checkbox.checked).toBe(false);
    } finally {
      open.mockRestore();
    }
  });

  it('gives the checkbox a name that does NOT change when it is toggled', () => {
    // The whole reason the helper sentence is referenced rather than wrapped.
    // `aria-describedby` does not remove content from the name computation, so
    // a description left inside the `<label>` is ALSO the name — and this one
    // changes with the preference, which announces the control as a different
    // control every time it is used.
    //
    // Asserted as an EXACT string. The other tests here match the name with a
    // partial regex, which passes whether or not the state sentence is glued to
    // it — that is how this survived the review that introduced the note.
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }));

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.closest('label')?.textContent).toBe(
      'Use the Copilot extension for chat',
    );
    expect(checkbox.getAttribute('aria-describedby')).toContain('chat-surface-help');
  });

  it('never tells anyone the prerequisite is met without naming the side panel', async () => {
    // "Installed" is not the prerequisite; "installed AND has a side panel" is,
    // and those come apart on Firefox: the content script announces presence
    // with no browser gate, while the MV2 build declares no side panel at all.
    // A bare green tick there says "you are ready" to the one population that
    // is not, and taking the switch leaves them with no chat surface anywhere.
    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');
    await openMenu();

    const note = screen.getByText(/copilot extension detected/i);
    expect(note.textContent).toMatch(/side panel/i);
    expect(note.textContent).toMatch(/Chrome, Edge and Opera/);
  });

  it('describes the checkbox with TEXT ONLY, never the link', async () => {
    // Pointing `aria-describedby` at the whole paragraph swept in the store
    // link, so a screen reader read "Get the Copilot" as description prose on
    // every focus of the checkbox — flattened to text, unactivatable from
    // there, and repeated each time the control was reached.
    await openMenu();

    const checkbox = screen.getByRole('checkbox');
    const ids = (checkbox.getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toContain('chat-surface-requirement');

    for (const id of ids) {
      const described = document.getElementById(id);
      expect(described, id).not.toBeNull();
      expect(described!.querySelector('a, button, input, select, textarea')).toBeNull();
    }
    // The link is still on the page and still reachable — just not as prose.
    expect(screen.getByRole('link', { name: /get the copilot/i })).toBeInTheDocument();
  });

  it('notices an extension that starts announcing while the menu is open', async () => {
    // The self-hosted grant flow: host permission is granted from the options
    // page at an arbitrary moment, the bridge is injected, and the attribute
    // appears on a tab that has been open the whole time (#144).
    await openMenu();
    expect(screen.getByRole('link', { name: /get the copilot/i })).toBeInTheDocument();

    document.documentElement.setAttribute(COPILOT_PRESENCE_ATTR, '1.0.4');

    await waitFor(() =>
      expect(
        screen.getByText(/copilot extension detected/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: /get the copilot/i })).not.toBeInTheDocument();
  });
});
