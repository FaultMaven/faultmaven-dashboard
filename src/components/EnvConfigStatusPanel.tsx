import type { EnvConfigStatus } from '../types/llm';

interface EnvConfigStatusPanelProps {
  status: EnvConfigStatus;
}

interface StatusRowProps {
  label: string;
  value: string;
}

function StatusRow({ label, value }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-fm-border last:border-0">
      <span className="text-sm text-fm-text-secondary">{label}</span>
      <span className="text-sm font-medium text-fm-text-primary font-mono">{value}</span>
    </div>
  );
}

export function EnvConfigStatusPanel({ status }: EnvConfigStatusPanelProps) {
  return (
    <div className="bg-fm-surface border border-fm-border rounded-fm-card p-4">
      <h3 className="text-sm font-semibold text-fm-text-primary mb-3">Environment Configuration</h3>
      <div>
        <StatusRow label="Auth Mode" value={status.auth_mode} />
        <StatusRow label="Environment" value={status.environment} />
        <StatusRow label="Database" value={status.db_backend} />
        <StatusRow label="Sessions" value={status.session_storage} />
        <StatusRow label="Vectors" value={status.vector_storage} />
        <StatusRow label="LLM Provider" value={status.llm_provider} />
        <StatusRow label="PII Redaction" value={status.pii_redaction_enabled ? 'enabled' : 'disabled'} />
        <StatusRow label="Rate Limiting" value={status.rate_limit_enabled ? 'enabled' : 'disabled'} />
      </div>
    </div>
  );
}
