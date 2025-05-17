// src/entrypoints/page-content.content.ts
// NO import for defineContentScript

export default defineContentScript({
  matches: ["https://www.example.com/*"], // Restricted for dev stability
  runAt: "document_idle",
  main() {
    console.log(
      `%c[page-content.content.ts] MAIN FUNCTION EXECUTED on: ${window.location.href}`,
      "color: orange; font-weight:bold;"
    );

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("[page-content.content.ts] Message received in listener. Message:", message, "Sender ID:", sender.id); // Log sender ID

      if (message && message.action === "getPageContent") {
        console.log("[page-content.content.ts] 'getPageContent' action matched.");
        try {
          const pageContent = document.documentElement.outerHTML;
          console.log("[page-content.content.ts] Extracted outerHTML (snippet):", pageContent.substring(0, 100) + "...");
          sendResponse({
            status: "success",
            data: pageContent,
            url: window.location.href
          });
        } catch (e: any) {
          console.error("[page-content.content.ts] Error getting page content:", e);
          sendResponse({ status: "error", message: e.message || "Failed to get page content" });
        }
        return true; // Indicate that sendResponse will be called
      }
      
      console.log("[page-content.content.ts] Action not matched or message malformed for this listener. Request action:", message?.action);
      return false; 
    });

    console.log("[page-content.content.ts] Listener added. Script ready.");
  }
});
