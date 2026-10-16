// Lookup history page: filter, select, copy to Excel, CSV download, delete.
// Writes go through the background so they are serialised with new lookups.

import { ext } from "../shared/ext.js";
import { STORAGE_KEYS, mergeSettings } from "../shared/settings.js";
import { entryToResult, pruneHistory } from "../shared/history.js";

const tools = globalThis.ExportTools;
const $ = (id) => document.getElementById(id);
const selected = new Set();
let entries = [];
let historyDays = 7;
let clearArmed = false;

function message(text, kind = "ok") {
  $("message").textContent = text;
  $("message").className = kind;
}

function severity(score) {
  if (typeof score !== "number") return "none";
  if (score >= 75) return "high";
  if (score >= 25) return "medium";
  return score > 0 ? "low" : "none";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function visibleEntries() {
  const from = $("range").value === "today" ? startOfToday() : 0;
  const q = $("search").value.trim().toLocaleLowerCase("tr");
  return entries.filter((e) => {
    if (e.at < from) return false;
    if (!q) return true;
    return [e.ip, e.data.isp, e.data.countryCode, e.data.domain, e.note].some((v) => typeof v === "string" && v.toLocaleLowerCase("tr").includes(q));
  });
}

function cell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  if (text !== undefined && text !== null) td.textContent = String(text);
  return td;
}

function render() {
  const rows = visibleEntries();
  const tbody = $("history").tBodies[0];
  tbody.replaceChildren();
  for (const e of rows) {
    const tr = document.createElement("tr");
    if (selected.has(e.ip)) tr.classList.add("selected");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selected.has(e.ip);
    check.setAttribute("aria-label", `${e.ip} seç`);
    check.addEventListener("change", () => {
      if (check.checked) selected.add(e.ip);
      else selected.delete(e.ip);
      tr.classList.toggle("selected", check.checked);
      updateCount();
    });
    const tdCheck = cell();
    tdCheck.append(check);

    const link = document.createElement("a");
    link.href = e.detailUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = e.ip;
    const tdIp = cell(undefined, "ip");
    tdIp.append(link);

    const score = e.data.abuseConfidenceScore;
    const chip = document.createElement("span");
    chip.className = `chip ${severity(score)}`;
    chip.textContent = typeof score === "number" ? String(score) : "?";
    const tdScore = cell();
    tdScore.append(chip);

    const note = document.createElement("input");
    note.type = "text";
    note.maxLength = 200;
    note.value = e.note || "";
    note.placeholder = "Not ekle";
    note.setAttribute("aria-label", `${e.ip} notu`);
    note.addEventListener("change", () => {
      ext.runtime.sendMessage({ type: "setHistoryNote", ips: [e.ip], note: note.value }).then(() => message("Not kaydedildi."));
    });
    const tdNote = cell(undefined, "note");
    tdNote.append(note);

    tr.append(tdCheck, cell(tools.formatDateTime(e.at), "time"), tdIp, tdScore, cell(e.data.countryCode ?? "–"), cell(e.data.isp ?? "–", "isp"), tdNote);
    tr.querySelector(".isp").title = e.data.isp ?? "";
    tbody.append(tr);
  }
  $("empty").hidden = rows.length > 0;
  updateCount();
}

function updateCount() {
  const visible = visibleEntries();
  $("count").textContent = `${visible.length} kayıt · ${selected.size} seçili`;
  $("select-all").checked = visible.length > 0 && visible.every((e) => selected.has(e.ip));
}

async function getTemplate() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.exportTemplate);
  return tools.normalizeTemplate(stored[STORAGE_KEYS.exportTemplate]);
}

async function copyEntries(list) {
  if (list.length === 0) {
    message("Kopyalanacak kayıt yok.", "error");
    return;
  }
  const template = await getTemplate();
  await navigator.clipboard.writeText(tools.buildRows(template, list.map(entryToResult)));
  message(`${list.length} satır kopyalandı. Excel'de satırın ilk hücresine yapıştırın.`);
}

async function downloadCsv() {
  const list = visibleEntries();
  if (list.length === 0) {
    message("İndirilecek kayıt yok.", "error");
    return;
  }
  const template = { ...(await getTemplate()), separator: "semicolon" };
  // BOM so Excel opens UTF-8 Turkish characters correctly; CRLF line endings.
  const text = "﻿" + [tools.buildHeader(template), ...list.map((e) => tools.buildRow(template, entryToResult(e)))].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ip-sorgu-gecmisi-${tools.formatDateTime(Date.now()).slice(0, 10).split(".").reverse().join("-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(`${list.length} kayıt CSV olarak indirildi.`);
}

async function load() {
  const stored = await ext.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.historyDays, STORAGE_KEYS.historyEnabled]);
  const settings = mergeSettings(stored);
  historyDays = settings.historyDays;
  entries = pruneHistory(stored[STORAGE_KEYS.history], historyDays, Date.now());
  for (const ip of [...selected]) if (!entries.some((e) => e.ip === ip)) selected.delete(ip);
  $("retention").textContent = settings.historyEnabled
    ? `Son ${historyDays} günün sorguları, yalnızca bu tarayıcıda saklanır. Süreyi ayarlardan değiştirebilirsiniz.`
    : "Geçmiş kaydı ayarlardan kapatılmış; yeni sorgular kaydedilmiyor.";
  render();
}

function guard(fn) {
  return () => fn().catch((error) => {
    console.error(error);
    message("İşlem tamamlanamadı.", "error");
  });
}

$("range").addEventListener("change", render);
$("search").addEventListener("input", render);
$("select-all").addEventListener("change", (e) => {
  for (const entry of visibleEntries()) {
    if (e.target.checked) selected.add(entry.ip);
    else selected.delete(entry.ip);
  }
  render();
});
$("copy-selected").addEventListener("click", guard(() => copyEntries(entries.filter((e) => selected.has(e.ip)))));
$("copy-visible").addEventListener("click", guard(() => copyEntries(visibleEntries())));
$("download-csv").addEventListener("click", guard(downloadCsv));
$("delete-selected").addEventListener("click", guard(async () => {
  if (selected.size === 0) return message("Önce silinecek kayıtları seçin.", "error");
  const count = selected.size;
  await ext.runtime.sendMessage({ type: "removeHistory", ips: [...selected] });
  selected.clear();
  render();
  message(`${count} kayıt silindi.`);
}));
$("clear-all").addEventListener("click", guard(async () => {
  const button = $("clear-all");
  if (!clearArmed) {
    clearArmed = true;
    button.textContent = "Emin misiniz? Tekrar tıklayın";
    setTimeout(() => {
      clearArmed = false;
      button.textContent = "Geçmişi temizle";
    }, 4000);
    return;
  }
  clearArmed = false;
  button.textContent = "Geçmişi temizle";
  await ext.runtime.sendMessage({ type: "removeHistory", all: true });
  selected.clear();
  render();
  message("Geçmiş temizlendi.");
}));
ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (STORAGE_KEYS.history in changes || STORAGE_KEYS.historyDays in changes)) load();
});

guard(load)();
