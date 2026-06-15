import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderCard } from '../../components/ProviderCard';
import type { LLMProvider } from '../../types/llm';

vi.mock('../../lib/api', () => ({
  testProviderConnection: vi.fn(),
  updateLLMConfig: vi.fn(),
}));

const provider: LLMProvider = {
  name: 'anthropic',
  display_name: 'Anthropic',
  enabled: true,
  connected: true,
  has_api_key: true,
  state: 'active',
  models: ['claude-3-5-sonnet'],
  selected_model: 'claude-3-5-sonnet',
  available_models: [],
  error_message: null,
  health: 'healthy',
  avg_latency_ms: 100,
};

describe('ProviderCard model-source badge', () => {
  it('shows "admin override" when the model was set via the dashboard', () => {
    render(
      <ProviderCard provider={provider} readonly onUpdated={() => {}} modelSource="admin-override" />,
    );
    expect(screen.getByText('admin override')).toBeInTheDocument();
  });

  it('shows "from .env" for an env-default model', () => {
    render(
      <ProviderCard provider={provider} readonly onUpdated={() => {}} modelSource="env-default" />,
    );
    expect(screen.getByText('from .env')).toBeInTheDocument();
  });

  it('shows no source badge when provenance is absent (older backend)', () => {
    render(<ProviderCard provider={provider} readonly onUpdated={() => {}} />);
    expect(screen.queryByText('admin override')).not.toBeInTheDocument();
    expect(screen.queryByText('from .env')).not.toBeInTheDocument();
  });
});
