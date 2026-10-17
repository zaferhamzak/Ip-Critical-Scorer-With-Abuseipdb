// Options page editor for the Excel export template (globalThis.ExportTools from shared/export.js).

import { ext } from "../shared/ext.js";
import { STORAGE_KEYS, normalizeQuickNotes } from "../shared/settings.js";

const tools = globalThis.ExportTools;
const $ = (id) => document.getElementById(id);

// Synthetic sample for the preview; documentation-range IP, not real data.
const SAMPLE = {
  status: "ok",
  fetchedAt: Date.now(),
  detailUrl: "https://www.abuseipdb.com/check/203.0.113.45",
  data: {
    ipAddress: "203.0.113.45", abuseConfidenceScore: 92, totalReports: 214, numDistinctUsers: 61,
    lastReportedAt: new Date(Date.now() - 3600_000).toISOString(), countryCode: "NL", isp: "Example Hosting B.V.",
    usageType: "Data Center/Web Hosting/Transit", domain: "example-hosting.test", hostnames: ["host-45.example-hosting.test"],
    isTor: false, isWhitelisted: false, ipVersion: 4, isPublic: true, maxAgeInDays: 365,
  },
  note: "False positive",
};

let template = tools.normalizeTemplate(null);
let dirty = false;
// Custom value input that alias buttons insert into (the last one the user touched).
let aliasTarget = null;

function setStatus(text) {
  $("export-status").textContent = text;
}

function setDirty(value) {
  dirty = value;
  // The save bar follows the viewport only while there is something to save.
  document.querySelector(".action-bar")?.classList.toggle("dirty", value);
}

function markDirty() {
  setDirty(true);
  const unknown = [...new Set(template.columns.flatMap((c) => (c.kind === "custom" ? tools.unknownAliases(c.value) : [])))];
  setStatus(unknown.length
    ? `Kaydedilmemiş değişiklik var. Tanınmayan alias: ${unknown.map((a) => `{${a}}`).join(", ")} (olduğu gibi yazılır).`
    : "Kaydedilmemiş değişiklik var.");
  renderPreview();
}

function el(tag, props = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (text !== undefined) node.textContent = text;
  return node;
}

function fieldName(key) {
  return tools.FIELD_LIST.find((f) => f.key === key)?.header ?? key;
}

function move(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= template.columns.length) return;
  const [col] = template.columns.splice(index, 1);
  template.columns.splice(target, 0, col);
  renderColumns();
  markDirty();
  $("export-columns").children[target]?.querySelector(delta < 0 ? ".up" : ".down")?.focus();
}

function renderColumns() {
  const list = $("export-columns");
  list.replaceChildren();
  template.columns.forEach((col, i) => {
    const li = el("li", { className: col.kind === "field" ? "kind-field" : "kind-custom" });
    const header = el("input", { type: "text", maxLength: 100, value: col.kind === "field" ? col.header ?? "" : col.header });
    header.placeholder = col.kind === "field" ? fieldName(col.field) : "Sütun başlığı";
    header.setAttribute("aria-label", `${i + 1}. sütun başlığı`);
    header.addEventListener("input", () => {
      col.header = header.value;
      markDirty();
    });

    let second;
    const source = el("div", { className: "source" });
    if (col.kind === "field") {
      const alias = tools.FIELD_LIST.find((f) => f.key === col.field)?.alias;
      source.append(el("span", { className: "badge" }, "Alan"), el("span", { className: "kind" }, fieldName(col.field)));
      if (alias) source.append(el("code", { className: "alias-code" }, `{${alias}}`));
    } else {
      second = el("input", { type: "text", maxLength: tools.MAX_VALUE_TEXT, value: col.value, placeholder: "Sabit değer ya da {ip} gibi alias (boş bırakılabilir)" });
      second.setAttribute("aria-label", `${i + 1}. sütunun değeri`);
      second.dataset.column = String(i);
      second.addEventListener("input", () => {
        col.value = second.value;
        markDirty();
      });
      second.addEventListener("focus", () => {
        aliasTarget = second;
      });
      source.append(el("span", { className: "badge custom" }, "Özel"), second);
    }

    const toolsBox = el("span", { className: "tools" });
    const up = el("button", { type: "button", className: "secondary icon-btn up", disabled: i === 0 }, "↑");
    up.setAttribute("aria-label", "Yukarı taşı");
    up.addEventListener("click", () => move(i, -1));
    const down = el("button", { type: "button", className: "secondary icon-btn down", disabled: i === template.columns.length - 1 }, "↓");
    down.setAttribute("aria-label", "Aşağı taşı");
    down.addEventListener("click", () => move(i, 1));
    const remove = el("button", { type: "button", className: "secondary icon-btn remove", disabled: template.columns.length === 1 }, "×");
    remove.setAttribute("aria-label", "Sütunu kaldır");
    remove.addEventListener("click", () => {
      template.columns.splice(i, 1);
      renderColumns();
      markDirty();
    });
    toolsBox.append(up, down, remove);

    li.append(el("span", { className: "num" }, String(i + 1)), header, source, toolsBox);
    list.append(li);
  });
  const full = template.columns.length >= tools.MAX_COLUMNS;
  $("export-add-field").disabled = full;
  $("export-add-custom").disabled = full;
}

