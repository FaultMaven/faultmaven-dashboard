import { useState, useEffect } from 'react';
import type { CaseDetail } from '../types/cases';
import {
  generateCaseRunbook,
  getCaseRunbookDraft,
  updateDraft,
  verifyDraft,
} from '../lib/knowledge/conversion';
import type { ConversionResponse, ConversionDraft } from '../lib/knowledge/conversion';
import { DraftEditor } from './DraftEditor';

interface RunbookTabProps {
  caseId: string;
  caseDetail: CaseDetail;
}

export function RunbookTab({ caseId, caseDetail }: RunbookTabProps) {
  const [conversion, setConversion] = useState<ConversionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    loadExistingDraft();
  }, [caseId]);

  async function loadExistingDraft() {
    setLoading(true);
    setError(null);
    try {
      const result = await getCaseRunbookDraft(caseId);
      setConversion(result);
      if (result?.drafts.some((d) => d.status === 'verified')) {
        setVerified(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runbook draft');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateCaseRunbook(caseId);
      setConversion(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Runbook generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(content: string): Promise<ConversionDraft | null> {
    if (!conversion || !draft) return null;
    setSaving(true);
    try {
      const updated = await updateDraft(conversion.conversion_id, draft.draft_id, content);
      // Update local state
      setConversion({
        ...conversion,
        drafts: conversion.drafts.map((d) =>
          d.draft_id === draft.draft_id ? updated : d,
        ),
      });
      return updated;
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    if (!conversion || !draft) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyDraft(conversion.conversion_id, draft.draft_id);
      setVerified(true);
      await loadExistingDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  // Get the first non-deleted draft
  const draft = conversion?.drafts.find((d) => d.status !== 'deleted') ?? null;

  if (loading) {
    return <div className="text-fm-text-tertiary text-sm py-4">Loading runbook...</div>;
  }

  // State: No draft exists — show generate button
  if (!conversion || !draft) {
    return (
      <div className="py-6 text-center">
        <div className="mb-4">
          <p className="text-sm text-fm-text-secondary mb-1">
            Generate a reusable troubleshooting runbook from this case's investigation data.
          </p>
          <p className="text-xs text-fm-text-tertiary">
            The runbook will use the canonical template and enter the draft review workflow.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-fm-accent text-white text-sm font-medium rounded-fm-card hover:bg-fm-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? 'Generating...' : 'Generate Runbook'}
        </button>
        {error && (
          <p className="mt-3 text-sm text-fm-critical">{error}</p>
        )}
      </div>
    );
  }

  // State: Draft is verified — show read-only content
  if (draft.status === 'verified') {
    return (
      <div className="py-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-fm-text-primary">{draft.title}</h3>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-fm-success/10 text-fm-success border border-fm-success/20">
              Verified
            </span>
          </div>
        </div>
        <div className="bg-fm-surface border border-fm-border rounded-fm-card p-4">
          <pre className="text-xs text-fm-text-primary whitespace-pre-wrap font-mono">
            {draft.content || draft.content_preview}
          </pre>
        </div>
      </div>
    );
  }

  // State: Draft exists — show editor
  return (
    <div className="py-2">
      {error && (
        <div className="mb-4 p-3 bg-fm-critical/10 border border-fm-critical/20 rounded-fm-card text-sm text-fm-critical">
          {error}
        </div>
      )}
      <DraftEditor
        draft={draft}
        onSave={handleSave}
        onVerify={handleVerify}
        onCancel={() => {}}
        saving={saving || verifying}
      />
    </div>
  );
}
