import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError } from '../../lib/knowledge/errors';
import {
  RUNBOOK_TEXT,
  draftConflict,
  makeConversion,
  makeDraft,
  makeDraftSummary,
} from '../support/kbDrafts';

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn(),
  uploadAdminDocument: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 20, offset: 0 }),
  listAdminDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 20, offset: 0 }),
  deleteDocument: vi.fn(),
  deleteAdminDocument: vi.fn(),
  authManager: {
    getAuthState: vi.fn().mockResolvedValue(null),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null),
  },
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../lib/knowledge/conversion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/knowledge/conversion')>()),
  listAllDrafts: vi.fn(),
  getConversion: vi.fn(),
  updateDraft: vi.fn(),
  verifyDraft: vi.fn(),
}));

vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    deployment: 'standalone',
    role: 'individual',
    isAdmin: false,
    authState: { user: { user_id: 'u-1' } },
    clearAuthState: vi.fn(),
  }),
}));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const getConversion = vi.mocked(conversion.getConversion);
const updateDraft = vi.mocked(conversion.updateDraft);
const verifyDraft = vi.mocked(conversion.verifyDraft);

/** What core writes into a draft's text when it verifies it. */
const VERIFIED_TEXT = RUNBOOK_TEXT.replace('status: draft', 'status: verified\nverified_by: Ada L');
/** What another request left in the draft meanwhile. */
const OTHER_EDIT_TEXT = `${RUNBOOK_TEXT}\nEdited by another request while this one verified, adding a line.`;
/** A text this editor can save: over the 100-character floor, and not what it holds. */
const MY_EDIT_TEXT = `${RUNBOOK_TEXT}\nMy own addition, typed in the editor and not yet saved anywhere.`;

const ALREADY_VERIFIED = 'This runbook has already been verified and ingested';
const CHANGED_DURING_VERIFICATION =
  'This draft changed while it was being verified; nothing was published by this request. ' +
  'Review the latest version and verify again if needed.';

const draftConversion = (content = RUNBOOK_TEXT) => makeConversion([makeDraft({ content })]);
const verifiedConversion = () =>
  makeConversion([makeDraft({ status: 'verified', content: VERIFIED_TEXT })]);

const textarea = () => screen.getByRole('textbox', { name: 'Runbook content' }) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole('button', { name: /Save Draft|Saving/ });

async function openEditor() {
  listAllDrafts.mockResolvedValue([makeDraftSummary()]);
  getConversion.mockResolvedValueOnce(draftConversion());
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/kb?tab=drafts']}>
        <KBPage />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Redis out of memory/ }));
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  });
  expect(textarea()).toHaveValue(RUNBOOK_TEXT);
}

async function type(text: string) {
  await act(async () => {
    fireEvent.change(textarea(), { target: { value: text } });
  });
}

async function activateFromEditor() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
  });
  const dialog = screen.getByRole('dialog');
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(saveButton());
  });
}

