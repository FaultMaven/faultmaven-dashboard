import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as api from '../../lib/api';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError, NetworkError } from '../../lib/knowledge/errors';

/**
 * One Idempotency-Key per submission (FaultMaven/faultmaven#2433): an unchanged
 * retry carries the same key until a success or IDEMPOTENCY_KEY_REUSE, and any
 * change to the file or a field carries a new one.
 */

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn(),
  uploadAdminDocument: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 20, offset: 0 }),
  listAdminDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 20, offset: 0 }),
  deleteDocument: vi.fn(),
  deleteAdminDocument: vi.fn(),
}));
vi.mock('../../lib/knowledge/conversion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/knowledge/conversion')>()),
  listAllDrafts: vi.fn().mockResolvedValue([]),
  convertDocument: vi.fn(),
}));
vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, multiTenant: true, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ deployment: 'cloud', role: 'individual', isAdmin: false, authState: { user: { user_id: 'u-1' } }, clearAuthState: vi.fn() }),
}));

const uploadDocument = vi.mocked(api.uploadDocument);
const convertDocument = vi.mocked(conversion.convertDocument);
const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const { ConversionAPIError, translateConversionError } = conversion;

const fileNamed = (name: string) => new File(['# rb'], name, { type: 'text/markdown', lastModified: 1000 });
const outcomeUnknown = () => new APIError('Retry with the same Idempotency-Key.', 500, 'KB_INGEST_OUTCOME_UNKNOWN');
const uploadKeys = () => uploadDocument.mock.calls.map((call) => call[1]);
const convertKeys = () => convertDocument.mock.calls.map((call) => call[2]);

async function click(el: HTMLElement) {
  await act(async () => { fireEvent.click(el); });
}
async function open(item: 'Add Runbook' | 'Convert to Runbook') {
  await click(screen.getByRole('button', { name: /New/i }));
  await click(screen.getByText(item));
}
async function pickFile(name = 'redis.md') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files: [fileNamed(name)] } }); });
}
async function setTitle(value: string) {
  await act(async () => { fireEvent.change(screen.getByPlaceholderText('Enter document title'), { target: { value } }); });
}
/** The overlay's own Cancel (outside the upload dialog), which unmounts the overlay. */
async function closeOverlay() {
  const dialog = screen.queryByRole('dialog');
  await click(screen.getAllByRole('button', { name: 'Cancel' }).find((b) => !dialog?.contains(b)) as HTMLElement);
}
function deferred() {
  let resolve: (value: Awaited<ReturnType<typeof api.uploadDocument>>) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<Awaited<ReturnType<typeof api.uploadDocument>>>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const submitUpload = () => click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Upload' }));
const submitConvert = () => click(screen.getByRole('button', { name: 'Convert' }));
const conversionRefusal = (code: string) =>
  new ConversionAPIError('refused', 409, code, translateConversionError({ error_code: code }, 'failed'));

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await act(async () => { render(<MemoryRouter><KBPage /></MemoryRouter>); });
});

