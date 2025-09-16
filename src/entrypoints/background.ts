// src/entrypoints/background.ts
import { createSession, deleteSession } from '../lib/api';
import { clientSessionManager } from '../lib/session/client-session-manager';
import { browser } from 'wxt/browser';

export default defineBackground({
  main() {
    console.log("[background.ts] Init (Fixed: Backend Session Logic)");

    // === Backend Session Logic Functions ===
    async function handleGetSessionId(requestAction: string, sendResponse: (response?: any) => void) {
      console.log(`[background.ts] handleGetSessionId called for action: ${requestAction}`);

      try {
        // Check if we have a valid session stored locally
        const result = await browser.storage.local.get(["sessionId", "sessionCreatedAt", "sessionResumed"]);

        // If we have a recent session (less than 30 minutes old), use it
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();
        const sessionAge = result.sessionCreatedAt ? (now - result.sessionCreatedAt) : SESSION_TIMEOUT + 1;

        if (result.sessionId && sessionAge < SESSION_TIMEOUT) {
          console.log("[background.ts] Using existing valid session:", result.sessionId);
          sendResponse({
            sessionId: result.sessionId,
            status: "success",
            sessionResumed: result.sessionResumed || false
          });
          return;
        }

        // Create new backend session using ClientSessionManager
        console.log("[background.ts] Creating new backend session with client-based management...");
        try {
          const session = await createSession();
          console.log("[background.ts] Backend session created/resumed:", session.session_id);
          console.log("[background.ts] Session resumed?", session.session_resumed || false);
          console.log("[background.ts] Client ID:", session.client_id?.slice(0, 8) + '...');

          // Store the session locally with timestamp and resumption info
          await browser.storage.local.set({
            sessionId: session.session_id,
            sessionCreatedAt: now,
            sessionResumed: session.session_resumed || false,
            clientId: session.client_id
          });

          console.log("[background.ts] Session stored locally:", session.session_id);
          sendResponse({
            sessionId: session.session_id,
            status: "success",
            sessionResumed: session.session_resumed || false,
            message: session.message
          });
        } catch (apiError: any) {
          console.error("[background.ts] Failed to create backend session:", apiError);
          sendResponse({ status: "error", message: `Failed to create session: ${apiError.message}` });
        }
      } catch (error) {
        console.error("[background.ts] Error in handleGetSessionId:", error);
        sendResponse({ status: "error", message: "Session creation failed" });
      }
    }

    async function handleClearSession(requestAction: string, sendResponse: (response?: any) => void) {
      console.log(`[background.ts] handleClearSession called for action: ${requestAction}`);
      
      try {
        // Get current session to delete from backend
        const result = await browser.storage.local.get(["sessionId"]);

        // Try to delete from backend if we have a session ID
        if (result.sessionId) {
          try {
            console.log("[background.ts] Deleting backend session:", result.sessionId);
            await deleteSession(result.sessionId);
            console.log("[background.ts] Backend session deleted successfully");
          } catch (apiError) {
            console.warn("[background.ts] Failed to delete backend session (continuing anyway):", apiError);
            // Continue with local cleanup even if backend deletion fails
          }
        }

        // Clear local storage
        await browser.storage.local.remove(["sessionId", "sessionCreatedAt", "sessionResumed", "clientId"]);
        console.log("[background.ts] Session cleared (local and backend).");
        sendResponse({ status: "success" });
      } catch (error) {
        console.error("[background.ts] Error in handleClearSession:", error);
        sendResponse({ status: "error", message: "Failed to clear session" });
      }
    }

    // === Message Handler ===
    browser.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
      console.log("[background.ts] Message received:", request);

      if (request.action === "getSessionId") {
        handleGetSessionId(request.action, sendResponse);
        return true; // Indicate async response
      }

      if (request.action === "clearSession") {
        handleClearSession(request.action, sendResponse);
        return true; // Indicate async response
      }

      // Handle other actions...
      sendResponse({ status: "error", message: "Unknown action" });
    });

    // === Action Click Handler ===
    browser.action.onClicked.addListener(async (tab: any) => {
      console.log("[background.ts] Action clicked, opening side panel...");
      
      try {
        if (tab.windowId) {
          await browser.sidePanel.open({ windowId: tab.windowId });
        }
      } catch (error) {
        console.error("[background.ts] Error opening side panel:", error);
      }
    });

    // === Installation Handler ===
    browser.runtime.onInstalled.addListener((details: any) => {
      console.log("[background.ts] Extension installed/updated:", details);
    });
  }
});
