import React, { useState, useRef, useEffect } from "react";
import { browser } from "wxt/browser";
import DOMPurify from 'dompurify';
import { 
  uploadData, 
  QueryRequest, 
  AgentResponse,
  ResponseType,
  UploadedData,
  getSessionData,
  createSession,
  Source,
  createCase,
  submitQueryToCase,
  uploadDataToCase,
  listSessionCases,
  UserCase,
  updateCaseTitle,
  getCaseConversation
} from "../../../lib/api";
import { formatResponseForDisplay, requiresUserAction } from "../../../lib/utils/response-handlers";
import { heartbeatSession } from "../../../lib/api";
import config from "../../../config";
import LoadingSpinner from "./LoadingSpinner";
import SourcesDisplay from "./SourcesDisplay";
import MarkdownRenderer from "./MarkdownRenderer";
import InlineSourcesRenderer from "./InlineSourcesRenderer";

// TypeScript interfaces
interface ConversationItem {
  id: string; // Unique identifier for React keys
  question?: string;
  response?: string;
  error?: boolean;
  timestamp: string;
  responseType?: ResponseType;
  confidenceScore?: number;
  sources?: Source[];
  plan?: {
    step_number: number;
    action: string;
    description: string;
    estimated_time?: string;
  };
  nextActionHint?: string;
  requiresAction?: boolean;
}

interface ChatWindowProps {
  sessionId: string | null; // Allow null when no session exists yet
  caseId?: string; // Optional active case provided by sidebar
  onTitleGenerated?: (sessionId: string, title: string) => void;
  onCaseTitleGenerated?: (caseId: string, title: string) => void;
  onCasesNeedsRefresh?: () => void;
  onChatSaved?: () => void;
  onSessionCreated?: (sessionId: string) => void; // Callback when session is created
  onDocumentView?: (documentId: string) => void; // Callback for viewing documents from sources
  isNewUnsavedChat?: boolean;
  className?: string;
  onCaseActivated?: (caseId: string) => void;
  onCaseCommitted?: (caseId: string) => void;
}

