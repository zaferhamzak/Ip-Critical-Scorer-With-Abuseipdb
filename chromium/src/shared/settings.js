// Pure settings helpers. No chrome.* usage here so the module is unit-testable in Node.

export const API_ORIGIN_PATTERN = "https://api.abuseipdb.com/*";
// Data source the extension talks to; never treated as a page to inject into.
const DATA_ORIGIN_PATTERNS = new Set([API_ORIGIN_PATTERN]);
export const ALL_SITES_PATTERNS = ["https://*/*", "http://*/*"];

export const CACHE_TTL_MIN_MINUTES = 1;
export const CACHE_TTL_MAX_MINUTES = 1440;

// AbuseIPDB APIv2 accepts maxAgeInDays between 1 and 365; "all time" is not available.
export const MAX_AGE_MIN_DAYS = 1;
export const MAX_AGE_MAX_DAYS = 365;

export const HISTORY_MIN_DAYS = 1;
export const HISTORY_MAX_DAYS = 90;
export const MAX_QUICK_NOTES = 10;
export const MAX_NOTE_LENGTH = 200;

export const DEFAULT_QUICK_NOTES = Object.freeze(["False positive", "Bloklandı", "İzlemeye alındı", "İncelendi, aksiyon yok"]);

export const DEFAULT_SETTINGS = Object.freeze({
  cacheTtlMinutes: 15,
  maxAgeInDays: 365,
  historyEnabled: true,
  historyDays: 7,
  highlightKnown: false,
});

// Storage keys in chrome.storage.local.
export const STORAGE_KEYS = Object.freeze({
  apiKey: "apiKey",
  cacheTtlMinutes: "cacheTtlMinutes",
  maxAgeInDays: "maxAgeInDays",
  exportTemplate: "exportTemplate",
  quickNotes: "quickNotes",
  historyEnabled: "historyEnabled",
  historyDays: "historyDays",
  highlightKnown: "highlightKnown",
  history: "history",
  exportList: "exportList",
  quota: "quota",
});

// Prefix for cached lookup entries in chrome.storage.session.
export const CACHE_KEY_PREFIX = "cache:";

/**
 * Returns an integer TTL in minutes, or null when the value is not acceptable.
 */
export function normalizeCacheTtl(value) {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const minutes = Number(text);
  if (minutes < CACHE_TTL_MIN_MINUTES || minutes > CACHE_TTL_MAX_MINUTES) return null;
  return minutes;
}

/**
 * Returns the report period in days (1..365), or null when the value is not acceptable.
 */
export function normalizeMaxAge(value) {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const days = Number(text);
  if (days < MAX_AGE_MIN_DAYS || days > MAX_AGE_MAX_DAYS) return null;
  return days;
}

/** Returns history retention in days (1..90), or null when the value is not acceptable. */
export function normalizeHistoryDays(value) {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const days = Number(text);
  if (days < HISTORY_MIN_DAYS || days > HISTORY_MAX_DAYS) return null;
  return days;
}

/** Free-text note: single line, trimmed, length-capped. */
export function normalizeNote(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH);
}

/** Quick-note presets: up to 10 unique non-empty lines; falls back to the defaults. */
export function normalizeQuickNotes(value) {
  if (!Array.isArray(value)) return [...DEFAULT_QUICK_NOTES];
  const notes = [];
  for (const item of value) {
    const note = normalizeNote(item).slice(0, 60);
    if (note && !notes.includes(note)) notes.push(note);
    if (notes.length === MAX_QUICK_NOTES) break;
  }
  return notes;
}

/**
 * Returns the trimmed key, or null when it does not look like an API key.
 * AbuseIPDB keys are long alphanumeric tokens; we only reject obviously wrong input
 * (whitespace, control characters, too short/long) and never log the value.
 */
export function normalizeApiKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(key)) return null;
  return key;
}

export function mergeSettings(stored) {
  const ttl = normalizeCacheTtl(stored?.[STORAGE_KEYS.cacheTtlMinutes]);
  const maxAge = normalizeMaxAge(stored?.[STORAGE_KEYS.maxAgeInDays]);
  return {
    cacheTtlMinutes: ttl ?? DEFAULT_SETTINGS.cacheTtlMinutes,
    maxAgeInDays: maxAge ?? DEFAULT_SETTINGS.maxAgeInDays,
    historyEnabled: typeof stored?.[STORAGE_KEYS.historyEnabled] === "boolean" ? stored[STORAGE_KEYS.historyEnabled] : DEFAULT_SETTINGS.historyEnabled,
    historyDays: normalizeHistoryDays(stored?.[STORAGE_KEYS.historyDays]) ?? DEFAULT_SETTINGS.historyDays,
    highlightKnown: stored?.[STORAGE_KEYS.highlightKnown] === true,
    hasApiKey: normalizeApiKey(stored?.[STORAGE_KEYS.apiKey]) !== null,
  };
}

/**
 * Human-readable daily quota from the stored X-RateLimit-* snapshot.
 * Returns null when nothing is known yet. `low` is true below 10% of the limit.
 */
