import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_ORIGIN_PATTERN,
  UPDATE_ORIGIN_PATTERN,
  mergeSettings,
  normalizeApiKey,
  normalizeCacheTtl,
  normalizeMaxAge,
  pagePatternsFromGranted,
  siteInputToMatchPattern,
} from "../src/shared/settings.js";

test("normalizeCacheTtl accepts integers within 1..1440", () => {
  assert.equal(normalizeCacheTtl("15"), 15);
  assert.equal(normalizeCacheTtl(1), 1);
  assert.equal(normalizeCacheTtl(" 1440 "), 1440);
});

test("normalizeCacheTtl rejects out-of-range and non-integer values", () => {
  for (const v of ["0", "1441", "-5", "2.5", "", "abc", null, undefined, "1e3"]) {
    assert.equal(normalizeCacheTtl(v), null, String(v));
  }
});

test("normalizeMaxAge accepts 1..365 days only", () => {
  assert.equal(normalizeMaxAge("365"), 365);
  assert.equal(normalizeMaxAge(1), 1);
  for (const v of ["0", "366", "all", "-1", "2.5", "", null]) assert.equal(normalizeMaxAge(v), null, String(v));
});

test("normalizeApiKey trims and rejects malformed keys", () => {
  const synthetic = "a".repeat(80);
  assert.equal(normalizeApiKey(`  ${synthetic}\n`), synthetic);
  assert.equal(normalizeApiKey("short"), null);
  assert.equal(normalizeApiKey("abc def ghi jkl mno pqr"), null);
  assert.equal(normalizeApiKey(42), null);
});

test("mergeSettings falls back to defaults and never exposes the key", () => {
  assert.deepEqual(mergeSettings({}), { cacheTtlMinutes: 15, maxAgeInDays: 365, hasApiKey: false });
  const merged = mergeSettings({ cacheTtlMinutes: 30, maxAgeInDays: 90, apiKey: "b".repeat(80) });
  assert.deepEqual(merged, { cacheTtlMinutes: 30, maxAgeInDays: 90, hasApiKey: true });
  assert.equal(mergeSettings({ maxAgeInDays: 1000 }).maxAgeInDays, 365);
  assert.equal(mergeSettings({ cacheTtlMinutes: 0 }).cacheTtlMinutes, 15);
});

test("siteInputToMatchPattern builds match patterns", () => {
  assert.equal(siteInputToMatchPattern("siem.example.com"), "https://siem.example.com/*");
  assert.equal(siteInputToMatchPattern("HTTPS://SIEM.Example.com/"), "https://siem.example.com/*");
  assert.equal(siteInputToMatchPattern("https://*.example.com"), "https://*.example.com/*");
  assert.equal(siteInputToMatchPattern("http://10.0.0.5:8080"), "http://10.0.0.5/*");
  assert.equal(siteInputToMatchPattern("localhost"), "https://localhost/*");
});

test("siteInputToMatchPattern rejects unsafe or ambiguous input", () => {
  for (const v of [
    "", "*", "<all_urls>", "file:///etc", "ftp://example.com", "https://example.com/path",
    "https://*.10.0.0.5", "javascript:alert(1)", "exa mple.com", "https://user@example.com", 42,
  ]) {
    assert.equal(siteInputToMatchPattern(v), null, String(v));
  }
});

test("pagePatternsFromGranted excludes the API origin and dedupes", () => {
  assert.deepEqual(
    pagePatternsFromGranted([API_ORIGIN_PATTERN, UPDATE_ORIGIN_PATTERN, "https://b.example/*", "https://a.example/*", "https://a.example/*"]),
    ["https://a.example/*", "https://b.example/*"],
  );
  assert.deepEqual(pagePatternsFromGranted(undefined), []);
});
