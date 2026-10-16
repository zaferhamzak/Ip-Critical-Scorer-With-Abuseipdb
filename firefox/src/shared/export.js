// Spreadsheet export: user-defined column template -> one tab-separated row for Excel.
// Classic script publishing `globalThis.ExportTools` (used by the content script, the
// options page, the background script and Node tests). No I/O.
(() => {
  "use strict";

  const MAX_COLUMNS = 30;
  const MAX_TEXT = 100;

  // Field catalog: key -> default header and how to read it from a lookup result.
  const FIELDS = {
    queriedAt: { header: "Sorgu zamanı", get: (r) => formatDateTime(r.fetchedAt) },
    ip: { header: "IP", get: (r) => r.data.ipAddress },
    score: { header: "Abuse skoru", get: (r) => r.data.abuseConfidenceScore },
    risk: { header: "Risk", get: (r) => riskLabel(r.data.abuseConfidenceScore) },
    totalReports: { header: "Rapor sayısı", get: (r) => r.data.totalReports },
    distinctUsers: { header: "Kaynak sayısı", get: (r) => r.data.numDistinctUsers },
    lastReportedAt: { header: "Son rapor", get: (r) => formatDateTime(r.data.lastReportedAt) },
    countryName: { header: "Ülke", get: (r) => countryName(r.data.countryCode) },
    countryCode: { header: "Ülke kodu", get: (r) => r.data.countryCode },
    isp: { header: "ISP", get: (r) => r.data.isp },
    usageType: { header: "Kullanım türü", get: (r) => r.data.usageType },
    domain: { header: "Alan adı", get: (r) => r.data.domain },
    isTor: { header: "Tor", get: (r) => yesNo(r.data.isTor) },
    isWhitelisted: { header: "Beyaz liste", get: (r) => yesNo(r.data.isWhitelisted) },
    period: { header: "Rapor dönemi (gün)", get: (r) => r.data.maxAgeInDays },
    detailUrl: { header: "AbuseIPDB bağlantısı", get: (r) => r.detailUrl },
    note: { header: "Not", get: (r) => r.note },
  };

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

  function cleanText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/[\t\r\n]+/g, " ").trim().slice(0, MAX_TEXT);
  }

  function normalizeColumn(col) {
    if (!col || typeof col !== "object") return null;
    if (col.kind === "field" && Object.hasOwn(FIELDS, col.field)) {
      const header = cleanText(col.header);
      return header ? { kind: "field", field: col.field, header } : { kind: "field", field: col.field };
    }
    if (col.kind === "custom") {
      return { kind: "custom", header: cleanText(col.header) || "Özel", value: cleanText(col.value) };
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
      col.kind === "field" ? FIELDS[col.field].get(result) : col.value,
    );
    return join(values.map((v) => cell(v, template)), template);
  }

  const FIELD_LIST = Object.entries(FIELDS).map(([key, f]) => ({ key, header: f.header }));

  globalThis.ExportTools = Object.freeze({
    MAX_COLUMNS,
    FIELD_LIST,
    EMPTY_VALUES,
    DEFAULT_TEMPLATE,
    normalizeTemplate,
    columnHeader,
    buildHeader,
    buildRow,
    formatDateTime,
  });
})();