export function ChatWindow({ sessionId, caseId, onTitleGenerated, onCaseTitleGenerated, onCasesNeedsRefresh, onChatSaved, onSessionCreated, onDocumentView, isNewUnsavedChat = false, className = '', onCaseActivated, onCaseCommitted }: ChatWindowProps) {
  const MAX_QUERY_LENGTH = 4000;
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [conversationCache, setConversationCache] = useState<Record<string, ConversationItem[]>>({});
  const [queryInput, setQueryInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [pageContent, setPageContent] = useState<string>("");
  const [fileSelected, setFileSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [injectionStatus, setInjectionStatus] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: "", type: "" });
  const [showDataSection, setShowDataSection] = useState(true);
  const [dataSource, setDataSource] = useState<"text" | "file" | "page">("text");
  const [sessionData, setSessionData] = useState<UploadedData[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [messageCountCache, setMessageCountCache] = useState<Record<string, number>>({});
  const [titleGenerated, setTitleGenerated] = useState<Record<string, boolean>>({});
  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeCase, setActiveCase] = useState<UserCase | null>(null);
  const currentCaseIdRef = useRef<string | null>(caseId ?? null);
  const [sessionCases, setSessionCases] = useState<UserCase[]>([]);
  const [creatingCase, setCreatingCase] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(isNewUnsavedChat ? `${Date.now()}-${Math.random().toString(36).slice(2,8)}` : null);
  // Enable inputs only when an active case exists or we are in an ephemeral new chat
  const canInteract = Boolean(activeCase) || Boolean(isNewUnsavedChat);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationHistoryRef = useRef<HTMLDivElement>(null);
  const prevUnsavedRef = useRef<boolean>(isNewUnsavedChat);
  const lastCreatedCaseIdRef = useRef<string | null>(null);
  const isSendingRef = useRef<boolean>(false);

  // Track previous caseId for case-scoped caching
  const [previousCaseId, setPreviousCaseId] = useState<string | null>(null);
  const getCacheKey = (sid: string | null, cid?: string | null) => (cid ? `case:${cid}` : draftId ? `draft:${draftId}` : 'draft');

  // Ensure a unique draftId exists whenever we are in a new unsaved chat
  useEffect(() => {
    if (isNewUnsavedChat && !prevUnsavedRef.current) {
      setDraftId(`${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      // Clear any previous conversation so a blank window is shown
      setConversation([]);
      setMessageCount(0);
      setActiveCase(null);
      lastCreatedCaseIdRef.current = null;
      currentCaseIdRef.current = null; // ensure new messages do not append to a prior case
    }
    prevUnsavedRef.current = isNewUnsavedChat;
  }, [isNewUnsavedChat]);

  // Restore when caseId or activeCase changes (primary cache key is case-based; fall back to draft)
  useEffect(() => {
    const selectedCid = isNewUnsavedChat ? null : (activeCase?.case_id || caseId || null);
    if (selectedCid) currentCaseIdRef.current = selectedCid;
    const key = getCacheKey(sessionId, selectedCid);
    if (previousCaseId && previousCaseId !== (caseId || activeCase?.case_id || null)) {
      const prevKey = getCacheKey(sessionId, previousCaseId);
      if (conversation.length > 0) {
        setConversationCache(prev => ({ ...prev, [prevKey]: conversation }));
        setMessageCountCache(prev => ({ ...prev, [prevKey]: messageCount }));
      }
    }
    const cached = conversationCache[key] || [];
    const cachedCount = messageCountCache[key] || 0;
    setConversation(cached);
    setMessageCount(cachedCount);
    if (!isNewUnsavedChat && caseId) setPreviousCaseId(caseId);
  }, [caseId, activeCase?.case_id]);

  // Load session data when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSessionData(sessionId);
    } else {
      setSessionData([]);
    }
  }, [sessionId]);

  // Respect externally selected case from sidebar
  useEffect(() => {
    if (caseId) {
      const found = sessionCases.find(c => c.case_id === caseId);
      setActiveCase(found || { case_id: caseId, title: '', status: 'active' } as any);
      // Selecting an existing case should not reuse a prior newly-created case id
      lastCreatedCaseIdRef.current = null;
      currentCaseIdRef.current = caseId;
      // Load conversation from backend (always fetch to ensure persistence)
      const key = getCacheKey(sessionId, caseId);
      (async () => {
        try {
          const convo = await getCaseConversation(caseId);
          const items: ConversationItem[] = parseConversation(convo);
          setConversationCache(prev => ({ ...prev, [key]: items }));
          setMessageCountCache(prev => ({ ...prev, [key]: items.length }));
          setConversation(items);
          setMessageCount(items.length);
          if (items.length > 0 && onCaseCommitted) { try { onCaseCommitted(caseId); } catch {} }
        } catch {
          // fall back to cache if available
          const cached = conversationCache[key] || [];
          setConversation(cached);
          setMessageCount(cached.length);
        }
      })();
    }
  }, [caseId, sessionCases]);

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    if (conversationHistoryRef.current) {
      conversationHistoryRef.current.scrollTop = conversationHistoryRef.current.scrollHeight;
    }
  }, [conversation]);

  // Disable auto-title generation per requirements; titles are generated on explicit request from the sidebar
  useEffect(() => {
    // no-op
  }, [messageCount, sessionId]);

  // Session heartbeat (keep-alive) – configurable long interval; runs only when session exists
  useEffect(() => {
    let timer: number | undefined;
    const HEARTBEAT_MS = Number((import.meta as any).env?.VITE_HEARTBEAT_INTERVAL_MS ?? 30 * 60 * 1000); // default 30m
    const tick = async () => {
      if (!sessionId) return;
      if (document.visibilityState === 'hidden') return; // skip in background tabs
      try { await heartbeatSession(sessionId); } catch {}
    };
    if (sessionId && HEARTBEAT_MS > 0) {
      // fire-and-forget interval
      timer = window.setInterval(tick, HEARTBEAT_MS) as unknown as number;
    }
    return () => { if (timer) window.clearInterval(timer as unknown as number); };
  }, [sessionId]);

  const loadSessionData = async (sessionId: string) => {
    if (!sessionId) {
      setSessionData([]);
      return;
    }
    try {
      const data = await getSessionData(sessionId, 50, 0);
      setSessionData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[ChatWindow] Failed to load session data:", err);
      setSessionData([]);
    }
  };

  const generateTitle = async () => {};

  const addTimestamp = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const generateConversationId = (): string => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const parseConversation = (convo: any): ConversationItem[] => {
    if (!convo) return [];
    const messages = Array.isArray(convo.messages) ? convo.messages : (Array.isArray(convo) ? convo : []);
    const mapped: ConversationItem[] = messages.map((m: any) => {
      const role = (m.role || m.sender || m.author || '').toString().toLowerCase();
      const content = m.content ?? m.text ?? m.message ?? '';
      const ts = m.timestamp || m.created_at || m.time || Date.now();
      return {
        id: `${ts}-${Math.random().toString(36).slice(2,8)}`,
        question: role === 'user' || role === 'human' ? String(content) : undefined,
        response: role === 'assistant' || role === 'agent' || role === 'system' ? String(content) : undefined,
        error: false,
        timestamp: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } as ConversationItem;
    }).filter((it: ConversationItem) => Boolean(it.question) || Boolean(it.response));
    // De-duplicate consecutive identical messages (avoid double user/assistant echoes)
    const deduped: ConversationItem[] = [];
    for (const item of mapped) {
      const last = deduped[deduped.length - 1];
      const isDupUser = !!(item.question && last?.question && item.question === last.question);
      const isDupAssistant = !!(item.response && last?.response && item.response === last.response);
      if (isDupUser || isDupAssistant) continue;
      deduped.push(item);
    }
    return deduped;
  };

  const addToConversation = (question?: string, response?: string, error: boolean = false, responseData?: AgentResponse, targetCaseId?: string | null, options?: { forceVisible?: boolean }) => {
    let requiresAction = false;
    if (responseData) {
      try { requiresAction = requiresUserAction(responseData); } catch { requiresAction = false; }
    }

    const newItem: ConversationItem = {
      id: generateConversationId(),
      question,
      response,
      error,
      timestamp: addTimestamp(),
      responseType: responseData?.response_type,
      confidenceScore: responseData?.confidence_score,
      sources: responseData?.sources,
      plan: responseData?.plan,
      nextActionHint: responseData?.next_action_hint,
      requiresAction
    };

    const resolvedCaseId = targetCaseId || currentCaseIdRef.current || null;
    if (!resolvedCaseId) {
      console.warn('[ChatWindow] Skipped caching message: unresolved case_id');
      return;
    }

    const targetKey = getCacheKey(sessionId, resolvedCaseId);
    const visibleKey = getCacheKey(sessionId, currentCaseIdRef.current);
    const baseList = (targetKey === visibleKey ? conversation : (conversationCache[targetKey] || []));

    // Merge logic: if last item is the same user question without a response, and we are adding only a response, merge instead of appending
    let updatedList: ConversationItem[] = baseList;
    if (!question && response && baseList.length > 0) {
      const last = baseList[baseList.length - 1];
      if (last && last.question && !last.response) {
        const merged: ConversationItem = { ...last, response, error, responseType: responseData?.response_type, confidenceScore: responseData?.confidence_score, sources: responseData?.sources, plan: responseData?.plan, nextActionHint: responseData?.next_action_hint };
        updatedList = [...baseList.slice(0, -1), merged];
      } else {
        updatedList = [...baseList, newItem];
      }
    } else if (question && response && baseList.length > 0) {
      // If a separate optimistic question exists as the last item, replace it with combined Q+A to avoid duplicates
      const last = baseList[baseList.length - 1];
      if (last && last.question === question && !last.response) {
        updatedList = [...baseList.slice(0, -1), newItem];
      } else {
        updatedList = [...baseList, newItem];
      }
    } else {
      updatedList = [...baseList, newItem];
    }

    // Update cache for the target case
    setConversationCache(prev => ({ ...prev, [targetKey]: updatedList }));
    setMessageCountCache(prev => ({ ...prev, [targetKey]: updatedList.length }));
    console.log('[ChatWindow] Updated cache', { key: targetKey, caseId: resolvedCaseId, items: updatedList.length });

    // Only update on-screen conversation if the target is currently visible,
    // or if this is the just-created case to ensure the first message appears immediately
    if (targetKey === visibleKey || options?.forceVisible || (lastCreatedCaseIdRef.current && resolvedCaseId === lastCreatedCaseIdRef.current)) {
      setConversation(updatedList);
      setMessageCount(updatedList.length);
    }
  };

  const getPageContent = async () => {
    try {
      setInjectionStatus({ message: "🔄 Analyzing page content...", type: "" });
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error("No active tab found");
      const response = await browser.tabs.sendMessage(tab.id, { action: "getPageContent" });
      if (response && response.content) {
        setPageContent(response.content);
        setInjectionStatus({ message: "✅ Page content captured successfully!", type: "success" });
      } else {
        throw new Error("Failed to capture page content");
      }
    } catch (err) {
      console.error("[ChatWindow] getPageContent error:", err);
      setInjectionStatus({ message: "⚠️ Failed to capture page content. Please ensure the page is fully loaded.", type: "error" });
    }
  };

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    try {
      const newSession = await createSession();
      if (onSessionCreated) onSessionCreated(newSession.session_id);
      return newSession.session_id;
    } catch (e) {
      addToConversation(undefined, "⚠️  Cannot reach server\n\nPlease check your connection and try again.", true);
      return null;
    }
  };

  const handleCreateCase = async () => {
    const sid = await ensureSession();
    if (!sid) return;
    setCreatingCase(true);
    try {
      const created = await createCase({ title: "New Case", priority: "medium" });
      const caseObj = (created as any)?.case?.case_id ? (created as any).case : created;
      const newCaseId = caseObj?.case_id;
      if (!newCaseId) throw new Error('Invalid CaseResponse');
      // Migrate draft cache to case cache if present
      const draftKey = draftId ? `draft:${draftId}` : null;
      if (draftKey && (conversationCache[draftKey]?.length || conversation.length)) {
        const draftConv = conversationCache[draftKey] || conversation;
        setConversationCache(prev => ({ ...prev, [`case:${newCaseId}`]: draftConv }));
        setMessageCountCache(prev => ({ ...prev, [`case:${newCaseId}`]: draftConv.length }));
        setConversation(draftConv);
      }
      setActiveCase(caseObj as UserCase);
      currentCaseIdRef.current = newCaseId;
      if (onCaseActivated) { try { onCaseActivated(newCaseId); } catch {} }
      setDraftId(null);
      const cases = await listSessionCases(sid, 20, 0);
      setSessionCases(cases);
      // No synthetic message; wait for real assistant/user messages
    } catch (e: any) {
      addToConversation(undefined, `❌  Failed to create case: ${e.message}`, true);
    } finally {
      setCreatingCase(false);
    }
  };

  const sendToFaultMaven = async (query: string) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    // Start thinking/lock immediately on keypress
    setLoading(true);
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        const newSession = await createSession();
        currentSessionId = newSession.session_id;
        if (onSessionCreated) onSessionCreated(currentSessionId);
      } catch (error) {
        addToConversation(undefined, "⚠️  Cannot reach server\n\nPlease check your connection and try again.", true);
        setLoading(false);
        return;
      }
    }


    try {
      const request: QueryRequest = {
        session_id: currentSessionId!,
        query,
        priority: "normal",
        context: {
          page_url: window.location.href,
          browser_info: navigator.userAgent,
          uploaded_data_ids: Array.isArray(sessionData) ? sessionData.map(d => d.data_id) : []
        }
      };

      let response: AgentResponse;
      // For new unsaved chat, force creation first to avoid appending to previous case
      const targetCid = currentCaseIdRef.current || activeCase?.case_id || caseId || undefined;
      if (isNewUnsavedChat && !activeCase?.case_id) {
        // Create a new case, then submit the first query once
        const created = await createCase({ title: "New Chat", priority: "medium", session_id: currentSessionId! });
        const caseObj = (created as any)?.case?.case_id ? (created as any).case : created;
        const newCaseId = caseObj?.case_id;
        console.log('[ChatWindow] Created case', caseObj);
        if (!newCaseId) throw new Error('Invalid CaseResponse');
        const draftKey = draftId ? `draft:${draftId}` : null;
        if (draftKey && (conversationCache[draftKey]?.length || conversation.length)) {
          const draftConv = conversationCache[draftKey] || conversation;
          setConversationCache(prev => ({ ...prev, [`case:${newCaseId}`]: draftConv }));
          setMessageCountCache(prev => ({ ...prev, [`case:${newCaseId}`]: draftConv.length }));
          setConversation(draftConv);
        }
        setActiveCase(caseObj as UserCase);
        lastCreatedCaseIdRef.current = newCaseId;
        currentCaseIdRef.current = newCaseId;
        if (onCaseActivated) { try { onCaseActivated(newCaseId); } catch {} }
        // Do not append a local optimistic user message; rely on canonical hydration
        // Persist timestamp title immediately to ensure it survives reloads
        try {
          const tsNow = new Date().toISOString();
          if (onCaseTitleGenerated) onCaseTitleGenerated(newCaseId, `chat-${tsNow}`);
          await updateCaseTitle(newCaseId, `chat-${tsNow}`);
        } catch {}
        // Submit the first query; append assistant when it arrives
        try {
          const firstResponse = await submitQueryToCase(newCaseId, request);
          const firstContent = (firstResponse as any)?.content || '';
          if (firstContent) {
            // Stop spinner immediately once we have a result
            setLoading(false);
            try { onChatSaved?.(); } catch {}
            try { onCasesNeedsRefresh?.(); } catch {}
            try { onCaseCommitted?.(newCaseId); } catch {}
            // Hydrate canonical messages (user + assistant)
            try {
              const convo = await getCaseConversation(newCaseId);
              const items: ConversationItem[] = parseConversation(convo);
              const key = getCacheKey(sessionId, newCaseId);
              if (items.length > 0) {
                setConversationCache(prev => ({ ...prev, [key]: items }));
                setMessageCountCache(prev => ({ ...prev, [key]: items.length }));
                setConversation(items);
                setMessageCount(items.length);
              }
            } catch {}
          }
        } catch (err) {
          addToConversation(undefined, `❌  Query failed: ${err instanceof Error ? err.message : String(err)}`, true, undefined, newCaseId);
        }
        try {
          const ts = new Date().toISOString();
          if (onCaseTitleGenerated) onCaseTitleGenerated(newCaseId, `chat-${ts}`);
        } catch {}
        setLoading(false);
        return;
      } else if (targetCid) {
        const priorKey = getCacheKey(sessionId, targetCid);
        const priorCount = (conversationCache[priorKey]?.length ?? ((priorKey === getCacheKey(sessionId, currentCaseIdRef.current)) ? conversation.length : 0)) || 0;
        // If this is the first message in the case, persist timestamp title immediately
        if (priorCount === 0) {
          try {
            const tsNow = new Date().toISOString();
            if (onCaseTitleGenerated) onCaseTitleGenerated(targetCid, `chat-${tsNow}`);
            await updateCaseTitle(targetCid, `chat-${tsNow}`);
          } catch {}
        }
        response = await submitQueryToCase(targetCid, request);
        // Stop spinner immediately once we have a response, then hydrate canonical messages
        setLoading(false);
        try {
          const convo = await getCaseConversation(targetCid);
          const items: ConversationItem[] = parseConversation(convo);
          const key = getCacheKey(sessionId, targetCid);
          setConversationCache(prev => ({ ...prev, [key]: items }));
          setMessageCountCache(prev => ({ ...prev, [key]: items.length }));
          setConversation(items);
          setMessageCount(items.length);
        } catch {}
        return;
      } else if (isNewUnsavedChat) {
        // Create a new case, then submit the first query once
        const created = await createCase({ title: "New Chat", priority: "medium", session_id: currentSessionId! });
        const caseObj = (created as any)?.case?.case_id ? (created as any).case : created;
        const newCaseId = caseObj?.case_id;
        console.log('[ChatWindow] Created case', caseObj);
        if (!newCaseId) throw new Error('Invalid CaseResponse');
        const draftKey = draftId ? `draft:${draftId}` : null;
        if (draftKey && (conversationCache[draftKey]?.length || conversation.length)) {
          const draftConv = conversationCache[draftKey] || conversation;
          setConversationCache(prev => ({ ...prev, [`case:${newCaseId}`]: draftConv }));
          setMessageCountCache(prev => ({ ...prev, [`case:${newCaseId}`]: draftConv.length }));
          setConversation(draftConv);
        }
        setActiveCase(caseObj as UserCase);
        lastCreatedCaseIdRef.current = newCaseId;
        currentCaseIdRef.current = newCaseId;
        if (onCaseActivated) { try { onCaseActivated(newCaseId); } catch {} }
        // Do not append an optimistic user message; submit and then hydrate
        try {
          const firstResponse = await submitQueryToCase(newCaseId, request);
          const firstContent = (firstResponse as any)?.content || '';
          if (firstContent) {
            // Stop spinner immediately once we have a result
            setLoading(false);
            // Now that there is at least one persisted message, refresh list
            try { onChatSaved?.(); } catch {}
            try { onCasesNeedsRefresh?.(); } catch {}
            try { onCaseCommitted?.(newCaseId); } catch {}
            // Ensure parent stays focused on this new case
            try { onCaseActivated?.(newCaseId); } catch {}
            // Hydrate from backend to eliminate any local duplication
            try {
              const convo = await getCaseConversation(newCaseId);
              const items: ConversationItem[] = parseConversation(convo);
              const key = getCacheKey(sessionId, newCaseId);
              if (items.length > 0) {
                setConversationCache(prev => ({ ...prev, [key]: items }));
                setMessageCountCache(prev => ({ ...prev, [key]: items.length }));
                setConversation(items);
                setMessageCount(items.length);
              }
            } catch {}
          }
        } catch (err) {
          addToConversation(undefined, `❌  Query failed: ${err instanceof Error ? err.message : String(err)}`, true, undefined, newCaseId);
        }
        // Title: server handles auto-title; reflect locally
        try {
          const ts = new Date().toISOString();
          if (onCaseTitleGenerated) onCaseTitleGenerated(newCaseId, `chat-${ts}`);
          try { await updateCaseTitle(newCaseId, `chat-${ts}`); } catch {}
        } catch {}
        setLoading(false);
        return;
      } else {
        // No active case and not in unsaved new chat → do not create; prompt user
        addToConversation(undefined, "Start a new chat or select an existing one.", true);
        setLoading(false);
        return;
      }

      const responseContent = (response as any).content || '';
      const targetCaseForCache = currentCaseIdRef.current || lastCreatedCaseIdRef.current || response.case_id || null;
      const wasEmpty = messageCount === 0;
      // Stop spinner as soon as we have any response content
      setLoading(false);
      // Hydrate canonical messages instead of appending locally
      if (targetCaseForCache) {
        try {
          const convo = await getCaseConversation(targetCaseForCache as string);
          const items: ConversationItem[] = parseConversation(convo);
          const key = getCacheKey(sessionId, targetCaseForCache as string);
          if (items.length > 0) {
            setConversationCache(prev => ({ ...prev, [key]: items }));
            setMessageCountCache(prev => ({ ...prev, [key]: items.length }));
            setConversation(items);
            setMessageCount(items.length);
          }
        } catch {}
      }

      if (!hasInteracted) { setHasInteracted(true); }

      if (isNewUnsavedChat) {
        try { onChatSaved?.(); } catch {}
      }

      try {
        const cid = activeCase?.case_id || response.case_id || lastCreatedCaseIdRef.current || undefined;
        if (cid && (wasEmpty || lastCreatedCaseIdRef.current === cid)) {
          const cidStr = cid as string;
          const ts = new Date().toISOString();
          try { onCaseTitleGenerated?.(cidStr, `chat-${ts}`); } catch {}
          try { await updateCaseTitle(cidStr, `chat-${ts}`); } catch {}
          if (lastCreatedCaseIdRef.current === cid) {
            lastCreatedCaseIdRef.current = null;
          }
        }
        // Additional hydration already done above
      } catch {}
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // Show validation error messages instead of generic Failed to fetch
      if (/422|unprocessable|validation/i.test(errorMessage)) {
        const cid = currentCaseIdRef.current || activeCase?.case_id || caseId || null;
        addToConversation(undefined, `❌  Query failed: ${errorMessage}`, true, undefined, cid, { forceVisible: true });
        setLoading(false);
        return;
      }
      const targetCaseForCache = activeCase?.case_id || (caseId ?? null);
      addToConversation(undefined, `❌  Query failed: ${errorMessage}`, true, undefined, targetCaseForCache);
    } finally {
      setLoading(false);
      isSendingRef.current = false;
      // Keep typing flow smooth: return focus to the query input
      try { queryInputRef.current && queryInputRef.current.focus(); } catch {}
    }
  };

  const sendDataToFaultMaven = async () => {
    let currentSessionId = await ensureSession();
    if (!currentSessionId) return;
    setLoading(true);

    let dataToSend: string | File | null = null;
    if (dataSource === "text") dataToSend = textInput.trim();
    else if (dataSource === "file" && fileInputRef.current?.files?.[0]) dataToSend = fileInputRef.current.files[0];
    else if (dataSource === "page") dataToSend = pageContent;

    if (!dataToSend) {
      addToConversation(undefined, "❌  No data to submit", true);
      setLoading(false);
      return;
    }

    // No synthetic message; only show results or errors
    try {
      if (activeCase && dataToSend instanceof File) {
        await uploadDataToCase(activeCase.case_id, currentSessionId, dataToSend);
        addToConversation(undefined, `✅ File uploaded to case ${activeCase.title || activeCase.case_id}`);
      } else {
        const response: UploadedData = await uploadData(currentSessionId, dataToSend, dataSource);
        let formattedResponse = `✅ Data uploaded successfully (ID: ${response.data_id})`;
        if (response.data_type && response.data_type !== 'unknown') {
          formattedResponse += `\n\n**Data Type:** ${response.data_type.replace('_', ' ').toUpperCase()}`;
        }
        addToConversation(undefined, formattedResponse);
      }

      if (isNewUnsavedChat && !hasInteracted && onChatSaved) {
        onChatSaved();
        setHasInteracted(true);
      }

      await loadSessionData(currentSessionId);

      if (dataSource === "text") setTextInput("");
      else if (dataSource === "file") { if (fileInputRef.current) fileInputRef.current.value = ""; setFileSelected(false); }
      else if (dataSource === "page") setPageContent("");

    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      addToConversation(undefined, `❌  Upload failed: ${errorMessage}`, true);
    } finally {
      setLoading(false);
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
      if (trimmed && !loading && !isSendingRef.current) {
        sendToFaultMaven(trimmed);
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

  const isSubmitEnabled =
    !loading &&
    ((dataSource === "text" && textInput.trim()) ||
    (dataSource === "file" && fileSelected) ||
    (dataSource === "page" && !!pageContent.trim()));

  return (
    <div className={`flex flex-col h-full space-y-1 overflow-y-auto ${className}`}>

      {/* Conversation History */}
      <div id="conversation-history" ref={conversationHistoryRef} className="flex-grow overflow-y-auto bg-white border border-gray-300 rounded-lg p-2 min-h-0">
        {Array.isArray(conversation) && conversation.map((item) => (
          <React.Fragment key={item.id}>
            {item.question && (
              <div className="flex justify-end mb-1">
                <div className="w-full mx-1 px-2 py-1 text-sm text-gray-900 bg-gray-100 rounded">
                  <p className="break-words m-0">{item.question}</p>
                  <div className="text-[10px] text-gray-400 mt-1">{item.timestamp}</div>
                </div>
              </div>
            )}
            {item.response && (
              <div className="flex justify-end mb-2">
                <div className={`w-full mx-1 ${item.error ? "text-red-700" : "text-gray-800"}`}> 
                  {/* Response content */}
                  <div className="px-2 py-1 text-sm border-t border-b border-gray-200 rounded">
                    <InlineSourcesRenderer 
                      content={item.response || ''} 
                      sources={item.sources}
                      onDocumentView={onDocumentView}
                      className="break-words"
                    />
                    <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
                      <span>{item.timestamp}</span>
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

      {!canInteract && (
        <div className="flex-shrink-0 text-center p-1 text-xs text-gray-600 my-1">
          <span className="text-gray-600">Start a new chat to begin.</span>
        </div>
      )}

      {loading && (
        <div className="flex-shrink-0 text-center p-1 text-xs text-gray-600 my-1">
          <LoadingSpinner size="sm" />
          <span className="ml-2">Thinking...</span>
        </div>
      )}

      {/* Ask a Question Section */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 p-2 shadow-sm space-y-1">
        <div className="flex justify-between items-center border-b border-gray-200 pb-1 mb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ask a Question</h3>
        </div>
        <textarea
          id="query-input"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          onKeyDown={handleSubmitQuery}
          placeholder="Type your question here and press Enter..."
          rows={3}
          className="block w-full p-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={loading || !canInteract}
          maxLength={MAX_QUERY_LENGTH}
          ref={queryInputRef}
        />
      </div>

      {/* Provide Data Section */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 p-2 shadow-sm space-y-2">
        <div className="flex justify-between items-center border-b border-gray-200 pb-1 mb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Provide Data</h3>
          <button
            type="button"
            onClick={() => setShowDataSection(!showDataSection)}
            aria-label={showDataSection ? 'Collapse data section' : 'Expand data section'}
            className="h-6 w-6 text-xs flex items-center justify-center rounded border border-gray-300 bg-gray-100 hover:bg-gray-200"
            title={showDataSection ? 'Collapse' : 'Expand'}
          >
            {showDataSection ? '▼' : '▲'}
          </button>
        </div>

        {showDataSection && (
          <>
            <div className="flex justify-between items-start">
              <div className="space-y-1 text-xs">
                {["text", "file", "page"].map((value) => (
                  <label key={value} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="data-source"
                      value={value}
                      checked={dataSource === value}
                      onChange={handleDataSourceChange}
                      className="accent-blue-500"
                      disabled={loading || !canInteract}
                    />
                    {value === "text" ? "Type or Paste Logs" : value === "file" ? "Upload a File" : "Analyze Page Content"}
                  </label>
                ))}
              </div>
              <button
                id="submit-data"
                onClick={sendDataToFaultMaven}
                disabled={!isSubmitEnabled || loading || !canInteract}
                className="w-36 text-center py-1.5 px-3 text-xs font-medium bg-gray-200 text-gray-800 border border-gray-300 rounded hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Data
              </button>
            </div>

            {dataSource === "text" && (
              <textarea
                id="data-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste logs, metrics, or monitoring data here..."
                rows={3}
                className="block w-full p-2 mt-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={loading || !canInteract}
              />
            )}

            {dataSource === "file" && (
              <input
                type="file"
                id="file-input"
                ref={fileInputRef}
                accept=".txt,.log,.json,.csv"
                title="Supported formats: .txt, .log, .json, .csv"
                onChange={(e) => setFileSelected(!!e.target.files?.length)}
                className="block w-full mt-2 text-xs border rounded p-1.5 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                disabled={loading || !canInteract}
              />
            )}

            {dataSource === "page" && (
              <div className="mt-2 space-y-2">
                <button
                  id="analyze-page-button"
                  onClick={getPageContent}
                  disabled={loading || !canInteract}
                  className="w-auto py-1.5 px-4 text-xs font-medium bg-gray-200 text-gray-700 border border-gray-300 rounded hover:bg-gray-300 transition-colors whitespace-nowrap"
                >
                  Analyze Current Page
                </button>
                {injectionStatus.message && (
                  <div id="injection-status" className={`px-2 py-1 rounded text-xs ${
                    injectionStatus.type === "error"
                      ? "text-red-700 bg-red-100"
                      : injectionStatus.type === "success"
                      ? "text-green-700 bg-green-100"
                      : "text-gray-600"
                  }`}>
                    {injectionStatus.message}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Session Data Summary */}
      {sessionData.length > 0 && (
        <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 p-2 shadow-sm">
          <div className="flex justify-between items-center border-b border-gray-200 pb-1 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Session Data</h3>
            <span className="text-xs text-gray-500">{sessionData.length} items</span>
          </div>
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {Array.isArray(sessionData) && sessionData.slice(0, 3).map((item, index) => (
              <div key={index} className="text-xs text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                <span className="truncate">{item.file_name || item.data_type}</span>
                <span className="text-gray-400">({item.data_type})</span>
              </div>
            ))}
            {Array.isArray(sessionData) && sessionData.length > 3 && (
              <div className="text-xs text-gray-400 italic">
                +{sessionData.length - 3} more items
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}