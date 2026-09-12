import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

/**
 * An ACTION in the nav must not look like the page you are on.
 *
 * The nav is a row of destinations, so `New Case` sitting among them read as
 * another view of the case list rather than a control that creates one. That
 * was fixed by weight rather than by renaming — renaming would split
 * vocabulary with `@faultmaven/copilot-ui`, which labels the same button
 * `+ New Case` (ADR-018 D5).
 *
 * The first attempt filled it with `bg-fm-accent`, which is what `active`
 * already uses: on /cases the nav showed two identically filled accent pills
 * side by side, so the distinction did not exist at rest. An action needs a
 * token `active` is not using.
 */

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: () => [
    { label: 'New Case', path: '/investigate', active: false, action: true },
    { label: 'Cases', path: '/cases', active: true },
    { label: 'Knowledge Base', path: '/kb', active: false },
  ],
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, loading: false }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { user_id: 'u1', username: 'ada', display_name: 'Ada' } },
    deployment: 'standalone',
    role: 'individual',
    isAdmin: false,
  }),
}));
vi.mock('../../lib/api', () => ({
  getAccountProfile: vi.fn().mockResolvedValue({ user_id: 'u1', username: 'ada', email: 'a@b.c' }),
}));

import { PageHeader } from '../../components/PageHeader';

function renderNav() {
  return render(
    <MemoryRouter>
      <PageHeader onLogout={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('the create action in the nav', () => {
  it('does NOT share the active page’s solid fill', () => {
    renderNav();
    const action = screen.getByRole('link', { name: /New Case/ });
    const activeDestination = screen.getByRole('link', { name: 'Cases' });

    expect(activeDestination.className).toContain('bg-fm-accent');
    // The two must be distinguishable AT REST — a `hover:` variant is not a
    // distinction, because nobody is hovering when they look at the nav.
    expect(action.className).not.toContain('text-white bg-fm-accent');
    expect(action.className).toContain('border-fm-accent');
  });

  it('carries the + in its ACCESSIBLE NAME, not only visually', () => {
    // `aria-hidden` on the `+` left the two channels disagreeing: sighted
    // users saw `+ New Case` while assistive tech heard "New Case" — which is
    // also what the empty-state CTA renders literally, so one action had two
    // names across the app.
    renderNav();

    expect(screen.getByRole('link', { name: '+ New Case' })).toBeInTheDocument();
  });

  it('leaves ordinary destinations outlined', () => {
    renderNav();
    const plain = screen.getByRole('link', { name: 'Knowledge Base' });

    expect(plain.className).toContain('border-fm-border');
    expect(plain.className).not.toContain('bg-fm-accent');
  });
});
