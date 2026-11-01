import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as api from '../../lib/api';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError, NetworkError } from '../../lib/knowledge/errors';
import { makeConversion, makeDraft } from '../support/kbDrafts';

/**
 * One Idempotency-Key per submission identity, per signed-in user, until a page
 * reload (FaultMaven/faultmaven#2433). Only IDEMPOTENCY_KEY_REUSE releases it:
 * an unchanged retry, and an identical re-submission after a 201, carry the same
 * key, and any change to the file or a field carries another.
 */

// The holders live for the loaded app, so each test signs in as its own user.
const auth = vi.hoisted(() => ({ userId: 'u-0' }));

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
  getConversion: vi.fn(),
}));
vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, multiTenant: true, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ deployment: 'cloud', role: 'individual', isAdmin: false, authState: { user: { user_id: auth.userId } }, clearAuthState: vi.fn() }),
}));

const uploadDocument = vi.mocked(api.uploadDocument);
const convertDocument = vi.mocked(conversion.convertDocument);
const getConversion = vi.mocked(conversion.getConversion);
const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const { ConversionAPIError, translateConversionError } = conversion;

const KEY_REUSE_MESSAGE = "The file's contents differ from what was submitted under this name. Submit it again.";
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
/**
 * Send the same file again from a closed overlay. A settling send may already
 * have closed the overlay a later send was in (FaultMaven/faultmaven#2456), so
 * close it here when it is still open: these tests do not depend on that bug.
 */
async function resubmitFromClosedOverlay(title?: string) {
  if (screen.queryAllByRole('heading', { name: 'Add Runbook' }).length > 0) await closeOverlay();
  await open('Add Runbook');
  await pickFile();
  if (title !== undefined) await setTitle(title);
  await submitUpload();
}
async function renderPage() {
  let rendered: ReturnType<typeof render> | undefined;
  await act(async () => { rendered = render(<MemoryRouter><KBPage /></MemoryRouter>); });
  return rendered as ReturnType<typeof render>;
}
const created = (id: string) => ({ document_id: id }) as Awaited<ReturnType<typeof api.uploadDocument>>;
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

