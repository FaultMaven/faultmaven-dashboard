// src/entrypoints/background.ts
// NO import for defineBackground

export default defineBackground({
  main() {
    console.log("[background.ts] Init (Test B: Session Logic)");

    const generateUUID = () =>
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

    // === Refactored Session Logic Functions ===
    function handleGetSessionId(requestAction: string, sendResponse: (response?: any) => void) {
      console.log(`[background.ts] handleGetSessionId called for action: ${requestAction}`);
      chrome.storage.local.get(["sessionId"], (result) => {
        if (chrome.runtime.lastError) {
          console.error("[background.ts] Error getting sessionId:", chrome.runtime.lastError.message);
          sendResponse({ status: "error", message: "Failed to get session ID" });
          return;
        }
        if (result.sessionId) {
          console.log("[background.ts] Retrieved sessionId:", result.sessionId);
          sendResponse({ sessionId: result.sessionId, status: "success" });
        } else {
          const newSessionId = generateUUID();
          console.log("[background.ts] No sessionId found, generated new:", newSessionId);
          chrome.storage.local.set({ sessionId: newSessionId }, () => {
            if (chrome.runtime.lastError) {
              console.error("[background.ts] Error setting new sessionId:", chrome.runtime.lastError.message);
              sendResponse({ status: "error", message: "Failed to set new session ID" });
            } else {
              console.log("[background.ts] New sessionId stored:", newSessionId);
              sendResponse({ sessionId: newSessionId, status: "success" });
            }
          });
        }
      });
    }

    function handleClearSession(requestAction: string, sendResponse: (response?: any) => void) {
      console.log(`[background.ts] handleClearSession called for action: ${requestAction}`);
      chrome.storage.local.remove("sessionId", () => {
        if (chrome.runtime.lastError) {
          console.error("[background.ts] Error clearing session:", chrome.runtime.lastError.message);
          sendResponse({ status: "error", message: "Failed to clear session." });
        } else {
          console.log("[background.ts] Session cleared.");
          sendResponse({ status: "success" });
        }
      });
    }

    // Expose test functions to globalThis for console testing
    (globalThis as any).testBgGetSessionId = (callback: (response: any) => void) => {
      console.log("[background.ts] testBgGetSessionId (via globalThis) invoked.");
      handleGetSessionId("getSessionId (via globalThis)", callback);
    };
    (globalThis as any).testBgClearSession = (callback: (response: any) => void) => {
      console.log("[background.ts] testBgClearSession (via globalThis) invoked.");
      handleClearSession("clearSession (via globalThis)", callback);
    };

    // Existing onMessage listener now calls these refactored handlers
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!request || !request.action) {
        console.warn("[background.ts] onMessage: Received message without action:", request);
        return false;
      }
      console.log(`[background.ts] onMessage: Received action '${request.action}' from`, sender.tab ? `tab ${sender.tab.id}` : "internal extension context");

      if (request.action === "getSessionId") {
        handleGetSessionId(request.action, sendResponse);
        return true;
      }
      if (request.action === "clearSession") {
        handleClearSession(request.action, sendResponse);
        return true;
      }
      // Note: getPageContent logic is no longer here as per your architecture
      console.warn(`[background.ts] onMessage: Unhandled action: ${request.action}`);
      return false;
    });

    // Keep your onClicked listener for opening the side panel (it also tests getPageContent from content script)
    chrome.action.onClicked.addListener(async (tab) => {
      console.log(`[background.ts] Action clicked. Tab ID: ${tab.id}, URL: ${tab.url}`);
      if (tab.id && tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))) {
        console.log(`[background.ts] onClicked: Sending 'getPageContent' message to content script in tab ${tab.id}`);
        chrome.tabs.sendMessage(tab.id, { action: "getPageContent" }, (response) => { /* ... same as before ... */ });
      } else { /* ... same as before ... */ }
      // Attempt to open side panel (still expect "No active side panel" error for now)
      try { if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId }); }
      catch (e) { console.error("[background.ts] Error opening side panel on click:", e); }
    });

    chrome.runtime.onInstalled.addListener((details) => {
      console.log('[background.ts] Extension installed or updated:', details);
    });

    console.log("[background.ts] All background listeners active. Test functions (testBgGetSessionId, testBgClearSession) exposed to globalThis.");
  }
});
