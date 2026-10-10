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