export function describeQuota(quota, now = Date.now()) {
  if (!quota || typeof quota.remaining !== "number") return null;
  const n = new Intl.NumberFormat("tr-TR");
  if (typeof quota.resetAt === "number" && now >= quota.resetAt) {
    return { text: "Kalan hak: yenilendi (yeni sorguda güncellenir)", low: false };
  }
  const limit = typeof quota.limit === "number" ? ` / ${n.format(quota.limit)}` : "";
  const low = typeof quota.limit === "number" && quota.remaining < quota.limit * 0.1;
  return { text: `Kalan hak: ${n.format(quota.remaining)}${limit}`, low };
}

export const SETTINGS_FILE_APP = "ip-critical-scorer";
export const SETTINGS_FILE_VERSION = 1;
const MAX_SETTINGS_FILE = 100_000;

/**
 * Shareable settings file. Never contains the API key or lookup history.
 * `exportTemplate` is validated by the caller (ExportTools lives in a classic script).
 */
export function buildSettingsFile(stored, sitePatterns, now = Date.now()) {
  const merged = mergeSettings(stored);
  return {
    app: SETTINGS_FILE_APP,
    version: SETTINGS_FILE_VERSION,
    exportedAt: new Date(now).toISOString(),
    settings: {
      cacheTtlMinutes: merged.cacheTtlMinutes,
      maxAgeInDays: merged.maxAgeInDays,
      historyEnabled: merged.historyEnabled,
      historyDays: merged.historyDays,
      highlightKnown: merged.highlightKnown,
      quickNotes: normalizeQuickNotes(stored?.[STORAGE_KEYS.quickNotes]),
      exportTemplate: stored?.[STORAGE_KEYS.exportTemplate] ?? null,
    },
    sites: pagePatternsFromGranted(sitePatterns),
  };
}

/** Parses and validates an imported settings file; throws Error with a Turkish message. */
export function parseSettingsFile(text) {
  if (typeof text !== "string" || text.length > MAX_SETTINGS_FILE) throw new Error("Dosya çok büyük ya da okunamadı.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Dosya geçerli bir ayar dosyası değil (JSON okunamadı).");
  }
  if (!data || data.app !== SETTINGS_FILE_APP || data.version !== SETTINGS_FILE_VERSION || typeof data.settings !== "object") {
    throw new Error("Bu dosya IP Critical Scorer ayar dosyası değil.");
  }
  const s = data.settings;
  const settings = {};
  const ttl = normalizeCacheTtl(s.cacheTtlMinutes);
  if (ttl !== null) settings[STORAGE_KEYS.cacheTtlMinutes] = ttl;
  const maxAge = normalizeMaxAge(s.maxAgeInDays);
  if (maxAge !== null) settings[STORAGE_KEYS.maxAgeInDays] = maxAge;
  const days = normalizeHistoryDays(s.historyDays);
  if (days !== null) settings[STORAGE_KEYS.historyDays] = days;
  if (typeof s.historyEnabled === "boolean") settings[STORAGE_KEYS.historyEnabled] = s.historyEnabled;
  if (typeof s.highlightKnown === "boolean") settings[STORAGE_KEYS.highlightKnown] = s.highlightKnown;
  if (Array.isArray(s.quickNotes)) settings[STORAGE_KEYS.quickNotes] = normalizeQuickNotes(s.quickNotes);
  const rawTemplate = s.exportTemplate && typeof s.exportTemplate === "object" ? s.exportTemplate : null;
  const sites = Array.isArray(data.sites)
    ? [...new Set(data.sites.map((x) => (typeof x === "string" ? siteInputToMatchPattern(x.replace(/\/\*$/, "")) : null)).filter(Boolean))].slice(0, 50)
    : [];
  return { settings, rawTemplate, sites };
}

const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const SITE_INPUT_RE = new RegExp(
  "^(?:(https?)://)?" + // optional scheme
    "(\\*\\.)?" + // optional subdomain wildcard
    `(${HOST_LABEL}(?:\\.${HOST_LABEL})*|\\[[0-9a-f:.]+\\])` + // hostname or [IPv6]
    "(?::\\d{1,5})?" + // optional port (match patterns ignore it)
    "/?$",
);

/**
 * Converts user input such as "siem.example.com", "https://*.example.com" or
 * "http://10.0.0.5:8080" into a Chrome match pattern ("https://siem.example.com/*").
 * Returns null for anything that is not a single http(s) host.
 */
export function siteInputToMatchPattern(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase();
  if (text.length === 0 || text.length > 300) return null;
  const m = SITE_INPUT_RE.exec(text);
  if (!m) return null;
  const [, scheme = "https", wildcard = "", host] = m;
  const isIpHost = host.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  if (wildcard && isIpHost) return null;
  return `${scheme}://${wildcard}${host}/*`;
}

/**
 * Splits granted host permissions into page patterns (where the content script may run).
 * The AbuseIPDB API origin is a data source, not a page the user browses for IPs.
 */
export function pagePatternsFromGranted(origins) {
  if (!Array.isArray(origins)) return [];
  return [...new Set(origins.filter((o) => typeof o === "string" && !DATA_ORIGIN_PATTERNS.has(o)))].sort();
}
