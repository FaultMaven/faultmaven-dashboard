// src/lib/utils/messaging.ts
import { browser } from "wxt/browser"; // <<< Ensure this is "wxt/browser"

/**
 * Sends a message to the background script.
 */
export async function sendMessageToBackground(message: any): Promise<any> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch (error) {
    console.error("Error sending message to background:", error, "Message:", message);
    throw error; // Re-throw so the caller can catch it
  }
}
