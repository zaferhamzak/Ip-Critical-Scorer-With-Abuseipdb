// Spreadsheet export: user-defined column template -> one tab-separated row for Excel.
// Classic script publishing `globalThis.ExportTools` (used by the content script, the
// options page, the background script and Node tests). No I/O.
(() => {
  "use strict";

  const MAX_COLUMNS = 30;
  const MAX_TEXT = 100;
  // Custom column values may combine several {alias} placeholders, so they get more room.
  const MAX_VALUE_TEXT = 300;

  // Field catalog: key -> default header, {alias} for custom columns, and how to read it
  // from a lookup result. Every field of the AbuseIPDB check response has an entry.
  const FIELDS = {
    queriedAt: { alias: "queried_at", header: "Sorgu zamanı", get: (r) => formatDateTime(r.fetchedAt) },
    queriedDate: { alias: "date", header: "Sorgu tarihi", get: (r) => formatDate(r.fetchedAt) },
    queriedTime: { alias: "time", header: "Sorgu saati", get: (r) => formatTime(r.fetchedAt) },
    ip: { alias: "ip", header: "IP", get: (r) => r.data.ipAddress },
    ipDefanged: { alias: "ip_defanged", header: "IP (defang)", get: (r) => defang(r.data.ipAddress) },
    ipVersion: { alias: "ip_version", header: "IP sürümü", get: (r) => r.data.ipVersion ?? ipVersionOf(r.data.ipAddress) },
    score: { alias: "score", header: "Abuse skoru", get: (r) => r.data.abuseConfidenceScore },
    risk: { alias: "risk", header: "Risk", get: (r) => riskLabel(r.data.abuseConfidenceScore) },
    totalReports: { alias: "reports", header: "Rapor sayısı", get: (r) => r.data.totalReports },
    distinctUsers: { alias: "users", header: "Kaynak sayısı", get: (r) => r.data.numDistinctUsers },
    lastReportedAt: { alias: "last_reported", header: "Son rapor", get: (r) => formatDateTime(r.data.lastReportedAt) },
    lastReportedDate: { alias: "last_reported_date", header: "Son rapor tarihi", get: (r) => formatDate(r.data.lastReportedAt) },
    countryName: { alias: "country_name", header: "Ülke", get: (r) => countryName(r.data.countryCode) },
    countryCode: { alias: "country", header: "Ülke kodu", get: (r) => r.data.countryCode },
    isp: { alias: "isp", header: "ISP", get: (r) => r.data.isp },
    usageType: { alias: "usage_type", header: "Kullanım türü", get: (r) => r.data.usageType },
    domain: { alias: "domain", header: "Alan adı", get: (r) => r.data.domain },
    hostnames: { alias: "hostnames", header: "Hostname", get: (r) => (Array.isArray(r.data.hostnames) && r.data.hostnames.length ? r.data.hostnames.join(", ") : null) },
    isTor: { alias: "tor", header: "Tor", get: (r) => yesNo(r.data.isTor) },
    isWhitelisted: { alias: "whitelisted", header: "Beyaz liste", get: (r) => yesNo(r.data.isWhitelisted) },
    isPublic: { alias: "public", header: "Genel IP", get: (r) => yesNo(r.data.isPublic) },
    period: { alias: "period", header: "Rapor dönemi (gün)", get: (r) => r.data.maxAgeInDays },
    detailUrl: { alias: "link", header: "AbuseIPDB bağlantısı", get: (r) => r.detailUrl },
    note: { alias: "note", header: "Not", get: (r) => r.note },
  };

  const FIELD_BY_ALIAS = new Map(Object.values(FIELDS).map((f) => [f.alias, f]));
  const ALIAS_RE = /\{([a-z_]+)\}/gi;

  const EMPTY_VALUES = { blank: "", unknown: "Bilinmiyor", dash: "-" };
  const SEPARATORS = { tab: "\t", semicolon: ";" };

  const DEFAULT_TEMPLATE = Object.freeze({
    columns: [
      "queriedAt", "ip", "score", "risk", "totalReports", "distinctUsers",
      "lastReportedAt", "countryName", "isp", "usageType", "domain", "detailUrl", "note",
    ].map((field) => ({ kind: "field", field })),
    empty: "blank",
    separator: "tab",
  });

  let regionNames = null;
  try {
    regionNames = new Intl.DisplayNames(["tr"], { type: "region" });
  } catch {
    regionNames = null;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // dd.MM.yyyy HH:mm in local time; Excel with Turkish locale reads this as a date.
  function formatDateTime(value) {
    if (value === null || value === undefined) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDate(value) {
    return formatDateTime(value)?.slice(0, 10) ?? null;
  }

  function formatTime(value) {
    return formatDateTime(value)?.slice(11) ?? null;
  }

  function ipVersionOf(ip) {
    return typeof ip === "string" ? (ip.includes(":") ? 6 : 4) : null;
  }

  // 203.0.113.45 -> 203[.]0[.]113[.]45, 2001:db8::1 -> 2001[:]db8[:][:]1 (safe to paste in tickets/mail).
  function defang(ip) {
    if (typeof ip !== "string") return null;
    return ip.includes(":") ? ip.replace(/:/g, "[:]") : ip.replace(/\./g, "[.]");
  }

  function riskLabel(score) {
    if (typeof score !== "number") return null;
    if (score >= 75) return "Yüksek";
    if (score >= 25) return "Orta";
    if (score > 0) return "Düşük";
    return "Skor 0";
  }

  function yesNo(value) {
    return value === true ? "Evet" : value === false ? "Hayır" : null;
  }

  function countryName(code) {
    if (!code) return null;
    const name = regionNames?.of(code);
    return name && name !== code ? name : code;
  }

  function cleanText(value, max = MAX_TEXT) {
    if (typeof value !== "string") return "";
    return value.replace(/[\t\r\n]+/g, " ").trim().slice(0, max);
  }

  function normalizeColumn(col) {
    if (!col || typeof col !== "object") return null;
    if (col.kind === "field" && Object.hasOwn(FIELDS, col.field)) {
      const header = cleanText(col.header);
      return header ? { kind: "field", field: col.field, header } : { kind: "field", field: col.field };
    }
    if (col.kind === "custom") {
      return { kind: "custom", header: cleanText(col.header) || "Özel", value: cleanText(col.value, MAX_VALUE_TEXT) };
    }
    return null;
  }

  /** Validates stored data; anything unusable falls back to the default template. */
  function normalizeTemplate(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.columns)) return structuredClone(DEFAULT_TEMPLATE);
    const columns = raw.columns.map(normalizeColumn).filter(Boolean).slice(0, MAX_COLUMNS);
    if (columns.length === 0) return structuredClone(DEFAULT_TEMPLATE);
    return {
      columns,
      empty: Object.hasOwn(EMPTY_VALUES, raw.empty) ? raw.empty : DEFAULT_TEMPLATE.empty,
      separator: Object.hasOwn(SEPARATORS, raw.separator) ? raw.separator : DEFAULT_TEMPLATE.separator,
    };
  }

  function columnHeader(col) {
    return col.kind === "field" ? col.header || FIELDS[col.field].header : col.header;
  }

  // Text that Excel would treat as a formula (=, +, -, @) is prefixed with an apostrophe.
  // Numbers from the API are passed through as numbers.
  function cell(value, template) {
    let text;
    if (value === null || value === undefined || value === "") text = EMPTY_VALUES[template.empty];
    else if (typeof value === "number") return String(value);
    else text = String(value);
    text = text.replace(/[\t\r\n]+/g, " ");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (template.separator === "semicolon" && /[;"]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function emptyText(value, template) {
    return value === null || value === undefined || value === "" ? EMPTY_VALUES[template.empty] : String(value);
  }

  /**
   * Replaces {alias} placeholders in a custom column with the result's values.
   * Unknown aliases stay as typed so a typo is visible in the preview.
   */
  function fillAliases(text, result, template) {
    if (!text.includes("{")) return text;
    return text.replace(ALIAS_RE, (match, name) => {
      const field = FIELD_BY_ALIAS.get(name.toLowerCase());
      return field ? emptyText(field.get(result), template) : match;
    });
  }

  /** Aliases in a text that do not exist, for warnings in the editor. */
  function unknownAliases(text) {
    if (typeof text !== "string") return [];
    return [...new Set([...text.matchAll(ALIAS_RE)].map((m) => m[1].toLowerCase()).filter((a) => !FIELD_BY_ALIAS.has(a)))];
  }

  function join(cells, template) {
    return cells.join(SEPARATORS[template.separator]);
  }

  function buildHeader(rawTemplate) {
    const template = normalizeTemplate(rawTemplate);
    return join(template.columns.map((c) => cell(columnHeader(c), template)), template);
  }

  /** @param result a lookup response with status "ok" */
  function buildRow(rawTemplate, result) {
    const template = normalizeTemplate(rawTemplate);
    const values = template.columns.map((col) =>
      col.kind === "field" ? FIELDS[col.field].get(result) : fillAliases(col.value, result, template),
    );
    return join(values.map((v) => cell(v, template)), template);
  }

  /** Several results -> several lines; Excel pastes each line into its own row. */
  function buildRows(rawTemplate, results) {
    return results.map((r) => buildRow(rawTemplate, r)).join("\n");
  }

  const FIELD_LIST = Object.entries(FIELDS).map(([key, f]) => ({ key, alias: f.alias, header: f.header }));

  globalThis.ExportTools = Object.freeze({
    MAX_COLUMNS,
    MAX_VALUE_TEXT,
    FIELD_LIST,
    EMPTY_VALUES,
    DEFAULT_TEMPLATE,
    normalizeTemplate,
    columnHeader,
    buildHeader,
    buildRow,
    buildRows,
    unknownAliases,
    formatDateTime,
  });
})();
