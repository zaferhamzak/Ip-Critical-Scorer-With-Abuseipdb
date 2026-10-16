// Background script (Chromium service worker / Firefox event page): content script registration, message handling and lookups.
// All persistent state lives in ext.storage, so a worker restart loses nothing but
// in-flight request coalescing.

import { ext } from "../shared/ext.js";
import "../shared/export.js";
import { STORAGE_KEYS, mergeSettings, normalizeNote, normalizeQuickNotes, pagePatternsFromGranted } from "../shared/settings.js";
import { addEntry, entryFromResult, pruneHistory, removeEntries, setNote } from "../shared/history.js";
import { createLookupService } from "./lookup-service.js";

const CONTENT_SCRIPT_ID = "ip-selector";
const MAX_MESSAGE_IP_LENGTH = 100;

const lookupService = createLookupService({
  fetchFn: (url, init) => fetch(url, init),
  localArea: ext.storage.local,
  sessionArea: ext.storage.session,
});

// The API key lives in storage.local; hide that area from content scripts.
async function restrictStorageAccess() {
  // Not implemented in Firefox; there the key stays readable by our own content script.
  if (typeof ext.storage.local.setAccessLevel !== "function") return;
  try {
    await ext.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("storage.local access level could not be restricted", error);
  }
}

async function syncContentScripts() {
  const { origins = [] } = await ext.permissions.getAll();
  const matches = pagePatternsFromGranted(origins);
  const existing = await ext.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });

  if (matches.length === 0) {
    if (existing.length > 0) {
      await ext.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    }
    return;
  }

  const script = {
    id: CONTENT_SCRIPT_ID,
    matches,
    js: ["src/shared/ip.js", "src/shared/export.js", "src/content/card-styles.js", "src/content/content-script.js"],
    runAt: "document_idle",
    allFrames: false,
    persistAcrossSessions: true,
  };

  if (existing.length > 0) {
    await ext.scripting.updateContentScripts([script]);
  } else {
    await ext.scripting.registerContentScripts([script]);
  }
}

function syncSafely() {
  syncContentScripts().catch((error) => console.error("content script sync failed", error));
}

// History writes are serialised: bulk lookups finish in parallel and would otherwise
// overwrite each other's read-modify-write.
let historyQueue = Promise.resolve();
function updateHistory(mutate, { evenIfDisabled = false } = {}) {
  historyQueue = historyQueue
    .then(async () => {
      const keys = [STORAGE_KEYS.history, STORAGE_KEYS.historyEnabled, STORAGE_KEYS.historyDays];
      const stored = await ext.storage.local.get(keys);
      const settings = mergeSettings(stored);
      if (!settings.historyEnabled && !evenIfDisabled) return;
      const now = Date.now();
      const next = mutate(pruneHistory(stored[STORAGE_KEYS.history], settings.historyDays, now), settings.historyDays, now);
      await ext.storage.local.set({ [STORAGE_KEYS.history]: next });
    })
    .catch((error) => console.error("history update failed", error));
  return historyQueue;
}

function canonicalIps(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ips = [];
  for (const raw of value) {
    const parsed = typeof raw === "string" && raw.length <= MAX_MESSAGE_IP_LENGTH ? globalThis.IpTools.parseIp(raw) : null;
    if (!parsed) return null;
    ips.push(parsed.ip);
  }
  return ips;
}

function isValidLookupMessage(message) {
  return (
    typeof message.ip === "string" &&
    message.ip.length > 0 &&
    message.ip.length <= MAX_MESSAGE_IP_LENGTH &&
    (message.refresh === undefined || typeof message.refresh === "boolean")
  );
}

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own content scripts and pages may talk to the worker.
  if (sender.id !== ext.runtime.id || !message || typeof message !== "object") return false;

  switch (message.type) {
    case "lookup":
      if (!isValidLookupMessage(message)) {
        sendResponse({ status: "invalid" });
        return false;
      }
      lookupService
        .lookup({ ip: message.ip, refresh: message.refresh === true })
        .then((response) => {
          if (response?.status === "ok") {
            updateHistory((list, days, now) => addEntry(list, entryFromResult(response, now), days, now));
          }
          sendResponse(response);
        }, (error) => {
          console.error("lookup failed", error);
          sendResponse({ status: "error", code: "internal" });
        });
      return true; // async response
    case "getExportSettings":
      // Template and quick notes live in storage.local, which content scripts cannot read in Chromium.
      ext.storage.local
        .get([STORAGE_KEYS.exportTemplate, STORAGE_KEYS.quickNotes])
        .then((stored) =>
          sendResponse({
            template: globalThis.ExportTools.normalizeTemplate(stored[STORAGE_KEYS.exportTemplate]),
            quickNotes: normalizeQuickNotes(stored[STORAGE_KEYS.quickNotes]),
          }),
        )
        .catch(() => sendResponse({ template: globalThis.ExportTools.normalizeTemplate(null), quickNotes: normalizeQuickNotes(null) }));
      return true;
    case "setHistoryNote": {
      const ips = canonicalIps(message.ips);
      if (!ips || typeof message.note !== "string") return false;
      const note = normalizeNote(message.note);
      updateHistory((list) => setNote(list, ips, note), { evenIfDisabled: true }).then(() => sendResponse({ ok: true }));
      return true;
    }
    case "removeHistory": {
      const ips = message.all === true ? null : canonicalIps(message.ips);
      if (message.all !== true && !ips) return false;
      updateHistory((list) => (ips ? removeEntries(list, ips) : []), { evenIfDisabled: true }).then(() => sendResponse({ ok: true }));
      return true;
    }
    case "getKnownIps":
      // Scores of previously looked-up IPs for on-page highlighting (opt-in).
      ext.storage.local
        .get([STORAGE_KEYS.history, STORAGE_KEYS.historyDays, STORAGE_KEYS.historyEnabled, STORAGE_KEYS.highlightKnown])
        .then((stored) => {
          const settings = mergeSettings(stored);
          if (!settings.highlightKnown) return sendResponse({ enabled: false, scores: {} });
          const scores = {};
          for (const e of pruneHistory(stored[STORAGE_KEYS.history], settings.historyDays, Date.now())) {
            scores[e.ip] = typeof e.data.abuseConfidenceScore === "number" ? e.data.abuseConfidenceScore : null;
          }
          sendResponse({ enabled: true, scores });
        })
        .catch(() => sendResponse({ enabled: false, scores: {} }));
      return true;
    case "openHistory":
      ext.tabs.create({ url: ext.runtime.getURL("src/history/history.html") });
      return false;
    case "openOptions":
      ext.runtime.openOptionsPage();
      return false;
    default:
      return false;
  }
});

// Keyboard shortcut: ask the content script in the active tab to look up its selection.
ext.commands.onCommand.addListener(async (command) => {
  if (command !== "lookup-selection") return;
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  ext.tabs.sendMessage(tab.id, { type: "lookupSelection" }).catch(() => {
    // No content script on this page (site not granted); nothing to do.
  });
});

restrictStorageAccess();

ext.runtime.onInstalled.addListener(syncSafely);
ext.runtime.onStartup.addListener(syncSafely);
ext.permissions.onAdded.addListener(syncSafely);
ext.permissions.onRemoved.addListener(syncSafely);