function renderPreview() {
  const table = $("export-preview");
  table.replaceChildren();
  const current = tools.normalizeTemplate(template);
  const sep = current.separator === "tab" ? "\t" : ";";
  const headRow = el("tr");
  tools.buildHeader(current).split(sep).forEach((h) => headRow.append(el("th", {}, h)));
  const dataRow = el("tr");
  // Preview splits on the separator only for display; quoted CSV cells are shown as-is.
  tools.buildRow(current, SAMPLE).split(sep).forEach((v) => dataRow.append(el("td", {}, v)));
  table.append(headRow, dataRow);
}

function renderAliases() {
  const grid = $("alias-list");
  grid.replaceChildren();
  for (const f of tools.FIELD_LIST) {
    const sample = tools.buildRow({ columns: [{ kind: "custom", header: "x", value: `{${f.alias}}` }], empty: "dash", separator: "tab" }, SAMPLE);
    const button = el("button", { type: "button", className: "alias-card" });
    button.title = `${f.header} · son seçilen özel sütuna ekle`;
    button.append(el("code", {}, `{${f.alias}}`), el("span", { className: "alias-name" }, f.header), el("span", { className: "alias-sample" }, sample));
    button.addEventListener("click", () => insertAlias(f.alias));
    grid.append(button);
  }
}

// Inserts {alias} at the cursor of the last focused custom column; adds one if none exists.
function insertAlias(alias) {
  const text = `{${alias}}`;
  let input = aliasTarget?.isConnected ? aliasTarget : null;
  if (!input) {
    const index = template.columns.findIndex((c) => c.kind === "custom");
    input = index >= 0 ? $("export-columns").querySelector(`input[data-column="${index}"]`) : null;
  }
  if (!input) {
    if (template.columns.length >= tools.MAX_COLUMNS) return setStatus("Sütun sınırına ulaşıldı; önce bir sütunu kaldırın.");
    template.columns.push({ kind: "custom", header: "Özel sütun", value: "" });
    renderColumns();
    input = $("export-columns").querySelector(`input[data-column="${template.columns.length - 1}"]`);
  }
  const col = template.columns[Number(input.dataset.column)];
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const next = (input.value.slice(0, start) + text + input.value.slice(end)).slice(0, tools.MAX_VALUE_TEXT);
  input.value = next;
  col.value = next;
  input.focus();
  input.setSelectionRange(start + text.length, start + text.length);
  aliasTarget = input;
  markDirty();
}

function renderAll() {
  renderColumns();
  $("export-empty").value = template.empty;
  $("export-separator").value = template.separator;
  renderPreview();
}

function quickNotesFromInput() {
  return normalizeQuickNotes($("quick-notes").value.split("\n"));
}

async function save() {
  template = tools.normalizeTemplate(template);
  const quickNotes = quickNotesFromInput();
  await ext.storage.local.set({ [STORAGE_KEYS.exportTemplate]: template, [STORAGE_KEYS.quickNotes]: quickNotes });
  $("quick-notes").value = quickNotes.join("\n");
  setDirty(false);
  renderAll();
  setStatus("Şablon kaydedildi.");
}

async function copyHeader() {
  try {
    await navigator.clipboard.writeText(tools.buildHeader(template));
    setStatus("Başlık satırı kopyalandı. Excel'de ilk satıra yapıştırın.");
  } catch {
    setStatus("Kopyalanamadı. Tarayıcı panoya erişime izin vermedi.");
  }
}

export async function initExportEditor() {
  const select = $("export-field");
  for (const f of tools.FIELD_LIST) select.append(el("option", { value: f.key }, `${f.header} {${f.alias}}`));
  renderAliases();

  $("export-add-field").addEventListener("click", () => {
    template.columns.push({ kind: "field", field: select.value });
    renderColumns();
    markDirty();
  });
  $("export-add-custom").addEventListener("click", () => {
    template.columns.push({ kind: "custom", header: "Özel sütun", value: "" });
    renderColumns();
    markDirty();
    $("export-columns").lastElementChild?.querySelector("input")?.select();
  });
  $("export-empty").addEventListener("change", (e) => {
    template.empty = e.target.value;
    markDirty();
  });
  $("export-separator").addEventListener("change", (e) => {
    template.separator = e.target.value;
    markDirty();
  });
  $("quick-notes").addEventListener("input", () => markDirty());
  $("export-save").addEventListener("click", () => save().catch(() => setStatus("Kaydedilemedi.")));
  $("export-copy-header").addEventListener("click", () => copyHeader());
  $("export-reset").addEventListener("click", () => {
    template = tools.normalizeTemplate(null);
    renderAll();
    markDirty();
    setStatus("Varsayılan şablon yüklendi. Kalıcı olması için kaydedin.");
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  const stored = await ext.storage.local.get([STORAGE_KEYS.exportTemplate, STORAGE_KEYS.quickNotes]);
  template = tools.normalizeTemplate(stored[STORAGE_KEYS.exportTemplate]);
  $("quick-notes").value = normalizeQuickNotes(stored[STORAGE_KEYS.quickNotes]).join("\n");
  renderAll();
}
