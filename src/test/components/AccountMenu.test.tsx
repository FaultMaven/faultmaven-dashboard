import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../../components/AccountMenu';

// The two things the menu depends on: who is signed in (stored state) and the
// organization name (a request made only when the menu opens).
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/api', () => ({ getAccountProfile: vi.fn() }));

import { useAuth } from '../../context/AuthContext';
import { getAccountProfile } from '../../lib/api';

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
