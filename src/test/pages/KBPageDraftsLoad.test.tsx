import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError, NetworkError } from '../../lib/knowledge/errors';
import { makeDraftSummary } from '../support/kbDrafts';

/**
 * A drafts list that failed to load is not an empty one (#263). The failure
 * used to be swallowed, so a 500 or a dropped connection rendered "No draft
 * runbooks yet." or, under the Report tab's `?case=` deep link, "No drafts
 * found for this case. The draft may have been verified or deleted."
 */

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
  scanForRunbooks: vi.fn(),
}));

vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, multiTenant: true, loading: false, error: null, refetch: vi.fn() }),
}));

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const scanForRunbooks = vi.mocked(conversion.scanForRunbooks);

const SERVER_SAID = 'Internal server error while listing drafts';

async function renderAt(path: string, deployment: 'standalone' | 'cloud' = 'cloud') {
  mockUseAuth.mockReturnValue({
    deployment,
    role: 'individual',
    isAdmin: false,
    authState: { user: { user_id: 'u-1' } },
    clearAuthState: vi.fn(),
  });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <KBPage />
      </MemoryRouter>,
    );
  });
}

function expectNoEmptyState() {
  expect(screen.queryByText('No draft runbooks yet.')).not.toBeInTheDocument();
  expect(screen.queryByText('None of your drafts came from this case.')).not.toBeInTheDocument();
  expect(screen.queryByText('All drafts have been verified.')).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('KBPage Drafts tab — a failed load is shown, never an empty list', () => {
  it('shows the server’s sentence, and no empty state', async () => {
    listAllDrafts.mockRejectedValue(new APIError(SERVER_SAID, 500));

    await renderAt('/kb?tab=drafts');

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expectNoEmptyState();
  });

  it('under the Report tab’s ?case= link, does not say the case’s draft is gone', async () => {
    listAllDrafts.mockRejectedValue(new APIError(SERVER_SAID, 500));

    await renderAt('/kb?tab=drafts&case=case-X');

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expect(screen.getByText('Filtered by case')).toBeInTheDocument();
    expectNoEmptyState();
  });

  it('shows the network’s sentence for a dropped connection', async () => {
    listAllDrafts.mockRejectedValue(new NetworkError('Could not reach the FaultMaven API at http://localhost:8090'));

    await renderAt('/kb?tab=drafts');

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the FaultMaven API at http://localhost:8090');
    expectNoEmptyState();
  });

  it('says only that the drafts could not be loaded for an error of the page’s own', async () => {
    listAllDrafts.mockRejectedValue(new SyntaxError("Unexpected token '<'"));

    await renderAt('/kb?tab=drafts');

    expect(screen.getByRole('alert')).toHaveTextContent('Your drafts could not be loaded.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Unexpected token');
    expectNoEmptyState();
  });

  it('Try again reloads, and a load that succeeds clears the error', async () => {
    listAllDrafts.mockRejectedValueOnce(new APIError(SERVER_SAID, 500)).mockResolvedValueOnce([]);
    await renderAt('/kb?tab=drafts');
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });

    expect(listAllDrafts).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No draft runbooks yet.')).toBeInTheDocument();
  });

  it('a failed refresh keeps the rows already on screen, under the error', async () => {
    listAllDrafts
      .mockResolvedValueOnce([makeDraftSummary({ title: 'Redis out of memory' })])
      .mockRejectedValueOnce(new APIError(SERVER_SAID, 503));
    scanForRunbooks.mockResolvedValue({ discovered: 0, skipped: 0, errors: [], notes: [], drafts: [] });
    await renderAt('/kb?tab=drafts', 'standalone');
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();

    // The scan reloads the list when it finishes; this reload fails.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });

    expect(listAllDrafts).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
  });

  it('a failed refresh over rows that are all verified shows no empty state either', async () => {
    listAllDrafts
      .mockResolvedValueOnce([makeDraftSummary({ status: 'verified' })])
      .mockRejectedValueOnce(new APIError(SERVER_SAID, 503));
    scanForRunbooks.mockResolvedValue({ discovered: 3, skipped: 0, errors: [], notes: [], drafts: [] });
    await renderAt('/kb?tab=drafts', 'standalone');
    expect(screen.getByText('All drafts have been verified.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expectNoEmptyState();
  });

  it('a storage write that throws after a load succeeds is not a failed load', async () => {
    listAllDrafts.mockResolvedValue([makeDraftSummary({ title: 'Redis out of memory' })]);
    // A full (or Safari-private) storage. happy-dom's localStorage does not
    // call through Storage.prototype, so the global itself is replaced.
    const setItem = vi.fn(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem,
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    try {
      await renderAt('/kb?tab=drafts');

      expect(setItem).toHaveBeenCalledWith('faultmaven_draftCount_u-1', '1');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('KBPage Drafts tab — only the newest load applies its answer', () => {
  it('an earlier load failing after a newer one succeeded leaves the fresh list, and no error', async () => {
    let failFirst: () => void = () => {};
    listAllDrafts
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            failFirst = () => reject(new APIError(SERVER_SAID, 500));
          }),
      )
      .mockResolvedValueOnce([makeDraftSummary({ title: 'Redis out of memory' })]);
    scanForRunbooks.mockResolvedValue({ discovered: 1, skipped: 0, errors: [], notes: [], drafts: [] });
    await renderAt('/kb?tab=drafts', 'standalone');

    // The mount's load is still out; the scan's reload answers first.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });
    expect(listAllDrafts).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();

    await act(async () => {
      failFirst();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
  });

  it('an earlier load succeeding after a newer one failed leaves the error', async () => {
    let answerFirst: () => void = () => {};
    listAllDrafts
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = () => resolve([makeDraftSummary({ title: 'A stale list' })]);
          }),
      )
      .mockRejectedValueOnce(new APIError(SERVER_SAID, 503));
    scanForRunbooks.mockResolvedValue({ discovered: 0, skipped: 0, errors: [], notes: [], drafts: [] });
    await renderAt('/kb?tab=drafts', 'standalone');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);

    await act(async () => {
      answerFirst();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expect(screen.queryByText('A stale list')).not.toBeInTheDocument();
  });
});

describe('KBPage Drafts tab — Try again, for a keyboard and a screen reader', () => {
  /** A load the test answers by hand. */
  function deferredLoad() {
    const load: { succeed: () => void; fail: () => void } = { succeed: () => {}, fail: () => {} };
    listAllDrafts.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          load.succeed = () => resolve([makeDraftSummary({ title: 'Redis out of memory' })]);
          load.fail = () => reject(new APIError(SERVER_SAID, 500));
        }),
    );
    return load;
  }

  it('keeps the button focused while the retry runs, and re-announces a second failure', async () => {
    listAllDrafts.mockRejectedValueOnce(new APIError(SERVER_SAID, 500));
    await renderAt('/kb?tab=drafts');
    const retry = deferredLoad();
    const button = screen.getByRole('button', { name: 'Try again' });
    button.focus();

    await act(async () => {
      fireEvent.click(button);
    });

    // Still there, still focused, and the alert says something new.
    expect(button).toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Loading your drafts…');
    // A second press while it runs does nothing.
    fireEvent.click(button);
    expect(listAllDrafts).toHaveBeenCalledTimes(2);

    await act(async () => {
      retry.fail();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expect(button).toHaveFocus();
  });

  it('moves focus to the drafts when the retry succeeds and the alert goes', async () => {
    listAllDrafts.mockRejectedValueOnce(new APIError(SERVER_SAID, 500));
    await renderAt('/kb?tab=drafts');
    const retry = deferredLoad();
    const button = screen.getByRole('button', { name: 'Try again' });
    button.focus();

    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      retry.succeed();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Drafts' })).toHaveFocus();
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
  });
});
