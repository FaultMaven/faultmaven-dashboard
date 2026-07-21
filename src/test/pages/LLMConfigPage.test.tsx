import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LLMConfigPage from '../../pages/LLMConfigPage';
import type { LLMConfig, EnvConfigStatus } from '../../types/llm';

vi.mock('../../lib/api', () => ({
  getLLMConfig: vi.fn(),
  getEnvConfigStatus: vi.fn(),
  updateLLMConfig: vi.fn(),
  logoutAuth: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ clearAuthState: vi.fn() }),
}));

vi.mock('../../components/PageHeader', () => ({ PageHeader: () => <div /> }));
vi.mock('../../components/ProviderCard', () => ({ ProviderCard: () => <div data-testid="provider-card" /> }));
vi.mock('../../components/FeatureStatusPanel', () => ({ FeatureStatusPanel: () => <div /> }));
vi.mock('../../components/EnvConfigStatusPanel', () => ({ EnvConfigStatusPanel: () => <div /> }));

import { getLLMConfig, getEnvConfigStatus } from '../../lib/api';

const mockGetConfig = getLLMConfig as ReturnType<typeof vi.fn>;
const mockGetEnv = getEnvConfigStatus as ReturnType<typeof vi.fn>;

const config: LLMConfig = {
  primary_provider: 'anthropic',
  providers: { anthropic: { name: 'anthropic', display_name: 'Anthropic' } },
  fallback_chain: [],
  strict_mode: true,
  config_readonly: true,
} as unknown as LLMConfig;

const envStatus = { features: {} } as unknown as EnvConfigStatus;

describe('LLMConfigPage error surfacing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces a config load failure with a Retry that recovers', async () => {
    mockGetEnv.mockResolvedValue(envStatus);
    mockGetConfig.mockRejectedValueOnce(new Error('Backend unreachable'));

    render(<LLMConfigPage />);

    await waitFor(() => expect(screen.getByText('Backend unreachable')).toBeInTheDocument());
    // The page did not silently render empty — the provider cards are absent.
    expect(screen.queryByTestId('provider-card')).not.toBeInTheDocument();

    // Retry succeeds → error clears, provider card renders.
    mockGetConfig.mockResolvedValueOnce(config);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByTestId('provider-card')).toBeInTheDocument());
    expect(screen.queryByText('Backend unreachable')).not.toBeInTheDocument();
  });

  it('degrades gracefully when only the env-status probe fails', async () => {
    mockGetConfig.mockResolvedValue(config);
    mockGetEnv.mockRejectedValueOnce(new Error('env down'));

    render(<LLMConfigPage />);

    // Config drives the page, so it still renders; no page-level error banner.
    await waitFor(() => expect(screen.getByTestId('provider-card')).toBeInTheDocument());
    expect(screen.queryByText('env down')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
