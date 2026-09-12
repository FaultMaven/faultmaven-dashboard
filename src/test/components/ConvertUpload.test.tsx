import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The refusal has to carry a way out that is ON SCREEN.
 *
 * `NewDropdown` — which owns `Add Runbook` and `Write Runbook` — is rendered
 * under `{!overlayMode && …}` in KBPage, so it is unmounted for the whole
 * lifetime of this overlay. An error message that names either control names
 * something absent from the DOM at the moment it is read, which is why the
 * remedy is a button here rather than a noun in the sentence
 * (FaultMaven/faultmaven#1375, and #1377 for the underlying import gap).
 */

vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false }),
}));

import { ConvertUpload } from '../../components/ConvertUpload';

const ALREADY_A_RUNBOOK = {
  code: 'ALREADY_A_RUNBOOK',
  title: 'Already a runbook',
  message: 'Converting it would re-derive a new runbook…',
  action: 'Bring it in through the runbook template…',
};

/**
 * A file has to be selected before the error block exists at all: ConvertUpload
 * renders `{!file ? <UploadZone/> : <form>}` and the error lives in the form
 * branch. That matches production — the local `file` state survives a failed
 * submit, so the refusal is shown over the file that caused it.
 */
async function selectAFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await userEvent.upload(input, new File(['# a runbook'], 'redis-oom.md', { type: 'text/markdown' }));
}

// Both arguments are REQUIRED. A default of `vi.fn()` here is a trap: a default
// parameter fires on an explicitly passed `undefined`, so the "no handler" case
// silently received a handler and the test asserted the opposite of its name.
async function renderWith(
  error: typeof ALREADY_A_RUNBOOK | null,
  onWriteRunbook: (() => void) | undefined,
) {
  const { container } = render(
    <ConvertUpload
      onConvert={vi.fn()}
      onCancel={vi.fn()}
      loading={false}
      error={error}
      onWriteRunbook={onWriteRunbook}
    />,
  );
  await selectAFile(container);
}

describe('ConvertUpload — already-a-runbook remedy', () => {
  it('offers the template button and routes to it', async () => {
    const onWriteRunbook = vi.fn();
    await renderWith(ALREADY_A_RUNBOOK, onWriteRunbook);

    const button = screen.getByRole('button', { name: /write runbook/i });
    await userEvent.click(button);

    expect(onWriteRunbook).toHaveBeenCalledTimes(1);
  });

  it('shows the action text alongside it', async () => {
    await renderWith(ALREADY_A_RUNBOOK, vi.fn());

    expect(screen.getByText(ALREADY_A_RUNBOOK.action)).toBeInTheDocument();
  });

  it('offers no button when there is no error', async () => {
    await renderWith(null, vi.fn());

    expect(screen.queryByRole('button', { name: /write runbook/i })).not.toBeInTheDocument();
  });

  it('offers no button for an unrelated error code', async () => {
    // Keyed on the code, not on the presence of an error: a document that is
    // simply not actionable is not fixed by authoring a runbook by hand.
    await renderWith({
      code: 'NO_TECHNICAL_CONTENT',
      title: 'No technical content detected',
      message: 'x',
      action: 'y',
    }, vi.fn());

    expect(screen.queryByRole('button', { name: /write runbook/i })).not.toBeInTheDocument();
  });

  it('offers no button when the parent supplies no handler', async () => {
    await renderWith(ALREADY_A_RUNBOOK, undefined);

    expect(screen.queryByRole('button', { name: /write runbook/i })).not.toBeInTheDocument();
  });

  it('positive control: the error block itself renders', async () => {
    // Without this, every "no button" assertion above would also pass if the
    // error block never rendered at all — which is exactly how the first cut of
    // this file passed three of five tests for the wrong reason.
    await renderWith(ALREADY_A_RUNBOOK, vi.fn());

    expect(screen.getByText(ALREADY_A_RUNBOOK.title)).toBeInTheDocument();
  });
});
