import { test } from "node:test";
import assert from "node:assert/strict";
import "../chromium/src/shared/export.js";

const T = globalThis.ExportTools;

const result = {
  status: "ok",
  fetchedAt: new Date(2026, 9, 16, 9, 41).getTime(),
  detailUrl: "https://www.abuseipdb.com/check/203.0.113.45",
  data: {
    ipAddress: "203.0.113.45", abuseConfidenceScore: 92, totalReports: 214, numDistinctUsers: 61,
    lastReportedAt: new Date(2026, 9, 16, 8, 12).toISOString(), countryCode: "NL", isp: "Example Hosting B.V.",
    usageType: "Data Center/Web Hosting/Transit", domain: "example-hosting.test", isTor: false, isWhitelisted: null,
    maxAgeInDays: 365,
  },
};

test("default template produces one tab-separated row matching the header", () => {
  const header = T.buildHeader(null).split("\t");
  const row = T.buildRow(null, result).split("\t");
  assert.equal(header.length, row.length);
  assert.deepEqual(header.slice(0, 4), ["Sorgu zamanı", "IP", "Abuse skoru", "Risk"]);
  assert.deepEqual(row.slice(0, 4), ["16.10.2026 09:41", "203.0.113.45", "92", "Yüksek"]);
  assert.ok(!T.buildRow(null, result).includes("\n"));
});

test("custom columns, header overrides and order are respected", () => {
  const template = {
    columns: [
      { kind: "custom", header: "Analist", value: "Zafer" },
      { kind: "field", field: "ip", header: "Kaynak IP" },
      { kind: "custom", header: "Ticket", value: "" },
      { kind: "field", field: "countryName" },
      { kind: "field", field: "isTor" },
      { kind: "field", field: "isWhitelisted" },
    ],
    empty: "dash",
    separator: "tab",
  };
  assert.equal(T.buildHeader(template), "Analist\tKaynak IP\tTicket\tÜlke\tTor\tBeyaz liste");
  // Empty custom value and unknown whitelist use the configured empty marker ("-", prefixed so Excel keeps it as text).
  assert.equal(T.buildRow(template, result), "Zafer\t203.0.113.45\t'-\tHollanda\tHayır\t'-");
});

test("formula-like text is neutralised and tabs/newlines cannot break the row", () => {
  const evil = structuredClone(result);
  evil.data.isp = "=HYPERLINK(\"http://evil.example\")";
  evil.data.domain = "a\tb\nc";
  const template = { columns: [{ kind: "field", field: "isp" }, { kind: "field", field: "domain" }], empty: "blank", separator: "tab" };
  assert.equal(T.buildRow(template, evil), "'=HYPERLINK(\"http://evil.example\")\ta b c");
  const custom = { columns: [{ kind: "custom", header: "+cmd", value: "@SUM(1)" }], empty: "blank", separator: "tab" };
  assert.equal(T.buildHeader(custom), "'+cmd");
  assert.equal(T.buildRow(custom, result), "'@SUM(1)");
});

test("semicolon separator quotes cells that contain the separator", () => {
  const t = { columns: [{ kind: "custom", header: "Not", value: "a;b" }, { kind: "field", field: "score" }], empty: "blank", separator: "semicolon" };
  assert.equal(T.buildRow(t, result), "\"a;b\";92");
});

test("missing values follow the empty setting and are never invented", () => {
  const sparse = { ...result, data: { ...result.data, isp: null, totalReports: null, lastReportedAt: null, abuseConfidenceScore: null } };
  const t = (empty) => ({ columns: ["isp", "totalReports", "lastReportedAt", "score", "risk"].map((field) => ({ kind: "field", field })), empty, separator: "tab" });
  assert.equal(T.buildRow(t("blank"), sparse), "\t\t\t\t");
  assert.equal(T.buildRow(t("unknown"), sparse), "Bilinmiyor\tBilinmiyor\tBilinmiyor\tBilinmiyor\tBilinmiyor");
  const zero = { ...result, data: { ...result.data, abuseConfidenceScore: 0 } };
  assert.equal(T.buildRow({ columns: [{ kind: "field", field: "score" }, { kind: "field", field: "risk" }], empty: "blank", separator: "tab" }, zero), "0\tSkor 0");
});

test("normalizeTemplate drops unknown fields and falls back to the default", () => {
  assert.deepEqual(T.normalizeTemplate(undefined), T.DEFAULT_TEMPLATE);
  assert.deepEqual(T.normalizeTemplate({ columns: [] }), T.DEFAULT_TEMPLATE);
  const n = T.normalizeTemplate({
    columns: [{ kind: "field", field: "__proto__" }, { kind: "field", field: "ip" }, { kind: "script", field: "x" }, { kind: "custom", header: "", value: "x".repeat(500) }],
    empty: "bogus",
    separator: "pipe",
  });
  assert.deepEqual(n.columns.map((c) => c.kind), ["field", "custom"]);
  assert.equal(n.columns[1].header, "Özel");
  assert.equal(n.columns[1].value.length, T.MAX_VALUE_TEXT);
  assert.equal(n.empty, "blank");
  assert.equal(n.separator, "tab");
  const many = { columns: Array.from({ length: 50 }, () => ({ kind: "field", field: "ip" })) };
  assert.equal(T.normalizeTemplate(many).columns.length, T.MAX_COLUMNS);
});

test("defanged IP and hostname fields", () => {
  const t = { columns: [{ kind: "field", field: "ipDefanged" }, { kind: "field", field: "hostnames" }], empty: "blank", separator: "tab" };
  const withHosts = { ...result, data: { ...result.data, hostnames: ["mail.example-hosting.test", "www.example-hosting.test"] } };
  assert.equal(T.buildRow(t, withHosts), "203[.]0[.]113[.]45\tmail.example-hosting.test, www.example-hosting.test");
  const v6 = { ...result, data: { ...result.data, ipAddress: "2001:db8::1", hostnames: [] } };
  assert.equal(T.buildRow(t, v6), "2001[:]db8[:][:]1\t");
});

test("custom columns fill {alias} placeholders and keep unknown ones visible", () => {
  const template = {
    columns: [
      { kind: "custom", header: "Özet", value: "{ip} | Skor {score} | {country_name} | {isp}" },
      { kind: "custom", header: "Eksik", value: "{IP} {whitelisted} {note} {nope}" },
      { kind: "custom", header: "Tarih", value: "{date} {time} v{ip_version}" },
    ],
    empty: "dash",
    separator: "tab",
  };
  const row = T.buildRow(template, { ...result, note: "" }).split("\t");
  assert.equal(row[0], "203.0.113.45 | Skor 92 | Hollanda | Example Hosting B.V.");
  assert.equal(row[1], "203.0.113.45 - - {nope}");
  assert.equal(row[2], "16.10.2026 09:41 v4");
  assert.deepEqual(T.unknownAliases("{ip}{Nope}{x}{x}"), ["nope", "x"]);
});

test("every field has a unique alias and alias text cannot start a formula", () => {
  const aliases = T.FIELD_LIST.map((f) => f.alias);
  assert.equal(new Set(aliases).size, aliases.length);
  assert.ok(aliases.every((a) => /^[a-z_]+$/.test(a)));
  const evil = { ...result, data: { ...result.data, isp: "=HYPERLINK(\"x\")" } };
  const row = T.buildRow({ columns: [{ kind: "custom", header: "x", value: "{isp}" }] }, evil);
  assert.ok(row.startsWith("'="));
});
