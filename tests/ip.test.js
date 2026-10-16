import { test } from "node:test";
import assert from "node:assert/strict";
import "../chromium/src/shared/ip.js";

const { analyzeSelection, parseIp, cleanSelection, detailUrl } = globalThis.IpTools;

test("parses valid IPv4", () => {
  assert.deepEqual(analyzeSelection("8.8.8.8"), {
    ip: "8.8.8.8", version: 4, isPublic: true, category: "public", label: "Genel (public) adres",
  });
  assert.equal(parseIp("255.255.255.254").ip, "255.255.255.254");
});

test("rejects malformed IPv4", () => {
  for (const s of ["256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.2.3.-4", "1. 2.3.4", "a.b.c.d", "", "   ", "1.2.3.4/24"]) {
    assert.equal(analyzeSelection(s), null, s);
  }
});

test("cleans typical SOC selections", () => {
  assert.equal(analyzeSelection(" 8.8.8.8, ").ip, "8.8.8.8");
  assert.equal(analyzeSelection("(8.8.8.8)").ip, "8.8.8.8");
  assert.equal(analyzeSelection("\"8.8.8.8\"").ip, "8.8.8.8");
  assert.equal(analyzeSelection("8.8.8[.]8").ip, "8.8.8.8");
  assert.equal(analyzeSelection("8.8.8.8:443").ip, "8.8.8.8");
  assert.equal(analyzeSelection("[2001:4860:4860::8888]:443").ip, "2001:4860:4860::8888");
  assert.equal(analyzeSelection("8.8.8.8.").ip, "8.8.8.8");
  assert.equal(cleanSelection("x".repeat(101)), null);
});

test("does not accept text that merely contains an IP", () => {
  for (const s of ["src=8.8.8.8", "8.8.8.8 and 1.1.1.1", "host 8.8.8.8", "8.8.8.8\n1.1.1.1"]) {
    assert.equal(analyzeSelection(s), null, s);
  }
});

test("parses and canonicalizes IPv6", () => {
  assert.equal(parseIp("2001:4860:4860:0000:0000:0000:0000:8888").ip, "2001:4860:4860::8888");
  assert.equal(parseIp("2001:DB8:0:0:1:0:0:1").ip, "2001:db8::1:0:0:1");
  assert.equal(parseIp("2606:4700:0:0:0:0:0:1111").ip, "2606:4700::1111");
  assert.equal(parseIp("::").ip, "::");
  assert.equal(parseIp("::1").ip, "::1");
  assert.equal(parseIp("1::").ip, "1::");
  assert.equal(parseIp("::ffff:8.8.8.8").ip, "::ffff:8.8.8.8");
  assert.equal(parseIp("64:ff9b::192.0.2.33").ip, "64:ff9b::c000:221");
  assert.equal(parseIp("1:0:1:0:1:0:1:0").ip, "1:0:1:0:1:0:1:0");
});

test("rejects malformed IPv6", () => {
  for (const s of ["1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1::2::3", "12345::1", "fe80::1%eth0", ":1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8::", "g::1", "::1.2.3"]) {
    assert.equal(parseIp(s), null, s);
  }
});

test("classifies special-purpose IPv4 without marking them public", () => {
  const cases = {
    "0.1.2.3": "this-network", "10.1.2.3": "private", "100.64.0.1": "shared", "100.127.255.255": "shared",
    "127.0.0.1": "loopback", "169.254.10.10": "link-local", "172.16.0.1": "private", "172.31.255.255": "private",
    "192.0.0.8": "ietf", "192.0.2.10": "documentation", "192.168.1.1": "private", "198.18.0.1": "benchmarking",
    "198.19.255.255": "benchmarking", "198.51.100.7": "documentation", "203.0.113.200": "documentation",
    "224.0.0.1": "multicast", "239.255.255.255": "multicast", "240.0.0.1": "reserved", "255.255.255.255": "broadcast",
  };
  for (const [ip, category] of Object.entries(cases)) {
    const r = analyzeSelection(ip);
    assert.equal(r.isPublic, false, ip);
    assert.equal(r.category, category, ip);
  }
});

