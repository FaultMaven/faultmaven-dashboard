import { makeAuthenticatedRequest } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  LLMConfig,
  LLMConfigUpdate,
  ProviderConnectionTestResult,
  EnvConfigStatus,
} from '../../types/llm';

const LLM_CONFIG_URL = '/api/v1/admin/llm/config';
const ENV_CONFIG_URL = '/api/v1/admin/config/status';

/**
 * Get current LLM provider configuration and status.
 *
 * Returns provider details, fallback chain, health status, and API key
 * presence (keys are never exposed — only has_api_key boolean).
 */
export async function getLLMConfig(): Promise<LLMConfig> {
  const response = await makeAuthenticatedRequest(LLM_CONFIG_URL);
  await handleAPIResponse(response, 'Failed to get LLM configuration');
  return response.json();
}

/**
 * Update LLM provider configuration (primary provider, fallback chain, API keys).
 *
 * Persists changes as overrides that take precedence over environment variables.
 * Changes take effect immediately without a restart.
 */
export async function updateLLMConfig(update: LLMConfigUpdate): Promise<void> {
  const response = await makeAuthenticatedRequest(LLM_CONFIG_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  await handleAPIResponse(response, 'Failed to update LLM configuration');
}

/**
 * Test connectivity to a specific LLM provider.
 *
 * Sends a minimal prompt directly to the provider (bypasses fallback chain)
 * to verify API key validity, endpoint reachability, and model response.
 */
export async function testProviderConnection(
  providerName: string
): Promise<ProviderConnectionTestResult> {
  const response = await makeAuthenticatedRequest(`${LLM_CONFIG_URL}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerName }),
  });
  await handleAPIResponse(response, 'Failed to test provider connection');
  return response.json();
}

/**
 * Get read-only environment configuration status.
 */
export async function getEnvConfigStatus(): Promise<EnvConfigStatus> {
  const response = await makeAuthenticatedRequest(ENV_CONFIG_URL);
  await handleAPIResponse(response, 'Failed to get environment configuration');
  return response.json();
}
