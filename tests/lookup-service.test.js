import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLookupService, RATE_LIMIT_STATE_KEY, MIN_REFRESH_INTERVAL_MS } from "../chromium/src/background/lookup-service.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/check-response.json", import.meta.url)));
const PUBLIC_IP = "8.8.8.8";
const KEY = "SYNTHETIC_KEY_" + "0".repeat(40);

function memoryArea(initial = {}) {
  const store = { ...initial };
  return {
    store,
    async get(keys) {
      if (keys === null) return { ...store };
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
    },
    async set(items) { Object.assign(store, structuredClone(items)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k]; },
  };
}

function jsonResponse(body, status = 200, hdrs = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...hdrs } });
}

function responseFor(ip) {
  return { data: { ...fixture.data, ipAddress: ip } };
}

function setup({ apiKey = KEY, ttl, fetchImpl, now } = {}) {
  const calls = [];
  const clock = { t: 1_700_000_000_000 };
  const local = memoryArea({ ...(apiKey ? { apiKey } : {}), ...(ttl ? { cacheTtlMinutes: ttl } : {}) });
  const session = memoryArea();
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return fetchImpl ? fetchImpl(url, init) : jsonResponse(responseFor(new URL(url).searchParams.get("ipAddress")));
  };
  const service = createLookupService({ fetchFn, localArea: local, sessionArea: session, now: now ?? (() => clock.t), timeoutMs: 50 });
  return { service, calls, clock, local, session };
}

test("invalid and private selections never hit the network", async () => {
  const { service, calls } = setup();
  assert.equal((await service.lookup({ ip: "not an ip" })).status, "invalid");
  for (const ip of ["10.0.0.1", "192.168.1.10", "127.0.0.1", "fe80::1", "::1", "100.64.1.1", "203.0.113.5"]) {
    const r = await service.lookup({ ip });
    assert.equal(r.status, "local", ip);
  }
  assert.equal(calls.length, 0);
});

test("without an API key a public IP returns no_key and no request", async () => {
  const { service, calls } = setup({ apiKey: null });
  const r = await service.lookup({ ip: PUBLIC_IP });
  assert.equal(r.status, "no_key");
  assert.equal(r.detailUrl, "https://www.abuseipdb.com/check/8.8.8.8");
  assert.equal(calls.length, 0);
});

test("successful lookup sends only the IP and is cached for the TTL", async () => {
  const { service, calls, clock } = setup({ ttl: 15 });
  const first = await service.lookup({ ip: PUBLIC_IP });
  assert.equal(first.status, "ok");
  assert.equal(first.fromCache, false);
  assert.equal(first.data.abuseConfidenceScore, 87);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Key, KEY);
  assert.deepEqual([...new URL(calls[0].url).searchParams.keys()].sort(), ["ipAddress", "maxAgeInDays"]);

  clock.t += 14 * 60_000;
  const second = await service.lookup({ ip: PUBLIC_IP });
  assert.equal(second.fromCache, true);
  assert.equal(second.fetchedAt, first.fetchedAt);
  assert.equal(calls.length, 1);

  assert.equal(new URL(calls[0].url).searchParams.get("maxAgeInDays"), "365");

  clock.t += 2 * 60_000; // past 15 minutes
  const third = await service.lookup({ ip: PUBLIC_IP });
  assert.equal(third.fromCache, false);
  assert.equal(calls.length, 2);
});

test("refresh bypasses the cache but not within the minimum interval", async () => {
  const { service, calls, clock } = setup();
  await service.lookup({ ip: PUBLIC_IP });
  clock.t += MIN_REFRESH_INTERVAL_MS - 1;
  assert.equal((await service.lookup({ ip: PUBLIC_IP, refresh: true })).fromCache, true);
  clock.t += 2;
  assert.equal((await service.lookup({ ip: PUBLIC_IP, refresh: true })).fromCache, false);
  assert.equal(calls.length, 2);
});

test("changing the report period does not reuse a cached answer for another period", async () => {
  const { service, calls, local } = setup();
  assert.equal((await service.lookup({ ip: PUBLIC_IP })).data.maxAgeInDays, 365);
  await local.set({ maxAgeInDays: 30 });
  const r = await service.lookup({ ip: PUBLIC_IP });
  assert.equal(r.fromCache, false);
  assert.equal(r.data.maxAgeInDays, 30);
  assert.equal(new URL(calls[1].url).searchParams.get("maxAgeInDays"), "30");
});

test("cache survives a service (worker) restart via session storage", async () => {
  const a = setup();
  await a.service.lookup({ ip: PUBLIC_IP });
  const restarted = createLookupService({
    fetchFn: async () => { throw new Error("should not fetch"); },
    localArea: a.local, sessionArea: a.session, now: () => a.clock.t,
  });
  assert.equal((await restarted.lookup({ ip: PUBLIC_IP })).fromCache, true);
});

test("concurrent lookups for the same IP are coalesced", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { service, calls } = setup({ fetchImpl: async (url) => { await gate; return jsonResponse(responseFor(new URL(url).searchParams.get("ipAddress"))); } });
  const p = Promise.all([service.lookup({ ip: PUBLIC_IP }), service.lookup({ ip: " 8.8.8.8 " }), service.lookup({ ip: PUBLIC_IP })]);
  await new Promise((r) => setTimeout(r, 5));
  release();
  const results = await p;
  assert.equal(calls.length, 1);
  assert.ok(results.every((r) => r.status === "ok"));
});

test("429 stores a backoff that blocks further requests until it expires", async () => {
  let status = 429;
  const { service, calls, clock, session } = setup({
    fetchImpl: async (url) => (status === 429 ? jsonResponse({ errors: [{ detail: "x", status: 429 }] }, 429, { "Retry-After": "120" }) : jsonResponse(responseFor(new URL(url).searchParams.get("ipAddress")))),
  });
  const first = await service.lookup({ ip: PUBLIC_IP });
  assert.equal(first.status, "error");
  assert.equal(first.code, "rate_limited");
  assert.equal(first.retryAt, clock.t + 120_000);
  assert.equal(session.store[RATE_LIMIT_STATE_KEY], clock.t + 120_000);

  const blocked = await service.lookup({ ip: "1.1.1.1" });
  assert.equal(blocked.code, "rate_limited");
  assert.equal(calls.length, 1);

  status = 200;
  clock.t += 121_000;
  assert.equal((await service.lookup({ ip: "1.1.1.1" })).status, "ok");
  assert.equal(calls.length, 2);
});

test("HTTP, network, timeout and malformed responses map to error codes and are not cached", async () => {
  const cases = [
    [async () => jsonResponse({ errors: [] }, 401), "unauthorized"],
    [async () => jsonResponse({ errors: [] }, 403), "forbidden"],
    [async () => jsonResponse({ errors: [] }, 500), "server_error"],
    [async () => { throw new TypeError("Failed to fetch"); }, "network"],
    [(url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))), "timeout"],
    [async () => new Response("<html>challenge</html>", { status: 200 }), "bad_response"],
    [async () => jsonResponse({ data: { ...fixture.data, ipAddress: "9.9.9.9" } }), "bad_response"],
  ];
  for (const [fetchImpl, code] of cases) {
    const { service, session } = setup({ fetchImpl });
    const r = await service.lookup({ ip: PUBLIC_IP });
    assert.equal(r.status, "error", code);
    assert.equal(r.code, code);
    assert.equal(Object.keys(session.store).filter((k) => k.startsWith("cache:")).length, 0, code);
  }
});
