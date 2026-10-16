// AbuseIPDB APIv2 `check` adapter: request building, response normalization, error mapping.
// Pure functions; the caller supplies fetch and the clock.

import "./ip.js";
import { DEFAULT_SETTINGS, normalizeMaxAge } from "./settings.js";

const { parseIp } = globalThis.IpTools;

export const API_CHECK_URL = "https://api.abuseipdb.com/api/v2/check";

const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 24 * 60 * 60;

export class LookupError extends Error {
  constructor(code, { retryAt = null, status = null } = {}) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
    this.status = status;
  }
}

export function buildCheckRequest(ip, apiKey, maxAgeInDays = DEFAULT_SETTINGS.maxAgeInDays) {
  const days = normalizeMaxAge(maxAgeInDays) ?? DEFAULT_SETTINGS.maxAgeInDays;
  const params = new URLSearchParams({ ipAddress: ip, maxAgeInDays: String(days) });
  return {
    url: `${API_CHECK_URL}?${params}`,
    init: {
      method: "GET",
      headers: { Key: apiKey, Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    },
  };
}

function nonNegativeInt(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function text(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function bool(value) {
  return typeof value === "boolean" ? value : null;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * Maps the API's `data` object to the fields the card shows. Unknown or malformed
 * values become null (shown as "unknown"); nothing is defaulted to zero.
 */
export function normalizeCheckResponse(body, requestedIp, maxAgeInDays = DEFAULT_SETTINGS.maxAgeInDays) {
  const data = body && typeof body === "object" ? body.data : null;
  if (!data || typeof data !== "object") throw new LookupError("bad_response");

  const returned = parseIp(typeof data.ipAddress === "string" ? data.ipAddress : "");
  const requested = parseIp(requestedIp);
  if (!returned || !requested || returned.ip !== requested.ip) throw new LookupError("bad_response");

  // Validate before any truncation so "Netherlands" cannot become "NE".
  const countryCode = text(data.countryCode, 10);
  return {
    ipAddress: requested.ip,
    abuseConfidenceScore: nonNegativeInt(data.abuseConfidenceScore, 100),
    totalReports: nonNegativeInt(data.totalReports),
    numDistinctUsers: nonNegativeInt(data.numDistinctUsers),
    lastReportedAt: isoDate(data.lastReportedAt),
    countryCode: countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode.toUpperCase() : null,
    isp: text(data.isp),
    usageType: text(data.usageType),
    domain: text(data.domain),
    isWhitelisted: bool(data.isWhitelisted),
    isTor: bool(data.isTor),
    maxAgeInDays,
  };
}

function headerNumber(headers, name) {
  const raw = headers?.get?.(name);
  if (raw === null || raw === undefined || !/^\d+$/.test(String(raw).trim())) return null;
  return Number(raw);
}

/**
 * Daily quota from the X-RateLimit-* headers AbuseIPDB sends with every check response.
 * Returns null when the headers are missing (e.g. not exposed to the caller).
 */
export function readQuota(headers, now) {
  const limit = headerNumber(headers, "X-RateLimit-Limit");
  const remaining = headerNumber(headers, "X-RateLimit-Remaining");
  if (limit === null || remaining === null) return null;
  const resetEpoch = headerNumber(headers, "X-RateLimit-Reset");
  return { limit, remaining: Math.min(remaining, limit), resetAt: resetEpoch === null ? null : resetEpoch * 1000, updatedAt: now };
}

/** Converts a non-2xx response into a LookupError. */
export function errorFromResponse(status, headers, now) {
  switch (true) {
    case status === 401:
      return new LookupError("unauthorized", { status });
    case status === 403:
      return new LookupError("forbidden", { status });
    case status === 422:
      return new LookupError("invalid_request", { status });
    case status === 429: {
      let seconds = headerNumber(headers, "Retry-After");
      const resetEpoch = headerNumber(headers, "X-RateLimit-Reset");
      if (seconds === null && resetEpoch !== null) seconds = Math.max(0, resetEpoch - Math.floor(now / 1000));
      if (seconds === null) seconds = DEFAULT_RETRY_AFTER_SECONDS;
      seconds = Math.min(Math.max(seconds, 1), MAX_BACKOFF_SECONDS);
      return new LookupError("rate_limited", { status, retryAt: now + seconds * 1000 });
    }
    case status >= 500:
      return new LookupError("server_error", { status });
    default:
      return new LookupError("http_error", { status });
  }
}
