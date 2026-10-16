import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LookupError, buildCheckRequest, errorFromResponse, normalizeCheckResponse,
} from "../chromium/src/shared/abuseipdb.js";

const MAX_AGE_IN_DAYS = 365;

const fixture = JSON.parse(readFileSync(new URL("./fixtures/check-response.json", import.meta.url)));
const headers = (obj) => new Headers(obj);

test("buildCheckRequest targets the fixed API endpoint without cookies", () => {
  const { url, init } = buildCheckRequest("2001:db8::1", "SYNTHETIC_KEY_0000000000");
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://api.abuseipdb.com/api/v2/check");
  assert.equal(parsed.searchParams.get("ipAddress"), "2001:db8::1");
  assert.equal(parsed.searchParams.get("maxAgeInDays"), String(MAX_AGE_IN_DAYS));
  assert.equal(parsed.searchParams.has("verbose"), false);
  assert.equal(init.headers.Key, "SYNTHETIC_KEY_0000000000");
  assert.equal(init.headers.Accept, "application/json");
  assert.equal(init.credentials, "omit");
});

test("buildCheckRequest uses the configured period and clamps invalid values to the default", () => {
  const days = (d) => new URL(buildCheckRequest("8.8.8.8", "SYNTHETIC_KEY_0000000000", d).url).searchParams.get("maxAgeInDays");
  assert.equal(days(30), "30");
  assert.equal(days(365), "365");
  assert.equal(days(366), "365");
  assert.equal(days(0), "365");
  assert.equal(days(undefined), "365");
});

test("normalizeCheckResponse maps documented fields", () => {
  const data = normalizeCheckResponse(fixture, "203.0.113.200");
  assert.deepEqual(data, {
    ipAddress: "203.0.113.200", abuseConfidenceScore: 87, totalReports: 42, numDistinctUsers: 17,
    lastReportedAt: "2026-10-15T08:30:00.000Z", countryCode: "NL", isp: "Synthetic Hosting B.V.",
    usageType: "Data Center/Web Hosting/Transit", domain: "synthetic.example", isWhitelisted: false, isTor: false,
    maxAgeInDays: MAX_AGE_IN_DAYS,
  });
});

test("missing or malformed fields become null, never zero", () => {
  const data = normalizeCheckResponse({ data: { ipAddress: "203.0.113.200", abuseConfidenceScore: "87", totalReports: -1, countryCode: "Netherlands", lastReportedAt: "not a date", isp: "  " } }, "203.0.113.200");
  assert.equal(data.abuseConfidenceScore, null);
  assert.equal(data.totalReports, null);
  assert.equal(data.numDistinctUsers, null);
  assert.equal(data.countryCode, null);
  assert.equal(data.lastReportedAt, null);
  assert.equal(data.isp, null);
  assert.equal(data.isTor, null);
  assert.equal(normalizeCheckResponse({ data: { ipAddress: "203.0.113.200", abuseConfidenceScore: 101 } }, "203.0.113.200").abuseConfidenceScore, null);
});

test("normalizeCheckResponse rejects a response for another IP or without data", () => {
  assert.throws(() => normalizeCheckResponse(fixture, "8.8.8.8"), (e) => e instanceof LookupError && e.code === "bad_response");
  assert.throws(() => normalizeCheckResponse({ errors: [] }, "8.8.8.8"), /bad_response/);
  assert.throws(() => normalizeCheckResponse(null, "8.8.8.8"), /bad_response/);
  // Same IPv6 address in another textual form is accepted.
  const v6 = normalizeCheckResponse({ data: { ipAddress: "2001:4860:4860:0:0:0:0:8888" } }, "2001:4860:4860::8888");
  assert.equal(v6.ipAddress, "2001:4860:4860::8888");
});

test("errorFromResponse maps HTTP status codes", () => {
  const now = 1_000_000;
  assert.equal(errorFromResponse(401, headers({}), now).code, "unauthorized");
  assert.equal(errorFromResponse(403, headers({}), now).code, "forbidden");
  assert.equal(errorFromResponse(422, headers({}), now).code, "invalid_request");
  assert.equal(errorFromResponse(503, headers({}), now).code, "server_error");
  assert.equal(errorFromResponse(418, headers({}), now).code, "http_error");
});

test("429 honours Retry-After, then X-RateLimit-Reset, then a default, with a cap", () => {
  const now = 1_700_000_000_000;
  assert.equal(errorFromResponse(429, headers({ "Retry-After": "120" }), now).retryAt, now + 120_000);
  assert.equal(errorFromResponse(429, headers({ "X-RateLimit-Reset": String(now / 1000 + 300) }), now).retryAt, now + 300_000);
  assert.equal(errorFromResponse(429, headers({}), now).retryAt, now + 60_000);
  assert.equal(errorFromResponse(429, headers({ "Retry-After": "9999999" }), now).retryAt, now + 86_400_000);
  assert.equal(errorFromResponse(429, headers({ "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT" }), now).retryAt, now + 60_000);
});