describe('KBPage draft editor — it shows the draft the server holds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A queued `…Once` value survives `clearAllMocks`; reset these four so a
    // test that did not consume its refetch cannot feed the next one.
    for (const mock of [listAllDrafts, getConversion, updateDraft, verifyDraft]) mock.mockReset();
  });

  describe('after Activate from inside the editor', () => {
    it('refetches the conversion and shows the activated draft, read-only, with its rewritten text', async () => {
      await openEditor();
      verifyDraft.mockResolvedValue({
        draft_id: 'draft-1',
        runbook_id: 'redis-oom',
        status: 'verified',
        knowledge_item_id: 'ki-1',
        ingested: true,
        ingested_at: null,
        collection: 'knowledge',
        chunks_created: 1,
      });
      getConversion.mockResolvedValueOnce(verifiedConversion());

      await activateFromEditor();

      expect(verifyDraft).toHaveBeenCalledWith('conv-1', 'draft-1');
      // Once to open the draft, once after the verify.
      expect(getConversion).toHaveBeenCalledTimes(2);
      expect(textarea()).toHaveValue(VERIFIED_TEXT);
      expect(textarea()).toHaveAttribute('readonly');
      expect(screen.getByText('Activated')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('still marks the draft activated, and says what is stale, when the refetch fails', async () => {
      await openEditor();
      verifyDraft.mockResolvedValue({
        draft_id: 'draft-1',
        runbook_id: 'redis-oom',
        status: 'verified',
        knowledge_item_id: 'ki-1',
        ingested: true,
        ingested_at: null,
        collection: 'knowledge',
        chunks_created: 1,
      });
      getConversion.mockRejectedValueOnce(new APIError('Bad gateway', 502));

      await activateFromEditor();

      expect(screen.getByText('Activated')).toBeInTheDocument();
      expect(textarea()).toHaveAttribute('readonly');
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(/Activated, but the latest version of the runbook could not be loaded/)).toBeInTheDocument();
    });
  });

  describe('on a 409 from save', () => {
    it('refetches, re-seeds the editor from the server, and keeps the sentence on screen', async () => {
      await openEditor();
      updateDraft.mockRejectedValue(draftConflict('already_verified', ALREADY_VERIFIED));
      getConversion.mockResolvedValueOnce(verifiedConversion());
      await type(MY_EDIT_TEXT);
      expect(saveButton()).toBeEnabled();

      await save();

      expect(updateDraft).toHaveBeenCalledWith('conv-1', 'draft-1', MY_EDIT_TEXT);
      expect(getConversion).toHaveBeenCalledTimes(2);
      // The text typed against a draft that is no longer one is replaced by the server's.
      expect(textarea()).toHaveValue(VERIFIED_TEXT);
      expect(textarea()).toHaveAttribute('readonly');
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(ALREADY_VERIFIED)).toBeInTheDocument();
    });

    it('closes the editor when the draft is gone (a discarded draft is not served)', async () => {
      await openEditor();
      updateDraft.mockRejectedValue(draftConflict('discarded', 'This draft has been discarded'));
      getConversion.mockResolvedValueOnce(makeConversion([]));
      await type(MY_EDIT_TEXT);

      await save();

      expect(getConversion).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('textbox', { name: 'Runbook content' })).not.toBeInTheDocument();
      expect(screen.getByText('This draft has been discarded')).toBeInTheDocument();
    });

    it('names the failed reload beside the sentence when the refetch fails', async () => {
      await openEditor();
      updateDraft.mockRejectedValue(draftConflict('unexpected_state', 'Draft is in unexpected state: archived'));
      getConversion.mockRejectedValueOnce(new APIError('Bad gateway', 502));
      await type(MY_EDIT_TEXT);

      await save();

      expect(
        screen.getByText(/Draft is in unexpected state: archived \(The latest version could not be loaded/),
      ).toBeInTheDocument();
    });
  });

  describe('on a 409 from verify', () => {
    it('refetches and shows the server\'s text when the draft changed during verification', async () => {
      await openEditor();
      verifyDraft.mockRejectedValue(draftConflict('changed_during_verification', CHANGED_DURING_VERIFICATION));
      // Still a draft, so the status does not change: only the text did.
      getConversion.mockResolvedValueOnce(draftConversion(OTHER_EDIT_TEXT));

      await activateFromEditor();

      expect(getConversion).toHaveBeenCalledTimes(2);
      expect(textarea()).toHaveValue(OTHER_EDIT_TEXT);
      // Not verified, so it stays editable and can be verified again.
      expect(textarea()).not.toHaveAttribute('readonly');
      expect(screen.getByText(CHANGED_DURING_VERIFICATION)).toBeInTheDocument();
    });

    it('shows the activated draft when another request verified it first', async () => {
      await openEditor();
      verifyDraft.mockRejectedValue(
        draftConflict('already_verified', 'This runbook was verified by another request meanwhile'),
      );
      getConversion.mockResolvedValueOnce(verifiedConversion());

      await activateFromEditor();

      expect(textarea()).toHaveValue(VERIFIED_TEXT);
      expect(textarea()).toHaveAttribute('readonly');
      expect(screen.getByText('Activated')).toBeInTheDocument();
      expect(screen.getByText('This runbook was verified by another request meanwhile')).toBeInTheDocument();
    });
  });

  describe('on a failure that is not a 409', () => {
    it('shows the server\'s message inline and does not refetch', async () => {
      await openEditor();
      updateDraft.mockRejectedValue(new APIError('String should have at most 100000 characters', 422));
      await type(MY_EDIT_TEXT);

      await save();

      expect(screen.getByText('String should have at most 100000 characters')).toBeInTheDocument();
      // The text in the editor is still the user's, and the server's draft is unchanged.
      expect(textarea()).toHaveValue(MY_EDIT_TEXT);
      expect(getConversion).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the editor mounted across a save it made itself', async () => {
    await openEditor();
    updateDraft.mockResolvedValue(makeDraft({ content: MY_EDIT_TEXT }));
    await type(MY_EDIT_TEXT);
    const before = textarea();

    await save();

    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(getConversion).toHaveBeenCalledTimes(1);
    // The same node: no remount, so the caret and scroll position survive a save.
    expect(textarea()).toBe(before);
    expect(textarea()).toHaveValue(MY_EDIT_TEXT);
    expect(saveButton()).toBeDisabled();
  });
});
