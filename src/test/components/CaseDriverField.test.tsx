import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `CaseDriverField`'s own guards, each on its own — the page-level tests in
 * `CaseDetailDriver.test.tsx` cannot see them, because there the page's route
 * check stands behind the field's.
 */

vi.mock('../../lib/api', () => ({
  getDriverCandidates: vi.fn(),
  reassignCaseDriver: vi.fn(),
}));

import { CaseDriverField } from '../../components/CaseDriverField';
import { getDriverCandidates, reassignCaseDriver } from '../../lib/api';
import { APIError } from '../../lib/knowledge/errors';
import type { CaseDriverCandidate } from '../../types/cases';

const ADA = { user_id: 'u-ada', display_name: 'Ada Lovelace' };
const GRACE = { user_id: 'u-grace', display_name: 'Grace Hopper' };
const PARTIES = { user_id: 'u-ada', driver_id: 'u-ada', creator_display_name: 'Ada Lovelace' };

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function field(props: Partial<Parameters<typeof CaseDriverField>[0]> = {}) {
  return (
    <CaseDriverField
      caseId="case-1"
      parties={PARTIES}
      sharedTeamIds={['team-sre']}
      viewerId="u-ada"
      onReassigned={vi.fn()}
      onCaseStale={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an answer that lands after the field unmounted reaches nobody', () => {
  it('success: onReassigned is not called', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE]);
    const put = deferred<never>();
    vi.mocked(reassignCaseDriver).mockReturnValue(put.promise);
    const onReassigned = vi.fn();
    const { unmount } = render(field({ onReassigned }));

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    fireEvent.click(
      within(screen.getByRole('list', { name: /hand this case to/i })).getByRole('button', {
        name: /Grace Hopper/,
      }),
    );
    unmount();

    await act(async () => {
      put.resolve({ case_id: 'case-1', driver_id: 'u-grace' } as never);
      await put.promise;
    });
    expect(onReassigned).not.toHaveBeenCalled();
  });

  it('refusal: onCaseStale is not called', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE]);
    const put = deferred<never>();
    vi.mocked(reassignCaseDriver).mockReturnValue(put.promise);
    const onCaseStale = vi.fn();
    const { unmount } = render(field({ onCaseStale }));

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    fireEvent.click(
      within(screen.getByRole('list', { name: /hand this case to/i })).getByRole('button', {
        name: /Grace Hopper/,
      }),
    );
    unmount();

    await act(async () => {
      put.reject(new APIError('conflict', 409, 'CASE_VERSION_CONFLICT'));
      await put.promise.catch(() => {});
    });
    expect(onCaseStale).not.toHaveBeenCalled();
  });

  it('while mounted, the same refusal does reach the page, naming the case', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE]);
    vi.mocked(reassignCaseDriver).mockRejectedValue(new APIError('conflict', 409));
    const onCaseStale = vi.fn();
    render(field({ onCaseStale }));

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    fireEvent.click(
      within(screen.getByRole('list', { name: /hand this case to/i })).getByRole('button', {
        name: /Grace Hopper/,
      }),
    );
    await waitFor(() => expect(onCaseStale).toHaveBeenCalledWith('case-1'));
  });
});

describe('the candidate list in hand is the NEWEST read', () => {
  it('an older read that resolves after a newer one is dropped', async () => {
    const first = deferred<CaseDriverCandidate[]>();
    const second = deferred<CaseDriverCandidate[]>();
    vi.mocked(getDriverCandidates)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { rerender } = render(field());
    // A share changed: who may drive changed, so the list is read again.
    rerender(field({ sharedTeamIds: ['team-sre', 'team-db'] }));
    expect(getDriverCandidates).toHaveBeenCalledTimes(2);

    // The newer read: someone to hand to.
    await act(async () => {
      second.resolve([ADA, GRACE]);
      await second.promise;
    });
    expect(screen.getByRole('button', { name: /change driver/i })).toBeInTheDocument();

    // The older read lands last, with the list from before the share.
    await act(async () => {
      first.resolve([ADA]);
      await first.promise;
    });
    expect(screen.getByRole('button', { name: /change driver/i })).toBeInTheDocument();
  });
});

describe('identical candidate names are told apart', () => {
  const M1 = { user_id: '3f9a12bc-0000-4000-8000-000000000001', display_name: 'Member 3f9a' };
  const M2 = { user_id: '3f9aeeee-0000-4000-8000-000000000002', display_name: 'Member 3f9a' };

  it('renders distinct rows, and the notice names the row that was clicked', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, M1, M2]);
    vi.mocked(reassignCaseDriver).mockResolvedValue({ case_id: 'case-1', driver_id: M2.user_id } as never);
    render(field());

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    const list = screen.getByRole('list', { name: /hand this case to/i });
    const texts = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(new Set(texts).size).toBe(texts.length);
    fireEvent.click(within(list).getByRole('button', { name: /Member 3f9a \(3f9aeeee\)/ }));

    await waitFor(() =>
      expect(screen.getByTestId('case-driver-status').textContent).toBe(
        'Member 3f9a (3f9aeeee) now drives this case.',
      ),
    );
    expect(reassignCaseDriver).toHaveBeenCalledWith('case-1', M2.user_id);
  });
});

