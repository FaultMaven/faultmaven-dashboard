import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConfirmDialog } from '../../components/ConfirmDialog';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog isOpen={false} message="Are you sure?" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables both buttons while an async confirm is in flight', async () => {
    const d = deferred<void>();
    const onConfirm = vi.fn(() => d.promise);
    render(
      <ConfirmDialog isOpen message="Remove?" confirmLabel="Remove" onConfirm={onConfirm} onCancel={() => {}} />,
    );

    const confirm = screen.getByRole('button', { name: /Remove/ });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(cancel).toBeDisabled();
    // A second click must not fire onConfirm again.
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    d.resolve();
    await waitFor(() => expect(confirm).not.toBeDisabled());
  });

  it('Escape triggers cancel when idle', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog isOpen message="Remove?" onConfirm={() => {}} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape is ignored while a confirm is in flight', async () => {
    const d = deferred<void>();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog isOpen message="Remove?" confirmLabel="Remove" onConfirm={() => d.promise} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => { d.resolve(); });
  });
});