test("range boundaries stay public", () => {
  for (const ip of ["9.255.255.255", "11.0.0.0", "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.0", "192.167.255.255", "198.20.0.0", "223.255.255.255", "1.1.1.1"]) {
    assert.equal(analyzeSelection(ip).isPublic, true, ip);
  }
});

test("classifies special-purpose IPv6", () => {
  const cases = {
    "::": "unspecified", "::1": "loopback", "::ffff:8.8.8.8": "ipv4-mapped", "64:ff9b::808:808": "nat64",
    "100::1": "discard", "2001:db8::1": "documentation", "2001::1": "ietf", "2002:c000:204::1": "6to4",
    "3fff::1": "documentation", "fc00::1": "unique-local", "fd12:3456::1": "unique-local", "fe80::1": "link-local",
    "fec0::1": "site-local", "ff02::1": "multicast", "4000::1": "reserved", "::2": "reserved",
  };
  for (const [ip, category] of Object.entries(cases)) {
    const r = analyzeSelection(ip);
    assert.equal(r.isPublic, false, ip);
    assert.equal(r.category, category, ip);
  }
  assert.equal(analyzeSelection("2001:4860:4860::8888").isPublic, true);
  assert.equal(analyzeSelection("2a00:1450::1").isPublic, true);
});

test("detailUrl only ever builds the fixed AbuseIPDB check URL", () => {
  assert.equal(detailUrl("8.8.8.8"), "https://www.abuseipdb.com/check/8.8.8.8");
  assert.equal(detailUrl("2001:4860:4860:0::8888"), "https://www.abuseipdb.com/check/2001:4860:4860::8888");
  assert.equal(detailUrl("../../evil"), "https://www.abuseipdb.com/");
});

test("extractIps finds distinct IPs in log text, in order, and skips look-alikes", () => {
  const { extractIps } = globalThis.IpTools;
  const log = `2026-10-16 09:41:07 DENY src=8.8.8.8:443 dst=10.20.4.18 proto=TCP
    09:41:08 ALLOW src=[2001:4860:4860::8888]:53 dst=1.1.1[.]1 mac=aa:bb:cc:dd:ee:ff ver=1.2.3.4.5 again 8.8.8.8
    bad 999.1.1.1 and 01.2.3.4`;
  const { ips, truncated } = extractIps(log);
  assert.deepEqual(ips.map((x) => x.ip), ["8.8.8.8", "10.20.4.18", "2001:4860:4860::8888", "1.1.1.1"]);
  assert.equal(truncated, false);
  assert.equal(ips[1].isPublic, false);
});

test("extractIps caps the result at 50 and reports truncation", () => {
  const { extractIps } = globalThis.IpTools;
  const many = Array.from({ length: 70 }, (_, i) => `1.1.${Math.floor(i / 250)}.${i + 1}`).join(" ");
  const r = extractIps(many);
  assert.equal(r.ips.length, 50);
  assert.equal(r.truncated, true);
  assert.deepEqual(extractIps("no addresses here 12:30:45"), { ips: [], truncated: false });
});

test("findIpTokens returns positions of every valid IP, defanged ones included", () => {
  const { findIpTokens } = globalThis.IpTools;
  const text = "a 8.8.8.8 b 1.1.1[.]1 c 8.8.8.8 d 300.1.1.1";
  const tokens = findIpTokens(text);
  assert.deepEqual(tokens.map((t) => [t.index, t.length, t.analysis.ip]), [[2, 7, "8.8.8.8"], [12, 9, "1.1.1.1"], [24, 7, "8.8.8.8"]]);
  assert.equal(text.slice(12, 21), "1.1.1[.]1");
});