describe('the current-driver line reads the label the list and notice use (#219)', () => {
  it('shows the disambiguated label for a driver who shares a name with the creator', async () => {
    const twinAda = { user_id: 'u-ada', display_name: 'Member 3f9a' };
    const twinGrace = { user_id: 'u-grace', display_name: 'Member 3f9a' };
    vi.mocked(getDriverCandidates).mockResolvedValue([twinAda, twinGrace]);
    render(
      field({
        parties: {
          user_id: 'u-ada',
          driver_id: 'u-grace',
          creator_display_name: 'Member 3f9a',
          driver_display_name: 'Member 3f9a',
        },
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Member 3f9a (u-grace)');
    expect(
      within(screen.getByRole('list', { name: /hand this case to/i })).getByRole('button', {
        name: /Member 3f9a \(u-grace\)/,
      }),
    ).toBeInTheDocument();
  });

  it('shows it before any candidate list is read (a viewer who may not hand off)', () => {
    render(
      field({
        viewerId: 'u-linus',
        parties: {
          user_id: 'u-ada',
          driver_id: 'u-grace',
          creator_display_name: 'Member 3f9a',
          driver_display_name: 'Member 3f9a',
        },
      }),
    );

    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Member 3f9a (u-grace)');
  });

  it('names a creator who drives by the creator label even when a third candidate shares it', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([
      { user_id: 'u-ada', display_name: 'Member X' },
      { user_id: 'u-bob', display_name: 'Member X' },
    ]);
    render(
      field({
        parties: {
          user_id: 'u-ada',
          driver_id: 'u-ada',
          creator_display_name: 'Member X',
          driver_display_name: 'Member X',
        },
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent(/^Member X$/);
    expect(
      within(screen.getByRole('list', { name: /hand this case to/i })).getByRole('button', {
        name: /Member X \(u-ada\)/,
      }),
    ).toBeInTheDocument();
  });
});

describe('the page can withhold the hand-off (a case being deleted, faultmaven#2341)', () => {
  it('an open list closes and the control goes; the driver is still named', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE]);
    const { rerender } = render(field());
    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    expect(screen.getByRole('list', { name: /hand this case to/i })).toBeVisible();

    rerender(field({ handOffWithheld: true }));

    expect(screen.queryByRole('button', { name: /change driver/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /hand this case to/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Ada Lovelace');
  });

  it('withheld from the start, it reads no candidates', () => {
    render(field({ handOffWithheld: true }));
    expect(getDriverCandidates).not.toHaveBeenCalled();
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Ada Lovelace');
  });
});

describe('when the hand-off returns after being withheld', () => {
  it('offers it only after a fresh read of the candidates', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE]);
    const { rerender } = render(field());
    await screen.findByRole('button', { name: /change driver/i });

    rerender(field({ handOffWithheld: true }));
    const fresh = deferred<CaseDriverCandidate[]>();
    vi.mocked(getDriverCandidates).mockReturnValue(fresh.promise);
    rerender(field());

    expect(getDriverCandidates).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /change driver/i })).not.toBeInTheDocument();
    await act(async () => {
      fresh.resolve([ADA, GRACE]);
      await fresh.promise;
    });
    expect(screen.getByRole('button', { name: /change driver/i })).toBeInTheDocument();
  });
});

describe('when the hand-off returns after the viewer handed the case away and back', () => {
  it('offers it only after a fresh read of the candidates', async () => {
    // Grace drives a case Ada created: she may hand off, then may not, then may.
    const asGrace = (driver: string) =>
      field({ viewerId: 'u-grace', parties: { ...PARTIES, driver_id: driver } });
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE]);
    const { rerender } = render(asGrace('u-grace'));
    await screen.findByRole('button', { name: /change driver/i });

    rerender(asGrace('u-ada'));
    expect(screen.queryByRole('button', { name: /change driver/i })).not.toBeInTheDocument();
    const fresh = deferred<CaseDriverCandidate[]>();
    vi.mocked(getDriverCandidates).mockReturnValue(fresh.promise);
    rerender(asGrace('u-grace'));

    expect(screen.queryByRole('button', { name: /change driver/i })).not.toBeInTheDocument();
    await act(async () => {
      fresh.resolve([ADA, GRACE]);
      await fresh.promise;
    });
    expect(screen.getByRole('button', { name: /change driver/i })).toBeInTheDocument();
  });
});

describe('after a non-creator driver hands the case away (#219)', () => {
  it('the current-driver line keeps the label the notice used', async () => {
    const M1 = { user_id: '3f9a12bc-0000-4000-8000-000000000001', display_name: 'Member 3f9a' };
    const M2 = { user_id: '3f9aeeee-0000-4000-8000-000000000002', display_name: 'Member 3f9a' };
    const onReassigned = vi.fn();
    // Grace drives Ada's case, so handing it on leaves her no hand-off.
    const asGrace = (driver: string) =>
      field({ viewerId: 'u-grace', parties: { ...PARTIES, driver_id: driver }, onReassigned });
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE, M1, M2]);
    vi.mocked(reassignCaseDriver).mockResolvedValue({ case_id: 'case-1', driver_id: M2.user_id } as never);
    const { rerender } = render(asGrace('u-grace'));

    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    fireEvent.click(screen.getByRole('button', { name: /Member 3f9a \(3f9aeeee\)/ }));
    await waitFor(() => expect(onReassigned).toHaveBeenCalled());
    rerender(asGrace(M2.user_id)); // the page applies the answer

    expect(screen.getByTestId('case-driver-status')).toHaveTextContent('Member 3f9a (3f9aeeee) now drives this case.');
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Member 3f9a (3f9aeeee)');
  });
});
