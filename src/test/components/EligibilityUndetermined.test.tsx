import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EligibilityUndetermined } from '../../components/EligibilityUndetermined';

/**
 * The card a fail-closed guard shows instead of an irreversible redirect.
 *
 * It shipped with its behaviour asserted by nothing: the only coverage was "a
 * button named /try again/ exists", which passes with `onClick` deleted, and a
 * guard test asserting two NEGATIVES, which passes with the whole card replaced
 * by `return null` — silently restoring the blank screen it exists to remove.
 */

const lnaBlocked = vi.fn();
vi.mock('../../lib/auth/lnaDiagnosis', () => ({
  localNetworkAccessLikelyBlocked: () => lnaBlocked(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  lnaBlocked.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('while the answer is still coming', () => {
  it('shows a quiet loading state and offers no retry', async () => {
    render(<EligibilityUndetermined pending onRetry={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    // Nothing has gone wrong yet, so there is nothing to act on.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('once it has failed at least once', () => {
  it('actually calls the retry it was handed', async () => {
    // The assertion the shipped version lacked: `onClick` could be deleted and
    // every existing test still passed.
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<EligibilityUndetermined pending={false} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('ANNOUNCES a failed retry, which is otherwise invisible', async () => {
    // `configStatus` is set to the same 'unreachable' value, so React bails out
    // of the parent re-render and the card is byte-identical before and after the
    // click. Without this the user cannot tell whether the button did anything.
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<EligibilityUndetermined pending={false} onRetry={onRetry} />);

    // Index, not `.at(-1)`: the test tsconfig's lib predates ES2022.
    const statuses = screen.getAllByRole('status');
    const live = statuses[statuses.length - 1];
    expect(live).toHaveTextContent('');

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(live).toHaveTextContent(/1 attempt\b/));

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(live).toHaveTextContent(/2 attempts/));
  });

  it('re-enables the button after a failed retry', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<EligibilityUndetermined pending={false} onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: /try again/i });
    await userEvent.click(button);

    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('is not a dead end — it offers a way back', async () => {
    // An operator who arrived by clicking a nav item has no header here to leave
    // by, and "press Back" is not an affordance.
    render(<EligibilityUndetermined pending={false} onRetry={vi.fn()} />);

    expect(screen.getByRole('link', { name: /back to cases/i })).toHaveAttribute('href', '/cases');
  });
});

describe('the local-network diagnosis', () => {
  /**
   * The same help the SIGNED-OUT visitor gets on this exact failure
   * (LoginPage's UnreachableCard). Withholding it here gave an operator whose
   * session happened to be stored strictly less help than one whose was not.
   */
  it('names Local network access when that is the likely cause', async () => {
    lnaBlocked.mockResolvedValue(true);

    render(<EligibilityUndetermined pending={false} onRetry={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/local network access/i)).toBeInTheDocument(),
    );
  });

  it('falls back to the reachability hint otherwise', async () => {
    render(<EligibilityUndetermined pending={false} onRetry={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/API is running and reachable/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/local network access/i)).not.toBeInTheDocument();
  });

  it('does not render the probe result as a Promise', async () => {
    // The probe is ASYNC. Calling it in the render body makes `lnaLikely` a
    // Promise — always truthy — so the diagnosis would show unconditionally,
    // including for a plainly-down API. Caught while writing this component.
    lnaBlocked.mockResolvedValue(false);

    render(<EligibilityUndetermined pending={false} onRetry={vi.fn()} />);

    await waitFor(() => expect(lnaBlocked).toHaveBeenCalled());
    expect(screen.queryByText(/local network access/i)).not.toBeInTheDocument();
  });
});
