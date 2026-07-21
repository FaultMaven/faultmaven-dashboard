import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ProviderCard } from '../components/ProviderCard';
import { FeatureStatusPanel } from '../components/FeatureStatusPanel';
import { EnvConfigStatusPanel } from '../components/EnvConfigStatusPanel';
import { useAuth } from '../context/AuthContext';
import { getLLMConfig, getEnvConfigStatus, updateLLMConfig } from '../lib/api';
import { logoutAuth } from '../lib/api';
import type { LLMConfig, EnvConfigStatus, ProviderName } from '../types/llm';

export default function LLMConfigPage() {
  const { clearAuthState } = useAuth();
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    // The config drives the whole page; the env-status panels are secondary and
    // simply hide when absent. So a config failure surfaces an error (with
    // Retry), while a failing env-status probe alone degrades gracefully.
    const [cfgResult, envResult] = await Promise.allSettled([
      getLLMConfig(),
      getEnvConfigStatus(),
    ]);
    setConfig(cfgResult.status === 'fulfilled' ? cfgResult.value : null);
    setEnvStatus(envResult.status === 'fulfilled' ? envResult.value : null);
    if (cfgResult.status === 'rejected') {
      const reason = cfgResult.reason;
      setError(reason instanceof Error ? reason.message : 'Failed to load configuration');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateLLMConfig({
        primary_provider: config.primary_provider,
        fallback_chain: config.fallback_chain,
      });
      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      loadConfig();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const readonly = config?.config_readonly ?? true;

  const selectClass =
    'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors text-sm';

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-2">LLM Settings</h2>
          <p className="text-fm-text-secondary text-sm">
            {readonly
              ? 'Read-only view of your LLM configuration. Edit the .env file and restart the server to make changes.'
              : 'Configure AI providers and API keys for the investigation engine.'}
          </p>
        </div>

        {loading && (
          <div className="text-fm-text-tertiary text-sm">Loading configuration...</div>
        )}

        {error && (
          <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3 mb-4 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={loadConfig}
              disabled={loading}
              className="px-3 py-1 text-xs font-medium text-fm-critical border border-fm-critical-border rounded-fm-btn hover:bg-fm-critical/10 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {config && (
          <>
            {/* Primary provider */}
            <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6 mb-6">
              <h3 className="text-base font-semibold text-fm-text-primary mb-4">Primary Provider</h3>
              {readonly ? (
                <p className="text-sm text-fm-text-secondary">
                  {config.providers[config.primary_provider]?.display_name ?? config.primary_provider}
                </p>
              ) : (
                <select
                  value={config.primary_provider}
                  onChange={(e) =>
                    setConfig({ ...config, primary_provider: e.target.value as ProviderName })
                  }
                  className={selectClass}
                >
                  {Object.values(config.providers).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Fallback chain */}
            <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6 mb-6">
              <h3 className="text-base font-semibold text-fm-text-primary mb-1">Routing Mode</h3>
              <p className="text-xs text-fm-text-tertiary mb-4">
                {config.strict_mode
                  ? 'Strict mode — all traffic routed to the primary provider only.'
                  : 'Multi-provider — falls back to other providers if the primary fails.'}
              </p>
              {!config.strict_mode && config.fallback_chain.length > 0 && (
                <ol className="space-y-2">
                  {config.fallback_chain.map((name, idx) => (
                    <li key={name} className="flex items-center gap-3 text-sm text-fm-text-secondary">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-fm-elevated text-xs font-medium text-fm-text-tertiary">
                        {idx + 1}
                      </span>
                      {config.providers[name]?.display_name ?? name}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Save — cloud mode only */}
            {!readonly && (
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
                {saved && <span className="text-fm-success text-sm">Saved</span>}
                {saveError && <span className="text-fm-critical text-sm">{saveError}</span>}
              </div>
            )}

            {/* Provider cards */}
            <div className="mb-8">
              <h3 className="text-base font-semibold text-fm-text-primary mb-4">Providers</h3>
              <div className="space-y-3">
                {Object.values(config.providers).map((provider) => (
                  <ProviderCard
                    key={provider.name}
                    provider={provider}
                    readonly={readonly}
                    onUpdated={loadConfig}
                    modelSource={config.config_sources?.[`${provider.name}_model`]}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Feature status */}
        {envStatus?.features && (
          <FeatureStatusPanel features={envStatus.features} readonly={readonly} />
        )}

        {/* Env status */}
        {envStatus && <EnvConfigStatusPanel status={envStatus} />}
      </main>
    </div>
  );
}
