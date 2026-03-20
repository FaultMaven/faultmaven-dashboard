import type { FeatureStatus } from '../types/llm';

interface FeatureStatusPanelProps {
  features: Record<string, FeatureStatus>;
  readonly: boolean;
}

const FEATURE_LABELS: Record<string, string> = {
  web_search: 'Internet Search',
  llm_tracing: 'LLM Tracing',
};

export function FeatureStatusPanel({ features, readonly }: FeatureStatusPanelProps) {
  const entries = Object.entries(features);
  if (entries.length === 0) return null;

  return (
    <div className="bg-fm-surface border border-fm-border rounded-fm-card p-4 mb-6">
      <h3 className="text-sm font-semibold text-fm-text-primary mb-3">Features</h3>
      <div className="space-y-3">
        {entries.map(([key, feature]) => (
          <div key={key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                feature.enabled ? 'bg-fm-success' : 'bg-fm-text-tertiary'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fm-text-primary">
                  {FEATURE_LABELS[key] ?? key}
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${
                    feature.enabled
                      ? 'bg-fm-success/15 text-fm-success border-fm-success/30'
                      : 'bg-fm-surface-alt text-fm-text-tertiary border-fm-border'
                  }`}
                >
                  {feature.enabled ? 'On' : 'Off'}
                </span>
              </div>
              <p className="text-xs text-fm-text-tertiary mt-0.5">{feature.description}</p>
              {!feature.enabled && (
                <p className="text-xs text-fm-text-tertiary mt-0.5 italic">
                  {readonly
                    ? feature.config_hint
                    : feature.has_api_key
                      ? 'Disabled in configuration'
                      : 'Requires an API key to enable'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
