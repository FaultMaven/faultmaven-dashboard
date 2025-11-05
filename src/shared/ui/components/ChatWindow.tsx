import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { browser } from "wxt/browser";
import DOMPurify from 'dompurify';
import {
  UploadedData,
  Source,
  SuggestedAction,
  EvidenceRequest,
  InvestigationMode,
  CaseStatus,
  InvestigationProgress,
  CommandSuggestion,
  CommandValidation,
  ScopeAssessment,
  UserCaseStatus,
  getStatusChangeMessage
} from "../../../lib/api";
import InlineSourcesRenderer from "./InlineSourcesRenderer";
import { InvestigationProgressIndicator } from "./InvestigationProgressIndicator";
import { HypothesisTracker } from "./HypothesisTracker";
import { EvidenceProgressBar } from "./EvidenceProgressBar";
import { AnomalyAlert } from "./AnomalyAlert";
import { SuggestedCommands } from "./SuggestedCommands";
import { ClarifyingQuestions } from "./ClarifyingQuestions";
import { CommandValidationDisplay } from "./CommandValidationDisplay";
import { ProblemDetectedAlert } from "./ProblemDetectedAlert";
import { ScopeAssessmentDisplay } from "./ScopeAssessmentDisplay";
import { UnifiedInputBar } from "./UnifiedInputBar";
import { EvidencePanel } from "./EvidencePanel";
import { EvidenceAnalysisModal } from "./EvidenceAnalysisModal";
import { RemoveEvidenceDialog } from "./RemoveEvidenceDialog";
import { CaseHeader } from "./CaseHeader";

// TypeScript interfaces
interface ConversationItem {
  id: string;
  question?: string;
  response?: string;
  error?: boolean;
  timestamp: string;
  responseType?: string;
  confidenceScore?: number | null;
  sources?: Source[];

  // v3.1.0 Evidence-centric fields
  evidenceRequests?: EvidenceRequest[];
  investigationMode?: InvestigationMode;
  caseStatus?: CaseStatus;

  // v3.0.0 fields (RE-ENABLED in v3.2.0)
  suggestedActions?: SuggestedAction[] | null;

  // v3.2.0 OODA Response Format fields
  clarifyingQuestions?: string[];
  suggestedCommands?: CommandSuggestion[];
  commandValidation?: CommandValidation | null;
  problemDetected?: boolean;
  problemSummary?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  scopeAssessment?: ScopeAssessment | null;

  plan?: {
    step_number: number;
    action: string;
    description: string;
    estimated_time?: string;
  } | null;
  nextActionHint?: string | null;
  requiresAction?: boolean;
  // Optimistic update metadata
  optimistic?: boolean;
  loading?: boolean;
  failed?: boolean;
  pendingOperationId?: string;
  // Error handling
  errorMessage?: string;
  onRetry?: (itemId: string) => void | Promise<void>;
}

interface UserCase {
  case_id: string;
  title: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  message_count?: number;
}

interface ChatWindowProps {
  // State passed down as props (Single Source of Truth)
  conversation: ConversationItem[];
  activeCase: UserCase | null;
  loading: boolean;
  submitting: boolean; // For input locking during message submission
  sessionId: string | null;

  // UI state
  isNewUnsavedChat?: boolean;
  className?: string;

  // OODA Framework v3.2.0
  investigationProgress?: InvestigationProgress | null;

  // Phase 3 Week 7: Evidence Management
  evidence?: UploadedData[];

  // Action callbacks only (no state management)
  onQuerySubmit: (query: string) => void;
  onDataUpload: (data: string | File, dataSource: "text" | "file" | "page") => Promise<{ success: boolean; message: string }>;
  onDocumentView?: (documentId: string) => void;
  onGenerateReports?: () => void;  // FR-CM-006: Trigger report generation for resolved cases
  onRemoveEvidence?: (dataId: string) => Promise<void>;
}

