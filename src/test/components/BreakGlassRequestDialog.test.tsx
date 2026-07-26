import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreakGlassRequestDialog } from '../../components/BreakGlassRequestDialog';

/**
 * The break-glass request form (ADR-012 D9, faultmaven#815 / #62).
 *
 * The properties worth pinning are the ones that keep a grant reviewable: a
 * justification with substance, a bounded window, and no way to widen one.
 */

vi.mock('../../lib/breakGlass/api', () => ({
  requestBreakGlassGrant: vi.fn(),
}));

import { requestBreakGlassGrant } from '../../lib/breakGlass/api';

const mockRequest = requestBreakGlassGrant as ReturnType<typeof vi.fn>;

const CASE_ID = 'case_a1b2c3d4e5f6';
const GOOD_REASON = 'customer reports the investigation is stuck; ticket SUP-4821';

function renderDialog(overrides: Partial<Parameters<typeof BreakGlassRequestDialog>[0]> = {}) {
  const onGranted = vi.fn();
  const onCancel = vi.fn();
  render(
    <BreakGlassRequestDialog
      caseId={CASE_ID}
      organizationId="org-acme"
      onGranted={onGranted}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onGranted, onCancel };
}

function submit() {
  return screen.getByRole('button', { name: /Request access/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequest.mockResolvedValue({ grant_id: 'grant-1' });
});

describe('BreakGlassRequestDialog', () => {
  it.each([
    ['empty', ''],
    ['a single character', '.'],
    ['too short', 'debugging'],
    ['whitespace only', '                                        '],
    ['padded to length with whitespace', '  x                                     '],
  ])('refuses to submit a reason that is %s', async (_label, reason) => {
    // The last case is the one that matters: measuring the floor before
    // trimming would let "x" plus spaces through, which is exactly the
    // degenerate justification the floor exists to stop. The backend rejects it
    // either way; this keeps the button from offering a request that can only
    // fail.
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Why do you need this/i), {
      target: { value: reason },
    });

    expect(submit()).toBeDisabled();
  });

  it('submits a real justification, trimmed', async () => {
    const { onGranted } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Why do you need this/i), {
      target: { value: `  ${GOOD_REASON}  ` },
    });

    await act(async () => {
      fireEvent.click(submit());
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: CASE_ID, organizationId: 'org-acme', reason: GOOD_REASON })
    );
    await waitFor(() => expect(onGranted).toHaveBeenCalled());
  });

  it('offers only windows the backend accepts, and defaults to an hour', () => {
    renderDialog();
    const ttl = screen.getByLabelText(/Access expires after/i) as HTMLSelectElement;

    expect(ttl.value).toBe('60');
    const offered = Array.from(ttl.options).map((o) => Number(o.value));
    // The backend ceiling is 240 minutes; offering more would be a control the
    // form promises and the API refuses.
    expect(Math.max(...offered)).toBeLessThanOrEqual(240);
    expect(Math.min(...offered)).toBeGreaterThan(0);
  });

  it('sends the chosen window', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Why do you need this/i), {
      target: { value: GOOD_REASON },
    });
    fireEvent.change(screen.getByLabelText(/Access expires after/i), {
      target: { value: '120' },
    });

    await act(async () => {
      fireEvent.click(submit());
    });

    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ ttlMinutes: 120 }));
  });

  it('says the access cannot be extended', () => {
    // An extendable grant converges on a standing one. The form has to say so,
    // because the alternative is an operator picking the shortest window and
    // then discovering there is no way to keep it.
    renderDialog();
    expect(screen.getByText(/cannot be extended/i)).toBeInTheDocument();
  });

  it('says the reason and the reads are recorded, before anything is disclosed', () => {
    renderDialog();
    expect(screen.getByText(/cannot be edited or deleted/i)).toBeInTheDocument();
  });

  it('bounds the reason at the length the backend accepts', () => {
    // Without this a pasted log excerpt types happily and 422s on submit — the
    // failure arriving only after the operator committed to the request.
    renderDialog();
    expect(screen.getByLabelText(/Why do you need this/i)).toHaveAttribute(
      'maxLength',
      '2000'
    );
  });

  it('focuses the reason field on open', () => {
    renderDialog();
    expect(screen.getByLabelText(/Why do you need this/i)).toHaveFocus();
  });

  it('closes on Escape', () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not close on Escape mid-request', async () => {
    // Cancelling while a grant is being minted would leave the operator unsure
    // whether one now exists. Same rule as `ConfirmDialog`.
    let release: (v: unknown) => void = () => {};
    mockRequest.mockReturnValue(new Promise((r) => (release = r)));
    const { onCancel } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Why do you need this/i), {
      target: { value: GOOD_REASON },
    });

    await act(async () => {
      fireEvent.click(submit());
    });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => {
      release({ grant_id: 'grant-1' });
    });
  });

  it('surfaces a refusal instead of reporting success', async () => {
    mockRequest.mockRejectedValue(new Error('reason must be at least 20 characters'));
    const { onGranted } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Why do you need this/i), {
      target: { value: GOOD_REASON },
    });

    await act(async () => {
      fireEvent.click(submit());
    });

    await waitFor(() => screen.getByText(/reason must be at least 20 characters/));
    expect(onGranted).not.toHaveBeenCalled();
  });
});
