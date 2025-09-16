// src/shared/ui/SidePanelApp.tsx
import React, { useState, useEffect } from "react";
import { browser } from "wxt/browser";
import { 
  heartbeatSession, 
  getKnowledgeDocument,
  devLogin,
  verifyAuthSession,
  logoutAuth,
  AuthResponse,
  UserCase
} from "../../lib/api";
import KnowledgeBaseView from "./KnowledgeBaseView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ConversationsList from "./components/ConversationsList";
import { ChatWindow } from "./components/ChatWindow";
import DocumentDetailsModal from "./components/DocumentDetailsModal";

// TypeScript interfaces for better type safety
interface StorageResult {
  sessionId?: string;
  sessionCreatedAt?: number;
  sessionResumed?: boolean;
  clientId?: string;
}


export default function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<'copilot' | 'kb'>('copilot');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationTitles, setConversationTitles] = useState<Record<string, string>>({});
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(undefined);
  const [showConversationsList, setShowConversationsList] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasUnsavedNewChat, setHasUnsavedNewChat] = useState(false);
  const [refreshSessions, setRefreshSessions] = useState(0);
  const [pendingCases, setPendingCases] = useState<Record<string, UserCase>>({});
  
  // Document viewing state
  const [viewingDocument, setViewingDocument] = useState<any | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    const initializeSession = async () => {
      try {
        // Check for existing stored session and verify auth
        try {
          const stored = await browser.storage.local.get(["sessionId", "sessionResumed", "sessionCreatedAt"]);
          if (stored?.sessionId) {
            try {
              const auth: AuthResponse = await verifyAuthSession(stored.sessionId);
              // Verified session
              setIsAuthenticated(true);
              setSessionId(auth.view_state?.session_id || stored.sessionId);

              console.log('[SidePanelApp] Session initialized:', {
                sessionId: stored.sessionId?.slice(0, 8) + '...',
                resumed: stored.sessionResumed || false
              });
            } catch {
              // Invalid/expired session, clear and require login
              await browser.storage.local.remove(["sessionId", "sessionCreatedAt", "sessionResumed", "clientId"]);
              setIsAuthenticated(false);
              setSessionId(null);
              setHasUnsavedNewChat(false); // keep input locked until user clicks New Chat
              return;
            }
          } else {
            // No stored session, require login
            setIsAuthenticated(false);
            setSessionId(null);
            setHasUnsavedNewChat(false); // keep input locked until user clicks New Chat
            return;
          }
        } catch {
          setIsAuthenticated(false);
          setSessionId(null);
          setHasUnsavedNewChat(false); // keep input locked until user clicks New Chat
          return;
        }

        // Do not auto-load sessions list; UI is case-driven
        setServerError(null);
      } catch (err) {
        setServerError("Unable to connect to FaultMaven server. Please check your connection and try again.");
        setSessionId(null);
        setHasUnsavedNewChat(false);
      }
    };
    
    initializeSession();
    
    // Cleanup interval on unmount
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, []);

  // Handle responsive design
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 600) {
        setSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = async () => {
    setAuthError(null);
    if (!loginEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail)) {
      setAuthError("Enter a valid email");
      return;
    }
    setLoggingIn(true);
    try {
      const auth = await devLogin(loginEmail.trim());
      const sid = auth.view_state?.session_id;
      if (sid) {
        await browser.storage.local.set({ sessionId: sid, sessionCreatedAt: Date.now() });
        setIsAuthenticated(true);
        setSessionId(sid);
        setHasUnsavedNewChat(false);
        setRefreshSessions(prev => prev + 1);
      } else {
        setAuthError("Login response missing session_id");
      }
    } catch (e: any) {
      setAuthError(e?.message || "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try { await logoutAuth(); } catch {}
    await browser.storage.local.remove(["sessionId", "sessionCreatedAt", "sessionResumed", "clientId"]);
    setIsAuthenticated(false);
    setSessionId(null);
    setHasUnsavedNewChat(true);
  };

  const handleSessionSelect = (selectedSessionId: string) => {
    if (selectedSessionId && typeof selectedSessionId === 'string') {
      setSessionId(selectedSessionId);
      setHasUnsavedNewChat(false);
      // Update storage to remember the last active session
      browser.storage.local.set({ sessionId: selectedSessionId }).catch(() => {});
    }
  };

  const handleCaseSelect = (caseId: string) => {
    setActiveCaseId(caseId);
    // Selecting an existing chat should dismiss the ephemeral "New Chat" entry
    setHasUnsavedNewChat(false);
  };

  const handleNewSession = (newChatId: string) => {
    if (typeof newChatId === 'string') {
      if (newChatId === '') {
        // Prepare for a brand new chat
        setActiveCaseId(undefined);
        setSessionId(null);
        setHasUnsavedNewChat(true);
      } else {
        setSessionId(newChatId);
        setHasUnsavedNewChat(false);
        browser.storage.local.set({ sessionId: newChatId }).catch(() => {});
      }
    }
  };

  const handleChatSaved = () => {
    // Do not re-enable ephemeral state; keep active chat focused
    setHasUnsavedNewChat(false);
  };

  const handleSessionCreated = (newSessionId: string) => {
    setSessionId(newSessionId);
    browser.storage.local.set({ sessionId: newSessionId }).catch(() => {});
    setRefreshSessions(prev => prev + 1);
  };

  const handleTitleGenerated = (sid: string, title: string) => {
    setConversationTitles(prev => ({ ...prev, [sid]: title }));
  };

  const handleCaseTitleGenerated = (cid: string, title: string) => {
    setConversationTitles(prev => ({ ...prev, [cid]: title }));
  };
  
  const handleAfterDelete = (deletedCaseId: string, remaining: Array<{ case_id: string; updated_at?: string; created_at?: string }>) => {
    if (remaining && remaining.length > 0) {
      const sorted = [...remaining].sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
      setActiveCaseId(sorted[0].case_id);
      setHasUnsavedNewChat(false);
    } else {
      setActiveCaseId(undefined);
      setHasUnsavedNewChat(false); // keep locked until user clicks New Chat
    }
    setRefreshSessions(prev => prev + 1);
  };

  const handleCaseActivated = (caseId: string) => {
    setActiveCaseId(caseId);
    // Transition from Draft → Committed-pending: hide ephemeral and keep a local pending entry visible
    setHasUnsavedNewChat(false);
    setPendingCases(prev => {
      if (prev[caseId]) return prev;
      const now = new Date().toISOString();
      return {
        ...prev,
        [caseId]: {
          case_id: caseId,
          title: conversationTitles[caseId] || 'New Chat',
          status: 'active',
          created_at: now,
          updated_at: now,
          message_count: 0
        }
      };
    });
  };

  const handleCaseCommitted = (caseId: string) => {
    // Remove pending overlay once server reports messages / persistence
    setPendingCases(prev => {
      if (!prev[caseId]) return prev;
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
    setHasUnsavedNewChat(false);
    setRefreshSessions(prev => prev + 1);
  };

  const toggleConversationsList = () => {
    setShowConversationsList(!showConversationsList);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const retryConnection = async () => {
    setServerError(null);
    // Do not fetch sessions; keep case-driven flow
  };

  // Handle document viewing from sources
  const handleDocumentView = async (documentId: string) => {
    try {
      const document = await getKnowledgeDocument(documentId);
      setViewingDocument(document);
      setIsDocumentModalOpen(true);
      setActiveTab('kb');
    } catch {
      // noop
    }
  };

  // Login screen
  const renderLogin = () => (
    <div className="flex items-center justify-center h-full">
      <div className="bg-white border border-gray-200 rounded-lg p-6 w-full max-w-sm shadow-sm">
        <div className="text-center mb-4">
          <img src="/icon/square-light.svg" alt="FaultMaven" className="w-12 h-12 mx-auto mb-2" />
          <h2 className="text-base font-semibold text-gray-800">Sign in (Dev)</h2>
          <p className="text-xs text-gray-500">Use your email to start a session</p>
        </div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder="developer@example.com"
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loggingIn}
        />
        {authError && (
          <div className="text-xs text-red-600 mt-2">{authError}</div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={handleLogin}
            disabled={loggingIn || !loginEmail}
            className="px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            onClick={() => setLoginEmail('developer@example.com')}
            disabled={loggingIn}
            className="text-xs text-gray-600 hover:text-gray-800"
          >
            Fill example
          </button>
        </div>
      </div>
    </div>
  );

  // Auth gate
  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <div className="flex h-screen bg-gray-50 text-gray-800 text-sm font-sans">
          {renderLogin()}
        </div>
      </ErrorBoundary>
    );
  }

  // Render the collapsible sidebar
  const renderSidebar = () => {
    if (activeTab !== 'copilot') return null;

    return (
      <div className={`flex-shrink-0 bg-white border-r border-gray-200 transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-80 max-w-80'
      }`}>
        {sidebarCollapsed ? (
          <div className="flex flex-col h-full">
            <div className="flex-shrink-0 p-4 border-b border-gray-200">
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex-1 p-3 space-y-3">
              <button
                onClick={() => handleNewSession('')}
                disabled={hasUnsavedNewChat}
                className="w-full h-10 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                title="New Chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={toggleSidebar}
                className="w-full h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Expand Sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex-shrink-0 p-3 border-t border-gray-200">
              <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-shrink-0 p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h1 className="text-lg font-semibold text-gray-900">FaultMaven</h1>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                  <button
                    onClick={toggleSidebar}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Collapse Sidebar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              </div>

            </div>
            <div className="flex-shrink-0 p-4">
              <button
                onClick={() => handleNewSession('')}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasUnsavedNewChat ? "Complete current new chat before starting another" : "Start new conversation"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">New chat</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ErrorBoundary
                fallback={
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg m-4">
                    <p className="text-sm text-red-700">Error loading conversations</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Retry
                    </button>
                  </div>
                }
              >
                <ConversationsList
                  activeSessionId={sessionId || undefined}
                  activeCaseId={activeCaseId}
                  onCaseSelect={handleCaseSelect}
                  onNewSession={handleNewSession}
                  conversationTitles={conversationTitles}
                  hasUnsavedNewChat={hasUnsavedNewChat}
                  refreshTrigger={refreshSessions}
                  className="h-full"
                  collapsed={false}
                  onFirstCaseDetected={() => setHasUnsavedNewChat(false)}
                  onAfterDelete={handleAfterDelete}
                  pendingCases={Object.values(pendingCases)}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderChatContent = () => {
    // Always render ChatWindow only when a case is active or we are in explicit new chat flow
    if (!activeCaseId && !hasUnsavedNewChat) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-2">Start a conversation</h2>
            <p className="text-sm text-gray-600 mb-4">Select a chat from the list or create a new one.</p>
            <button
              onClick={() => handleNewSession('')}
              className="inline-flex items-center gap-2 py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              New chat
            </button>
          </div>
        </div>
      );
    }

    return (
      <ErrorBoundary
        fallback={
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">Error loading chat</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        }
      >
        <ChatWindow
          sessionId={sessionId}
          caseId={activeCaseId}
          onTitleGenerated={handleTitleGenerated}
          onCaseTitleGenerated={handleCaseTitleGenerated}
          onCasesNeedsRefresh={() => setRefreshSessions(prev => prev + 1)}
          onChatSaved={handleChatSaved}
          onSessionCreated={handleSessionCreated}
          onDocumentView={handleDocumentView}
          isNewUnsavedChat={hasUnsavedNewChat}
          onCaseActivated={handleCaseActivated}
          onCaseCommitted={handleCaseCommitted}
          className="h-full"
        />
      </ErrorBoundary>
    );
  };

  const renderMainContent = () => {
    return (
      <div className="flex w-full h-full">
        {renderSidebar()}
        <div className="flex-1 flex flex-col min-w-0 max-w-none">
          <div className="flex bg-white border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setActiveTab('copilot')}
              className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'copilot'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Copilot
            </button>
            <button
              onClick={() => setActiveTab('kb')}
              className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'kb'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Knowledge Base
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className={`h-full ${activeTab === 'copilot' ? 'block' : 'hidden'}`}>
              {renderChatContent()}
            </div>
            <div className={`h-full ${activeTab === 'kb' ? 'block' : 'hidden'}`}>
              <ErrorBoundary
                fallback={
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">Error loading Knowledge Base</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Retry
                    </button>
                  </div>
                }
              >
                <KnowledgeBaseView className="h-full" />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-50 text-gray-800 text-sm font-sans">
        {renderMainContent()}
      </div>
      <DocumentDetailsModal
        document={viewingDocument}
        isOpen={isDocumentModalOpen}
        onClose={() => {
          setIsDocumentModalOpen(false);
          setViewingDocument(null);
        }}
        onEdit={(doc) => {
          setIsDocumentModalOpen(false);
          setViewingDocument(null);
        }}
      />
    </ErrorBoundary>
  );
}
