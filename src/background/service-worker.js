// Background service worker: content script registration, message handling and lookups.
// All persistent state lives in chrome.storage, so a worker restart loses nothing but
// in-flight request coalescing.

import { pagePatternsFromGranted } from "../shared/settings.js";
import { createLookupService } from "./lookup-service.js";

const CONTENT_SCRIPT_ID = "ip-selector";
const MAX_MESSAGE_IP_LENGTH = 100;

const lookupService = createLookupService({
  fetchFn: (url, init) => fetch(url, init),
  localArea: chrome.storage.local,
  sessionArea: chrome.storage.session,
});

// The API key lives in storage.local; hide that area from content scripts.
async function restrictStorageAccess() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("storage.local access level could not be restricted", error);
  }
}

async function syncContentScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  const matches = pagePatternsFromGranted(origins);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });

  if (matches.length === 0) {
    if (existing.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    }
    return;
  }

  const script = {
    id: CONTENT_SCRIPT_ID,
    matches,
    js: ["src/shared/ip.js", "src/content/card-styles.js", "src/content/content-script.js"],
    runAt: "document_idle",
    allFrames: false,
    persistAcrossSessions: true,
  };

  if (existing.length > 0) {
    await chrome.scripting.updateContentScripts([script]);
  } else {
    await chrome.scripting.registerContentScripts([script]);
  }
}

function syncSafely() {
  syncContentScripts().catch((error) => console.error("content script sync failed", error));
}

function isValidLookupMessage(message) {
  return (
    typeof message.ip === "string" &&
    message.ip.length > 0 &&
    message.ip.length <= MAX_MESSAGE_IP_LENGTH &&
    (message.refresh === undefined || typeof message.refresh === "boolean")
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own content scripts and pages may talk to the worker.
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return false;

  switch (message.type) {
    case "lookup":
      if (!isValidLookupMessage(message)) {
        sendResponse({ status: "invalid" });
        return false;
      }
      lookupService
        .lookup({ ip: message.ip, refresh: message.refresh === true })
        .then(sendResponse, (error) => {
          console.error("lookup failed", error);
          sendResponse({ status: "error", code: "internal" });
        });
      return true; // async response
    case "openOptions":
      chrome.runtime.openOptionsPage();
      return false;
    default:
      return false;
  }
});

// Keyboard shortcut: ask the content script in the active tab to look up its selection.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "lookup-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "lookupSelection" }).catch(() => {
    // No content script on this page (site not granted); nothing to do.
  });
});

restrictStorageAccess();

chrome.runtime.onInstalled.addListener(syncSafely);
chrome.runtime.onStartup.addListener(syncSafely);
chrome.permissions.onAdded.addListener(syncSafely);
chrome.permissions.onRemoved.addListener(syncSafely);
