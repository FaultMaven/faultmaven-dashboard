export type ProviderName =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'fireworks'
  | 'groq'
  | 'huggingface'
  | 'cohere'
  | 'openrouter'
  | 'local';

export type ProviderState = 'not_configured' | 'configured' | 'active';

export interface LLMProvider {
  name: ProviderName;
  display_name: string;
  enabled: boolean;
  connected: boolean;
  has_api_key: boolean;
  state: ProviderState;
  models: string[];
  selected_model: string | null;
  available_models: string[];
  error_message: string | null;
  health: string;
  avg_latency_ms: number;
}

export interface LLMConfig {
  deployment: 'local' | 'cloud';
  config_readonly: boolean;
  primary_provider: ProviderName;
  strict_mode: boolean;
  fallback_chain: ProviderName[];
  providers: Record<string, LLMProvider>;
}

export interface LLMConfigUpdate {
  primary_provider?: ProviderName;
  fallback_chain?: ProviderName[];
  provider_name?: ProviderName;
  api_key?: string;
  model?: string;
}

export interface ProviderConnectionTestResult {
  provider: string;
  connected: boolean;
  response_time_ms: number;
  error_message: string | null;
  model_used: string | null;
}

export interface FeatureStatus {
  enabled: boolean;
  has_api_key: boolean;
  description: string;
  config_hint: string;
}

export interface EnvConfigStatus {
  auth_mode: 'local' | 'oauth';
  deployment: 'local' | 'cloud';
  db_backend: 'sqlite' | 'postgresql';
  session_storage: 'inmemory' | 'redis';
  vector_storage: 'inmemory' | 'chromadb';
  llm_provider: string;
  pii_redaction_enabled: boolean;
  rate_limit_enabled: boolean;
  features: Record<string, FeatureStatus>;
}