let view: ReturnType<typeof render>;
let user = 0;
beforeEach(async () => {
  vi.clearAllMocks();
  for (const mock of [uploadDocument, convertDocument, getConversion]) mock.mockReset();
  localStorage.clear();
  auth.userId = `u-${++user}`;
  view = await renderPage();
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

  it('(c) an edit that fails with a network error, then a revert, returns to the first key', async () => {
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

  it('(a′) re-picking the same file keeps the key once the custom title is entered again', async () => {
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

  it("(d) one upload's success leaves another's key held", async () => {
    const a = deferred();
    const b = deferred();
    uploadDocument.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockRejectedValueOnce(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await closeOverlay();
    await open('Add Runbook');
    await pickFile();
    await setTitle('Redis OOM');
    await submitUpload();
    await act(async () => { a.resolve(created('a')); });
    await act(async () => { b.reject(outcomeUnknown()); });
    await resubmitFromClosedOverlay('Redis OOM');
    const [keyA, keyB, retryB] = uploadKeys();
    expect(keyB).not.toBe(keyA);
    expect(retryB).toBe(keyB);
  });

  it('(D1) a send told KB_REQUEST_IN_PROGRESS keeps the key through the first send’s 201', async () => {
    const a = deferred();
    uploadDocument
      .mockReturnValueOnce(a.promise)
      .mockRejectedValueOnce(new APIError('Still running.', 409, 'KB_REQUEST_IN_PROGRESS', undefined, 3));
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await closeOverlay();
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    expect(screen.getByText(/This upload is still being processed/)).toBeInTheDocument();
    await act(async () => { a.resolve(created('a')); });
    await resubmitFromClosedOverlay();
    const [keyA, keyB, retryB] = uploadKeys();
    expect(keyB).toBe(keyA);
    expect(retryB).toBe(keyA);
  });

  it.each([
    ['a network error', () => new NetworkError('Could not reach the FaultMaven API')],
    ['a 500 KB_INGEST_OUTCOME_UNKNOWN', outcomeUnknown],
  ])('(M1) a sibling send that fails with %s keeps the key through the first send’s 201', async (_, failure) => {
    const a = deferred();
    uploadDocument.mockReturnValueOnce(a.promise).mockRejectedValueOnce(failure());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await closeOverlay();
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await act(async () => { a.resolve(created('a')); });
    await resubmitFromClosedOverlay();
    const [keyA, keyB, retryB] = uploadKeys();
    expect(keyB).toBe(keyA);
    expect(retryB).toBe(keyA);
  });

  it('after a 201, the identical upload sends the same key', async () => {
    uploadDocument.mockResolvedValue(created('d1'));
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('IDEMPOTENCY_KEY_REUSE shows its message and releases the key', async () => {
    uploadDocument.mockRejectedValueOnce(new APIError('Idempotency-Key reused.', 409, 'IDEMPOTENCY_KEY_REUSE'));
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    expect(screen.getByText(KEY_REUSE_MESSAGE)).toBeInTheDocument();
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

  it('keeps the key across leaving the KB page and coming back', async () => {
    uploadDocument.mockRejectedValue(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    // Navigating away unmounts KBPage (its own route); coming back renders it again.
    view.unmount();
    view = await renderPage();
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(second).toBe(first);
  });

  it('gives another signed-in user a key of their own for the same submission', async () => {
    uploadDocument.mockRejectedValue(outcomeUnknown());
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    view.unmount();
    auth.userId = `${auth.userId}-other`;
    view = await renderPage();
    await open('Add Runbook');
    await pickFile();
    await submitUpload();
    const [first, second] = uploadKeys();
    expect(second).not.toBe(first);
  });
});

describe('KBPage conversion — one Idempotency-Key per submission', () => {
  const kept = makeDraft({ draft_id: 'draft-1', title: 'Redis out of memory' });
  const dropped = makeDraft({ draft_id: 'draft-2', title: 'Redis eviction storm' });
  /** The first job's stored body: both drafts. The job now serves only `kept`. */
  const stored = makeConversion([kept, dropped]);

  async function convert() {
    await open('Convert to Runbook');
    await pickFile();
    await submitConvert();
  }

  it('after a 201, the identical conversion sends the same key', async () => {
    convertDocument.mockResolvedValue({ conversion: makeConversion(), replayed: false });
    await convert();
    await click(screen.getByRole('button', { name: 'Back' }));
    await convert();
    const [first, second] = convertKeys();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('reuses the key after a network error', async () => {
    convertDocument.mockRejectedValue(new NetworkError('Could not reach the FaultMaven API'));
    await convert();
    await submitConvert();
    const [first, second] = convertKeys();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('IDEMPOTENCY_KEY_REUSE shows its message and releases the key', async () => {
    convertDocument.mockRejectedValueOnce(conversionRefusal('IDEMPOTENCY_KEY_REUSE'));
    await convert();
    expect(screen.getByText(KEY_REUSE_MESSAGE)).toBeInTheDocument();
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

  it('a replayed 201 shows the job as it is now, not its stored body', async () => {
    convertDocument.mockResolvedValue({ conversion: stored, replayed: true });
    getConversion.mockResolvedValue(makeConversion([kept]));
    await convert();
    expect(getConversion).toHaveBeenCalledWith(stored.conversion_id);
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
    expect(screen.queryByText('Redis eviction storm')).not.toBeInTheDocument();
  });

  it('a 201 that is not a replay shows its own body without a refetch', async () => {
    convertDocument.mockResolvedValue({ conversion: stored, replayed: false });
    await convert();
    expect(getConversion).not.toHaveBeenCalled();
    expect(screen.getByText('Redis eviction storm')).toBeInTheDocument();
  });

  it('a replayed 201 whose refetch fails shows the stored body', async () => {
    convertDocument.mockResolvedValue({ conversion: stored, replayed: true });
    getConversion.mockRejectedValue(new APIError('Bad gateway', 502));
    await convert();
    expect(getConversion).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Redis eviction storm')).toBeInTheDocument();
  });
});
