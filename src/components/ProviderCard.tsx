import { useState } from 'react';
import { testProviderConnection, updateLLMConfig } from '../lib/api';
import type { LLMProvider } from '../types/llm';

interface ProviderCardProps {
  provider: LLMProvider;
  onUpdated: () => void;
}

export function ProviderCard({ provider, onUpdated }: ProviderCardProps) {
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    error_message: string | null;
    response_time_ms?: number;
    model_used?: string | null;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSaveKey = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateLLMConfig({ provider_name: provider.name, api_key: apiKey });
      setShowKeyForm(false);
      setApiKey('');
      onUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testProviderConnection(provider.name);
      setTestResult(result);
    } catch (err) {
      setTestResult({ connected: false, error_message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const healthColor = {
    healthy: 'bg-fm-success',
    degraded: 'bg-fm-warning',
    unhealthy: 'bg-fm-critical',
    not_initialized: 'bg-fm-text-tertiary',
  }[provider.health] ?? 'bg-fm-text-tertiary';

  const inputClass =
    'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors text-sm';

  return (
    <div className="bg-fm-surface border border-fm-border rounded-fm-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${healthColor}`}
            title={provider.health}
          />
          <div>
            <p className="font-medium text-fm-text-primary text-sm">{provider.display_name}</p>
            <p className="text-xs text-fm-text-tertiary mt-0.5">
              {provider.has_api_key ? '••••••••••••' : 'No API key set'}
              {provider.avg_latency_ms > 0 && (
                <span className="ml-2">{Math.round(provider.avg_latency_ms)}ms avg</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-1 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
          <button
            onClick={() => setShowKeyForm(!showKeyForm)}
            className="px-3 py-1 text-xs font-medium text-fm-accent border border-fm-accent/30 rounded-fm-btn hover:bg-fm-accent/10 transition-colors"
          >
            Update Key
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`mt-3 text-xs px-3 py-1.5 rounded-fm-btn ${
            testResult.connected
              ? 'bg-fm-success/10 text-fm-success border border-fm-success/20'
              : 'bg-fm-critical/10 text-fm-critical border border-fm-critical/20'
          }`}
        >
          {testResult.connected
            ? `Connected${testResult.response_time_ms ? ` (${testResult.response_time_ms}ms)` : ''}${testResult.model_used ? ` — ${testResult.model_used}` : ''}`
            : (testResult.error_message ?? 'Connection failed')}
        </div>
      )}

      {provider.error_message && !testResult && (
        <p className="mt-2 text-xs text-fm-critical">{provider.error_message}</p>
      )}

      {showKeyForm && (
        <div className="mt-4 space-y-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key"
            className={inputClass}
            autoFocus
          />
          {saveError && <p className="text-xs text-fm-critical">{saveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSaveKey}
              disabled={saving || !apiKey.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowKeyForm(false); setApiKey(''); setSaveError(null); }}
              className="px-3 py-1.5 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
