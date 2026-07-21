import { useState, useRef, useEffect } from 'react';
import { testProviderConnection, updateLLMConfig } from '../lib/api';
import type { LLMProvider } from '../types/llm';

interface ProviderCardProps {
  provider: LLMProvider;
  readonly: boolean;
  onUpdated: () => void;
  /** Provenance of this provider's model setting: 'admin-override' | 'env-default'. */
  modelSource?: string;
}

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-fm-success/15 text-fm-success border-fm-success/30' },
  configured: { label: 'Configured', className: 'bg-fm-accent/10 text-fm-accent border-fm-accent/30' },
  not_configured: { label: 'Not configured', className: 'bg-fm-surface-alt text-fm-text-tertiary border-fm-border' },
};

export function ProviderCard({ provider, readonly, onUpdated, modelSource }: ProviderCardProps) {
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

  // Model combobox state
  const [modelInput, setModelInput] = useState(provider.selected_model ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync model input when provider data refreshes
  useEffect(() => {
    setModelInput(provider.selected_model ?? '');
  }, [provider.selected_model]);

  // Clear the "Saved" flash timer if the card unmounts mid-flash.
  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  // Persist a model choice. Both the typed-Save path and the suggestion-click
  // path funnel here so a failure is surfaced (previously swallowed) instead of
  // silently reverting on the next refresh.
  const saveModel = async (model: string) => {
    setSavingModel(true);
    setModelSaved(false);
    setModelError(null);
    try {
      await updateLLMConfig({ provider_name: provider.name, model });
      setModelSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setModelSaved(false), 2000);
      onUpdated();
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Failed to save model');
    } finally {
      setSavingModel(false);
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  const handleSaveModel = async () => {
    const trimmed = modelInput.trim();
    if (!trimmed || trimmed === provider.selected_model) return;
    await saveModel(trimmed);
  };

  const handleSelectSuggestion = (model: string) => {
    setModelInput(model);
    setShowSuggestions(false);
    if (model !== provider.selected_model) {
      void saveModel(model);
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

  // Filter suggestions by what the user has typed
  const allModels = [...new Set([
    ...(provider.selected_model ? [provider.selected_model] : []),
    ...provider.available_models,
  ])];
  const filteredSuggestions = modelInput.trim()
    ? allModels.filter(m => m.toLowerCase().includes(modelInput.toLowerCase()))
    : allModels;

  const canTest = provider.has_api_key;
  const modelChanged = modelInput.trim() !== (provider.selected_model ?? '');
  const badge = STATE_BADGE[provider.state] ?? STATE_BADGE.not_configured;

  return (
    <div className="bg-fm-surface border border-fm-border rounded-fm-card p-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${healthColor}`}
            title={provider.health}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-fm-text-primary text-sm">{provider.display_name}</p>
              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-fm-text-tertiary mt-0.5">
              {provider.has_api_key ? '••••••••••••' : 'No API key set'}
              {provider.avg_latency_ms > 0 && (
                <span className="ml-2">{Math.round(provider.avg_latency_ms)}ms avg</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canTest && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test'}
            </button>
          )}
          {!readonly && (
            <button
              onClick={() => setShowKeyForm(!showKeyForm)}
              className="px-3 py-1 text-xs font-medium text-fm-accent border border-fm-accent/30 rounded-fm-btn hover:bg-fm-accent/10 transition-colors"
            >
              Update Key
            </button>
          )}
        </div>
      </div>

      {/* Model row */}
      <div className="mt-3 flex items-center gap-2 relative">
        <span className="text-xs text-fm-text-tertiary flex-shrink-0">Model:</span>
        {readonly ? (
          <span className="text-xs text-fm-text-secondary">
            {provider.selected_model ?? 'Default'}
          </span>
        ) : (
          <>
            <div className="relative flex-1 max-w-sm">
              <input
                ref={inputRef}
                type="text"
                value={modelInput}
                onChange={(e) => { setModelInput(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSaveModel(); setShowSuggestions(false); }
                  if (e.key === 'Escape') setShowSuggestions(false);
                }}
                placeholder="Enter model name"
                className="w-full px-2 py-1 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary text-xs focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-10 mt-1 w-full bg-fm-surface border border-fm-border rounded-fm-card shadow-lg max-h-40 overflow-y-auto"
                >
                  {filteredSuggestions.map((model) => (
                    <button
                      key={model}
                      onClick={() => handleSelectSuggestion(model)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-fm-elevated transition-colors ${
                        model === provider.selected_model ? 'text-fm-accent font-medium' : 'text-fm-text-primary'
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {modelChanged && !savingModel && (
              <button
                onClick={handleSaveModel}
                className="px-2 py-1 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors flex-shrink-0"
              >
                Save
              </button>
            )}
            {savingModel && <span className="text-xs text-fm-text-tertiary">Saving...</span>}
            {modelSaved && <span className="text-xs text-fm-success">Saved</span>}
            {modelError && <span className="text-xs text-fm-critical">{modelError}</span>}
          </>
        )}
        {modelSource && (
          <span
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border flex-shrink-0 ${
              modelSource === 'admin-override'
                ? 'bg-fm-accent/10 text-fm-accent border-fm-accent/30'
                : 'bg-fm-surface-alt text-fm-text-tertiary border-fm-border'
            }`}
            title={
              modelSource === 'admin-override'
                ? 'Set via the dashboard (overrides .env)'
                : 'From .env / seed default'
            }
          >
            {modelSource === 'admin-override' ? 'admin override' : 'from .env'}
          </span>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mt-3 text-xs px-3 py-1.5 rounded-fm-btn ${
            testResult.connected
              ? 'bg-fm-success/10 text-fm-success border border-fm-success/20'
              : 'bg-fm-critical/10 text-fm-critical border border-fm-critical/20'
          }`}
        >
          {testResult.connected
            ? `Connected${testResult.response_time_ms ? ` (${testResult.response_time_ms}ms)` : ''}${testResult.model_used ? ` — ${testResult.model_used}` : ''}${provider.state === 'active' ? ' — this is your active provider' : ' — not currently active'}`
            : (testResult.error_message ?? 'Connection failed')}
        </div>
      )}

      {provider.error_message && !testResult && (
        <p className="mt-2 text-xs text-fm-critical">{provider.error_message}</p>
      )}

      {/* API key form — cloud mode only */}
      {showKeyForm && !readonly && (
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
