// Lookup orchestration: validation, cache, request coalescing, rate-limit backoff.
// Dependencies are injected so the logic can be tested without Chrome.

import "../shared/ip.js";
import {
  LookupError,
  buildCheckRequest,
  readQuota,
  errorFromResponse,
  normalizeCheckResponse,
} from "../shared/abuseipdb.js";
import { CACHE_KEY_PREFIX, STORAGE_KEYS, mergeSettings, normalizeApiKey } from "../shared/settings.js";

const { analyzeSelection, detailUrl } = globalThis.IpTools;

export const RATE_LIMIT_STATE_KEY = "state:rateLimitedUntil";
export const MIN_REFRESH_INTERVAL_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * @param {object} deps
 * @param {Function} deps.fetchFn  fetch-compatible function
 * @param {object} deps.localArea  storage.local-like ({get,set,remove})
 * @param {object} deps.sessionArea storage.session-like
 * @param {Function} [deps.now]
 * @param {number} [deps.timeoutMs]
 */
export function createLookupService({ fetchFn, localArea, sessionArea, now = Date.now, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const inflight = new Map();

  async function readSettings() {
    const stored = await localArea.get([STORAGE_KEYS.apiKey, STORAGE_KEYS.cacheTtlMinutes, STORAGE_KEYS.maxAgeInDays]);
    return { ...mergeSettings(stored), apiKey: normalizeApiKey(stored?.[STORAGE_KEYS.apiKey]) };
  }

  async function readCache(ip, ttlMs, maxAgeInDays) {
    const key = CACHE_KEY_PREFIX + ip;
    const entry = (await sessionArea.get(key))?.[key];
    if (!entry || typeof entry.fetchedAt !== "number" || !entry.data) return null;
    // A cached answer for another report period does not answer this question.
    if (entry.data.maxAgeInDays !== maxAgeInDays) return null;
    if (now() - entry.fetchedAt >= ttlMs || entry.fetchedAt > now()) {
      await sessionArea.remove(key);
      return null;
    }
    return entry;
  }

  async function writeCache(ip, data, fetchedAt) {
    await sessionArea.set({ [CACHE_KEY_PREFIX + ip]: { data, fetchedAt } });
  }

  async function fetchFromApi(ip, apiKey, maxAgeInDays) {
    const { url, init } = buildCheckRequest(ip, apiKey, maxAgeInDays);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchFn(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw new LookupError(controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429) {
      const limit = Number(response.headers?.get?.("X-RateLimit-Limit"));
      const error = errorFromResponse(response.status, response.headers, now());
      await writeQuota({ limit: Number.isInteger(limit) && limit > 0 ? limit : null, remaining: 0, resetAt: error.retryAt, updatedAt: now() });
      throw error;
    }
    if (!response.ok) throw errorFromResponse(response.status, response.headers, now());
    let body;
    try {
      body = await response.json();
    } catch {
      throw new LookupError("bad_response");
    }
    const data = normalizeCheckResponse(body, ip, maxAgeInDays);
    const quota = readQuota(response.headers, now());
    if (quota) await writeQuota(quota);
    return data;
  }

  async function writeQuota(quota) {
    await localArea.set({ [STORAGE_KEYS.quota]: quota });
  }

  async function readStoredQuota() {
    const quota = (await localArea.get(STORAGE_KEYS.quota))?.[STORAGE_KEYS.quota];
    return quota && typeof quota.remaining === "number" ? quota : null;
  }

  async function runFetch(ip, apiKey, maxAgeInDays) {
    try {
      const data = await fetchFromApi(ip, apiKey, maxAgeInDays);
      const fetchedAt = now();
      await writeCache(ip, data, fetchedAt);
      return { status: "ok", data, fetchedAt, fromCache: false };
    } catch (error) {
      const code = error instanceof LookupError ? error.code : "internal";
      if (code === "rate_limited" && error.retryAt) {
        await sessionArea.set({ [RATE_LIMIT_STATE_KEY]: error.retryAt });
      }
      return { status: "error", code, retryAt: error?.retryAt ?? null };
    }
  }

  /**
   * @param {{ip: string, refresh?: boolean}} request  `ip` is the raw selected text
   */
  async function lookup({ ip: rawIp, refresh = false }) {
    const analysis = analyzeSelection(rawIp);
    if (!analysis) return { status: "invalid" };

    const base = { ip: analysis.ip, detailUrl: detailUrl(analysis.ip) };
    if (!analysis.isPublic) {
      return { ...base, status: "local", category: analysis.category, label: analysis.label };
    }

    const settings = await readSettings();
    if (!settings.apiKey) return { ...base, status: "no_key" };

    const ttlMs = settings.cacheTtlMinutes * 60_000;
    const cached = await readCache(analysis.ip, ttlMs, settings.maxAgeInDays);
    if (cached && (!refresh || now() - cached.fetchedAt < MIN_REFRESH_INTERVAL_MS)) {
      return { ...base, status: "ok", data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, ttlMinutes: settings.cacheTtlMinutes, quota: await readStoredQuota() };
    }

    const blockedUntil = (await sessionArea.get(RATE_LIMIT_STATE_KEY))?.[RATE_LIMIT_STATE_KEY];
    if (typeof blockedUntil === "number" && blockedUntil > now()) {
      return { ...base, status: "error", code: "rate_limited", retryAt: blockedUntil };
    }

    const inflightKey = `${analysis.ip}|${settings.maxAgeInDays}`;
    let pending = inflight.get(inflightKey);
    if (!pending) {
      pending = runFetch(analysis.ip, settings.apiKey, settings.maxAgeInDays).finally(() => inflight.delete(inflightKey));
      inflight.set(inflightKey, pending);
    }
    const result = await pending;
    return { ...base, ...result, ttlMinutes: settings.cacheTtlMinutes, quota: await readStoredQuota() };
  }

  return { lookup };
}
