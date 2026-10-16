// Background service worker: content script registration, message handling and lookups.
// All persistent state lives in chrome.storage, so a worker restart loses nothing but
// in-flight request coalescing.

import { pagePatternsFromGranted } from "../shared/settings.js";
import { createLookupService } from "./lookup-service.js";
import { UPDATE_STATE_KEY, checkLatestRelease, compareVersions } from "../shared/update.js";

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

// ---------- updates ----------
// 1. Every few minutes, compare the manifest on disk with the running version. The
//    external updater script replaces the files (manifest last); when the versions
//    differ, reload so the new code takes effect without user action.
// 2. Twice a day, ask GitHub for the latest release and show a badge if it is newer.

const LOCAL_CHECK_ALARM = "local-files-check";
const RELEASE_CHECK_ALARM = "release-check";

async function reloadIfFilesChanged() {
  try {
    const response = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
    const onDisk = await response.json();
    const running = chrome.runtime.getManifest().version;
    if (compareVersions(onDisk.version, running) === 1) chrome.runtime.reload();
  } catch {
    // Files mid-replacement or unreadable; try again on the next alarm.
  }
}

async function applyBadge(state) {
  const running = chrome.runtime.getManifest().version;
  const newer = state && compareVersions(state.latestVersion, running) === 1;
  await chrome.action.setBadgeText({ text: newer ? "NEW" : "" });
  if (newer) await chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });
}

async function runReleaseCheck() {
  const result = await checkLatestRelease({
    fetchFn: (url, init) => fetch(url, init),
    currentVersion: chrome.runtime.getManifest().version,
  });
  if (result) await chrome.storage.local.set({ [UPDATE_STATE_KEY]: result });
  const stored = (await chrome.storage.local.get(UPDATE_STATE_KEY))[UPDATE_STATE_KEY];
  await applyBadge(stored);
}

async function ensureAlarms() {
  if (!(await chrome.alarms.get(LOCAL_CHECK_ALARM))) {
    await chrome.alarms.create(LOCAL_CHECK_ALARM, { periodInMinutes: 5 });
  }
  if (!(await chrome.alarms.get(RELEASE_CHECK_ALARM))) {
    await chrome.alarms.create(RELEASE_CHECK_ALARM, { delayInMinutes: 1, periodInMinutes: 720 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCAL_CHECK_ALARM) reloadIfFilesChanged();
  if (alarm.name === RELEASE_CHECK_ALARM) runReleaseCheck().catch(() => {});
});

function onBrowserOrExtensionStart() {
  syncSafely();
  ensureAlarms().catch((error) => console.error("alarm setup failed", error));
  chrome.storage.local
    .get(UPDATE_STATE_KEY)
    .then((stored) => applyBadge(stored[UPDATE_STATE_KEY]))
    .catch(() => {});
}

restrictStorageAccess();

chrome.runtime.onInstalled.addListener(onBrowserOrExtensionStart);
chrome.runtime.onStartup.addListener(onBrowserOrExtensionStart);
chrome.permissions.onAdded.addListener(syncSafely);
chrome.permissions.onRemoved.addListener(syncSafely);