// PERFORMANCE OPTIMIZATION: Memoized component to prevent unnecessary re-renders
// Only re-renders when conversation, activeCase, loading, or other props actually change
const ChatWindowComponent = function ChatWindow({
  conversation,
  activeCase,
  loading,
  submitting,
  sessionId,
  isNewUnsavedChat = false,
  className = '',
  investigationProgress,
  evidence = [],
  onQuerySubmit,
  onDataUpload,
  onDocumentView,
  onGenerateReports,
  onRemoveEvidence
}: ChatWindowProps) {
  const MAX_QUERY_LENGTH = 4000;

  // Phase 3 Week 7: Evidence panel state
  const [evidencePanelExpanded, setEvidencePanelExpanded] = useState(true);
  const [viewingEvidence, setViewingEvidence] = useState<UploadedData | null>(null);
  const [removingEvidence, setRemovingEvidence] = useState<UploadedData | null>(null);
  const [isRemovingEvidence, setIsRemovingEvidence] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);

  /**
   * Handle status change request from CaseHeader dropdown
   * Implements Option A: Send as regular query to agent (FRONTEND_STATUS_CHANGE_CONFIRMATION_FLOW.md)
   */
  const handleStatusChangeRequest = useCallback((newStatus: UserCaseStatus) => {
    if (!activeCase) return;

    // Get the predefined message for this transition
    const message = getStatusChangeMessage(activeCase.status, newStatus);

    if (!message) {
      console.error('[ChatWindow] Invalid status transition:', activeCase.status, '→', newStatus);
      return;
    }

    console.log('[ChatWindow] Status change request:', { from: activeCase.status, to: newStatus, message });

    // Send as regular query - agent will respond with confirmation prompt
    onQuerySubmit(message);
  }, [activeCase, onQuerySubmit]);

  // UI-only state (no data management)
  const [queryInput, setQueryInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [pageContent, setPageContent] = useState<string>("");
  const [fileSelected, setFileSelected] = useState(false);
  const [injectionStatus, setInjectionStatus] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: "", type: "" });
  const [showDataSection, setShowDataSection] = useState(true);
  const [dataSource, setDataSource] = useState<"text" | "file" | "page">("text");

  // UI refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationHistoryRef = useRef<HTMLDivElement>(null);

  // Enable inputs only when an active case exists or we are in an ephemeral new chat
  const canInteract = Boolean(activeCase) || Boolean(isNewUnsavedChat);

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    if (conversationHistoryRef.current) {
      conversationHistoryRef.current.scrollTop = conversationHistoryRef.current.scrollHeight;
    }
  }, [conversation]);

  const getPageContent = async () => {
    try {
      setInjectionStatus({ message: "🔄 Analyzing page content...", type: "" });
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (!tab.id) {
        throw new Error("No active tab found");
      }

      // Check if tab URL is valid for content script injection
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:') || tab.url.startsWith('edge://') || tab.url.startsWith('brave://'))) {
        throw new Error("Cannot analyze browser internal pages (chrome://, about:, etc.)");
      }

      try {
        // Try sending message to existing content script
        const response = await browser.tabs.sendMessage(tab.id, { action: "getPageContent" });

        if (response && response.content) {
          setPageContent(response.content);
          setInjectionStatus({ message: "✅ Page content captured successfully!", type: "success" });
          return;
        }
      } catch (messageError: any) {
        // If content script doesn't exist, try programmatic injection as fallback
        console.log("[ChatWindow] Content script not responding, attempting programmatic injection...");

        try {
          // Get the result from the injection (single call)
          const [result] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.documentElement.outerHTML
          });

          if (result && result.result) {
            setPageContent(result.result);
            setInjectionStatus({ message: "✅ Page content captured successfully!", type: "success" });
            return;
          }
        } catch (injectionError: any) {
          console.error("[ChatWindow] Programmatic injection failed:", injectionError);

          // Check if it's a permission error
          const errorMsg = injectionError.message || "";
          if (errorMsg.includes("Cannot access contents") || errorMsg.includes("manifest must request permission")) {
            throw new Error("Cannot analyze this page. Please refresh the page first, then try again");
          }

          throw new Error(`Cannot inject script: ${injectionError.message}`);
        }
      }

      throw new Error("Failed to capture page content");
    } catch (err: any) {
      console.error("[ChatWindow] getPageContent error:", err);
      const errorMsg = err.message || "Unknown error occurred";
      setInjectionStatus({
        message: `⚠️ ${errorMsg}. Please try refreshing the page.`,
        type: "error"
      });
    }
  };

  // Phase 1 Week 2: Handler for page injection from UnifiedInputBar (Step 1 only - capture)
  const handlePageInject = async (): Promise<string> => {
    // Capture the page content and return it to UnifiedInputBar
    await getPageContent();
    // Return the captured content so UnifiedInputBar can send it on Submit
    return pageContent;
  };

  // Phase 3 Week 7: Evidence panel handlers
  const handleViewAnalysis = (item: UploadedData) => {
    setViewingEvidence(item);
  };

  const handleRemoveEvidence = (item: UploadedData) => {
    setRemovingEvidence(item);
  };

  const handleConfirmRemove = async () => {
    if (!removingEvidence || !onRemoveEvidence) return;

    setIsRemovingEvidence(true);
    setRemovalError(null); // Clear previous errors

    try {
      await onRemoveEvidence(removingEvidence.data_id);
      setRemovingEvidence(null); // Success - close dialog
    } catch (error) {
      console.error('[ChatWindow] Evidence removal failed:', error);

      // Parse error and create user-friendly message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('404')) {
        setRemovalError('This evidence no longer exists on the server. It may have already been deleted. Please refresh the page to see the current state.');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        setRemovalError('Unable to connect to the server. Please check your internet connection and try again.');
      } else {
        setRemovalError(`Failed to remove evidence: ${errorMessage}. Please try again or contact support if the issue persists.`);
      }
    } finally {
      setIsRemovingEvidence(false);
    }
  };

  const handleDownloadEvidence = (item: UploadedData) => {
    // For files, trigger browser download
    if (item.file_name) {
      // Note: This would need backend support to serve the file
      // For now, just log - backend doesn't have download endpoint yet
      console.log('[ChatWindow] Download requested for:', item.file_name);
      // TODO: Implement when backend adds GET /api/v1/data/{data_id}/download endpoint
    }
  };

  const handleSubmitQuery = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canInteract) {
        setInjectionStatus({ message: "Start a new chat to begin.", type: "" });
        return;
      }
      const trimmed = queryInput.trim();
      if (trimmed.length > MAX_QUERY_LENGTH) {
        setInjectionStatus({ message: `❌  Query too long (${trimmed.length}/${MAX_QUERY_LENGTH}). Please shorten it.`, type: "error" });
        return;
      }
      if (trimmed && !loading && !submitting) {
        onQuerySubmit(trimmed);
        setQueryInput("");
      }
    }
  };

  const handleDataSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value as "text" | "file" | "page";
    setDataSource(value);
    setInjectionStatus({ message: "", type: "" });
    setTextInput("");
    setFileSelected(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPageContent("");
  };

  const handleDataSubmit = async () => {
    let dataToSend: string | File | null = null;
    if (dataSource === "text") dataToSend = textInput.trim();
    else if (dataSource === "file" && fileInputRef.current?.files?.[0]) dataToSend = fileInputRef.current.files[0];
    else if (dataSource === "page") dataToSend = pageContent;

    if (!dataToSend) {
      setInjectionStatus({ message: "❌  No data to submit", type: "error" });
      return;
    }

    // Show uploading status
    setInjectionStatus({ message: "🔄 Uploading data...", type: "" });

    // Call upload handler and wait for result
    const result = await onDataUpload(dataToSend, dataSource);

    // Show result to user
    setInjectionStatus({
      message: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
      type: result.success ? "success" : "error"
    });

    // Clear inputs only on success
    if (result.success) {
      if (dataSource === "text") setTextInput("");
      else if (dataSource === "file") {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setFileSelected(false);
      }
      else if (dataSource === "page") setPageContent("");
    }
  };

  const isSubmitEnabled =
    !loading &&
    ((dataSource === "text" && textInput.trim()) ||
    (dataSource === "file" && fileSelected) ||
    (dataSource === "page" && !!pageContent.trim()));

  return (
    <div className={`flex flex-col h-full space-y-1 overflow-y-auto ${className}`}>
      {/* Phase 3 Week 7: Case Header + Status Dropdown */}
      <CaseHeader
        activeCase={activeCase}
        evidenceCount={evidence.length}
        evidencePanelExpanded={evidencePanelExpanded}
        onToggleEvidence={() => setEvidencePanelExpanded(!evidencePanelExpanded)}
        onStatusChangeRequest={handleStatusChangeRequest}
      />

      {/* OODA Investigation Progress (v3.2.0) */}
      {investigationProgress && (
        <div className="ooda-investigation-panel px-2 py-1">
          <InvestigationProgressIndicator progress={investigationProgress} />

          <HypothesisTracker hypotheses={investigationProgress.hypotheses} />

          <EvidenceProgressBar
            collected={investigationProgress.evidence_collected}
            requested={investigationProgress.evidence_requested}
          />

          {investigationProgress.anomaly_frame && (
            <AnomalyAlert anomaly={investigationProgress.anomaly_frame} />
          )}
        </div>
      )}

      {/* Phase 3 Week 7: Evidence Panel */}
      {evidence && evidence.length > 0 && (
        <EvidencePanel
          evidence={evidence}
          isExpanded={evidencePanelExpanded}
          onToggleExpand={() => setEvidencePanelExpanded(!evidencePanelExpanded)}
          onViewAnalysis={handleViewAnalysis}
          onRemove={handleRemoveEvidence}
          onDownload={handleDownloadEvidence}
        />
      )}

      {/* Report Generation Button for Resolved Cases (FR-CM-006) */}
      {activeCase && activeCase.status === 'resolved' && onGenerateReports && (
        <div className="px-2 py-2 bg-green-50 border border-green-200 rounded-lg mx-2">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">✅ Case Resolved</p>
              <p className="text-xs text-green-700">Generate documentation reports for this case</p>
            </div>
            <button
              onClick={onGenerateReports}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              📄 Generate Reports
            </button>
          </div>
        </div>
      )}

      {/* Conversation History */}
      <div id="conversation-history" ref={conversationHistoryRef} className="flex-grow overflow-y-auto bg-white border border-gray-300 rounded-lg p-2 min-h-0">
        {Array.isArray(conversation) && conversation.map((item) => (
          <React.Fragment key={item.id}>
            {item.question && (
              <div className="flex justify-end mb-1">
                <div className={`w-full mx-1 px-2 py-1 text-sm text-gray-900 rounded relative ${
                  item.optimistic ? 'bg-blue-50 border border-blue-200' : 'bg-gray-100'
                }`}>
                  <p className="break-words m-0">{item.question}</p>
                  <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                    <span>{item.timestamp}</span>
                    {item.failed && (
                      <span className="text-red-600 flex items-center gap-1" title="Failed to process">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Failed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {(item.response || (item.optimistic && item.loading)) && (
              <div className="flex justify-end mb-2">
                <div className={`w-full mx-1 ${item.error || item.failed ? "text-red-700" : "text-gray-800"}`}>
                  <div className={`px-2 py-1 text-sm border-t border-b rounded ${
                    item.failed ? 'border-red-200 bg-red-50/30' :
                    item.optimistic ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                  }`}>
                    {/* Error banner for failed messages */}
                    {item.failed && item.errorMessage && (
                      <div className="mb-2 p-2 bg-red-100 border border-red-300 rounded text-xs">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-red-800 font-medium">Message could not be sent</p>
                            <p className="text-red-700 mt-0.5">{item.errorMessage}</p>
                          </div>
                        </div>
                        {item.onRetry && (
                          <button
                            onClick={() => item.onRetry?.(item.id)}
                            className="mt-2 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}

                    <InlineSourcesRenderer
                      content={item.response || ''}
                      sources={item.sources}
                      evidenceRequests={item.evidenceRequests}
                      onDocumentView={onDocumentView}
                      className="break-words"
                    />

                    {/* OODA v3.2.0 Response Format Components */}
                    {item.problemDetected && item.problemSummary && item.severity && (
                      <ProblemDetectedAlert
                        problemSummary={item.problemSummary}
                        severity={item.severity}
                      />
                    )}

                    {item.scopeAssessment && (
                      <ScopeAssessmentDisplay assessment={item.scopeAssessment} />
                    )}

                    {item.clarifyingQuestions && item.clarifyingQuestions.length > 0 && (
                      <ClarifyingQuestions
                        questions={item.clarifyingQuestions}
                        onQuestionClick={(question) => {
                          if (canInteract && !loading && !submitting) {
                            onQuerySubmit(question);
                          }
                        }}
                      />
                    )}

                    {item.suggestedCommands && item.suggestedCommands.length > 0 && (
                      <SuggestedCommands
                        commands={item.suggestedCommands}
                        onCommandClick={(command) => {
                          navigator.clipboard.writeText(command);
                          setInjectionStatus({ message: "✅ Command copied to clipboard!", type: "success" });
                        }}
                      />
                    )}

                    {item.commandValidation && (
                      <CommandValidationDisplay validation={item.commandValidation} />
                    )}

                    <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{item.timestamp}</span>
                        {/* Removed "Thinking..." spinner - processing indicator is shown in input area */}
                        {item.failed && (
                          <span className="text-red-600 flex items-center gap-1" title={item.errorMessage || "Failed to process"}>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            Failed
                          </span>
                        )}
                      </div>
                      {item.requiresAction && (
                        <span className="text-orange-600 text-xs font-medium">⚠️ Action Required</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
        {(!Array.isArray(conversation) || conversation.length === 0) && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <h2 className="text-base font-semibold text-gray-800 mb-2">
              Welcome to FaultMaven Copilot!
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Your AI troubleshooting partner.
            </p>
            <p className="text-sm text-gray-500 bg-gray-100 p-3 rounded-md max-w-sm">
              To get started, provide context using the options below or ask a question directly, like <em>"What's the runbook for a database failover?"</em>
            </p>
          </div>
        )}
      </div>

      {/* Phase 1 Week 2: Unified Input Bar replaces separate Ask/Provide sections */}
      <UnifiedInputBar
        disabled={!canInteract}
        loading={loading}
        submitting={submitting}
        onQuerySubmit={onQuerySubmit}
        onDataUpload={onDataUpload}
        onPageInject={handlePageInject}
        maxLength={MAX_QUERY_LENGTH}
      />

      {/* Phase 3 Week 7: Evidence modals */}
      <EvidenceAnalysisModal
        evidence={viewingEvidence}
        isOpen={viewingEvidence !== null}
        onClose={() => setViewingEvidence(null)}
      />

      <RemoveEvidenceDialog
        evidence={removingEvidence}
        isOpen={removingEvidence !== null}
        onConfirm={handleConfirmRemove}
        onCancel={() => {
          setRemovingEvidence(null);
          setRemovalError(null); // Clear error on cancel
        }}
        isRemoving={isRemovingEvidence}
        errorMessage={removalError}
      />
    </div>
  );
};

// Export memoized component with custom comparison
// Re-renders only when these props change significantly
export const ChatWindow = memo(ChatWindowComponent, (prevProps, nextProps) => {
  // Custom comparison to avoid unnecessary re-renders
  return (
    prevProps.conversation === nextProps.conversation &&
    prevProps.activeCase?.case_id === nextProps.activeCase?.case_id &&
    prevProps.loading === nextProps.loading &&
    prevProps.submitting === nextProps.submitting &&
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.isNewUnsavedChat === nextProps.isNewUnsavedChat
  );
});

// Default export for backward compatibility
export default ChatWindow;