describe('KBPage upload — one Idempotency-Key per submission', () => {
  it('reuses the key after a 500 KB_INGEST_OUTCOME_UNKNOWN, a modal cancel, and a closed overlay', async () => {
    uploadDocument.mockRejectedValue(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    expect(screen.getByText('The runbook may have been published. Submit it again unchanged to find out; it will not be published twice.')).toBeInTheDocument();
    await submitUpload();
    // Cancel the modal, close the overlay (it unmounts), and pick the same file again.
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await click(screen.getByRole('button', { name: 'Cancel' }));
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    const keys = uploadKeys();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
  });

  it('takes a new key when a field changes between attempts', async () => {
    uploadDocument.mockRejectedValue(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await setTitle('Redis OOM');
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(second).not.toBe(first);
  });

  it('an edit that is reverted returns to the first key', async () => {
    uploadDocument
      .mockRejectedValueOnce(outcomeUnknown())
      .mockRejectedValueOnce(new NetworkError('Could not reach the FaultMaven API'))
      .mockRejectedValueOnce(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await setTitle('Redis OOM');
    await submitUpload();
    await setTitle('redis');
    await submitUpload();
    const [first, edited, reverted] = uploadKeys();
    expect(edited).not.toBe(first);
    expect(reverted).toBe(first);
  });

  it('re-picking the same file keeps the key once the custom title is entered again', async () => {
    uploadDocument.mockRejectedValue(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await setTitle('Redis OOM runbook');
    await submitUpload();
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await pickFile();
    // Picking a file re-fills the title from its name: not yet the same submission.
    expect(screen.getByPlaceholderText('Enter document title')).toHaveValue('redis');
    await setTitle('Redis OOM runbook');
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(second).toBe(first);
  });

  it("one upload's success does not drop another's key", async () => {
    const a = deferred();
    const b = deferred();
    uploadDocument.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockRejectedValueOnce(outcomeUnknown());
    await open('Add Runbook');
    await pickFile('redis.md');
    await submitUpload();
    await closeOverlay();
    await open('Add Runbook');
    await pickFile('kafka.md');
    await submitUpload();
    await act(async () => { a.resolve({ document_id: 'a' } as Awaited<ReturnType<typeof api.uploadDocument>>); });
    await act(async () => { b.reject(outcomeUnknown()); });
    // A's settlement may have closed the overlay B was in (FaultMaven/faultmaven#2456);
    // start B's retry from a closed overlay either way.
    if (screen.queryAllByRole('heading', { name: 'Add Runbook' }).length > 0) await closeOverlay();
    await open('Add Runbook');
    await pickFile('kafka.md');
    await submitUpload();
    const [keyA, keyB, retryB] = uploadKeys();
    expect(keyB).not.toBe(keyA);
    expect(retryB).toBe(keyB);
  });

  it('IDEMPOTENCY_KEY_REUSE shows its message and releases the key', async () => {
    uploadDocument.mockRejectedValueOnce(new APIError('Idempotency-Key reused.', 409, 'IDEMPOTENCY_KEY_REUSE'));
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    expect(screen.getByText('This submission changed while it was being retried. Submit it again.')).toBeInTheDocument();
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(second).not.toBe(first);
  });

  it('a 201 releases the key: the next submission of the same file takes a new one', async () => {
    uploadDocument.mockResolvedValue({ document_id: 'd1' } as Awaited<ReturnType<typeof api.uploadDocument>>);
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(second).not.toBe(first);
  });

  it('KB_REQUEST_IN_PROGRESS says when to retry', async () => {
    uploadDocument.mockRejectedValue(new APIError('Still running.', 409, 'KB_REQUEST_IN_PROGRESS', undefined, 7));
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    expect(screen.getByText('This upload is still being processed. Try again in about 7 seconds without changing it; it will not be published twice.')).toBeInTheDocument();
  });
});

describe('KBPage conversion — one Idempotency-Key per submission', () => {
  it('reuses the key after a network error', async () => {
    convertDocument.mockRejectedValue(new NetworkError('Could not reach the FaultMaven API'));
    await open('Convert to Runbook');
    await pickFile();
    await submitConvert();
    await submitConvert();
    const [first, second] = convertKeys();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('IDEMPOTENCY_KEY_REUSE releases the key', async () => {
    convertDocument.mockRejectedValueOnce(conversionRefusal('IDEMPOTENCY_KEY_REUSE'));
    await open('Convert to Runbook');
    await pickFile();
    await submitConvert();
    expect(screen.getByText('This submission changed while it was being retried. Submit it again.')).toBeInTheDocument();
    await submitConvert();
    const [first, second] = convertKeys();
    expect(second).not.toBe(first);
  });

  it('IDEMPOTENCY_REPLAY_UNAVAILABLE reloads the drafts, says so, and keeps the key', async () => {
    convertDocument.mockRejectedValue(conversionRefusal('IDEMPOTENCY_REPLAY_UNAVAILABLE'));
    await open('Convert to Runbook');
    await pickFile();
    const loadsBefore = listAllDrafts.mock.calls.length;
    await submitConvert();
    expect(listAllDrafts.mock.calls.length).toBe(loadsBefore + 1);
    expect(screen.getByText('This conversion already completed. Your drafts list is being reloaded.')).toBeInTheDocument();
    await submitConvert();
    const [first, second] = convertKeys();
    expect(second).toBe(first);
  });
});
