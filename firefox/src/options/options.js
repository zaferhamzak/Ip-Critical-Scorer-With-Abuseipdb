import { ext } from "../shared/ext.js";
import {
  ALL_SITES_PATTERNS,
  CACHE_KEY_PREFIX,
  STORAGE_KEYS,
  mergeSettings,
  normalizeCacheTtl,
  normalizeMaxAge,
  normalizeHistoryDays,
  pagePatternsFromGranted,
  siteInputToMatchPattern,
} from "../shared/settings.js";
import { bindApiKeyForm } from "../ui/api-key-form.js";
import { initExportEditor } from "./export-editor.js";

const $ = (id) => document.getElementById(id);

function showMessage(text, kind = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = kind;
}

async function renderSettings() {
  const stored = await ext.storage.local.get([
    STORAGE_KEYS.cacheTtlMinutes, STORAGE_KEYS.maxAgeInDays, STORAGE_KEYS.historyEnabled, STORAGE_KEYS.historyDays, STORAGE_KEYS.highlightKnown,
  ]);
  const settings = mergeSettings(stored);
  $("history-enabled").checked = settings.historyEnabled;
  $("history-days").value = String(settings.historyDays);
  $("highlight-known").checked = settings.highlightKnown;
  if (!(globalThis.CSS?.highlights && typeof globalThis.Highlight === "function")) {
    $("highlight-known").disabled = true;
    $("highlight-note").textContent = "Bu tarayıcı sayfa işaretlemeyi (CSS Custom Highlight API) desteklemiyor.";
  }
  $("cache-ttl").value = String(settings.cacheTtlMinutes);
  $("max-age").value = String(settings.maxAgeInDays);
}

async function renderSites() {
  const { origins = [] } = await ext.permissions.getAll();
  const list = $("site-list");
  list.replaceChildren();
  const patterns = pagePatternsFromGranted(origins);
  if (patterns.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Henüz site izni yok; eklenti hiçbir sayfada çalışmıyor.";
    list.append(li);
  }
  for (const pattern of patterns) {
    const li = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = pattern;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Kaldır";
    remove.addEventListener("click", guard(() => removeSite(pattern)));
    li.append(code, remove);
    list.append(li);
  }
}

async function saveCacheTtl(event) {
  event.preventDefault();
  const minutes = normalizeCacheTtl($("cache-ttl").value);
  if (minutes === null) {
    showMessage("Süre 1 ile 1440 dakika arasında tam sayı olmalı.", "error");
    return;
  }
  await ext.storage.local.set({ [STORAGE_KEYS.cacheTtlMinutes]: minutes });
  showMessage(`Önbellek süresi ${minutes} dakika olarak kaydedildi.`);
}

async function saveMaxAge(event) {
  event.preventDefault();
  const days = normalizeMaxAge($("max-age").value);
  if (days === null) {
    showMessage("Rapor dönemi 1 ile 365 gün arasında tam sayı olmalı.", "error");
    return;
  }
  await ext.storage.local.set({ [STORAGE_KEYS.maxAgeInDays]: days });
  showMessage(`Rapor dönemi ${days} gün olarak kaydedildi.`);
}

async function saveHistorySettings(event) {
  event.preventDefault();
  const days = normalizeHistoryDays($("history-days").value);
  if (days === null) {
    showMessage("Saklama süresi 1 ile 90 gün arasında tam sayı olmalı.", "error");
    return;
  }
  const enabled = $("history-enabled").checked;
  await ext.storage.local.set({
    [STORAGE_KEYS.historyEnabled]: enabled,
    [STORAGE_KEYS.historyDays]: days,
    [STORAGE_KEYS.highlightKnown]: $("highlight-known").checked && !$("highlight-known").disabled,
  });
  showMessage(enabled ? `Geçmiş ${days} gün saklanacak.` : "Geçmiş kaydı kapatıldı. Mevcut kayıtları geçmiş sayfasından silebilirsiniz.");
}

async function clearCache() {
  const all = await ext.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_KEY_PREFIX));
  if (keys.length > 0) await ext.storage.session.remove(keys);
  showMessage(`Önbellek temizlendi (${keys.length} kayıt).`);
}

async function requestSites(patterns) {
  // Must be the first await in the click handler: permissions.request needs a user gesture.
  const granted = await ext.permissions.request({ origins: patterns });
  showMessage(
    granted ? "Site izni verildi. Açık sekmelerde etkin olması için sayfayı yenileyin." : "Site izni verilmedi.",
    granted ? "ok" : "error",
  );
  await renderSites();
}

async function addSite(event) {
  event.preventDefault();
  const pattern = siteInputToMatchPattern($("site-input").value);
  if (!pattern) {
    showMessage("Geçersiz site. Örnek: siem.example.com veya https://*.example.com", "error");
    return;
  }
  $("site-input").value = "";
  await requestSites([pattern]);
}

async function removeSite(pattern) {
  const removed = await ext.permissions.remove({ origins: [pattern] }).catch(() => false);
  showMessage(removed ? `${pattern} izni kaldırıldı.` : `${pattern} izni kaldırılamadı.`, removed ? "ok" : "error");
  await renderSites();
}

function guard(handler) {
  return (event) =>
    handler(event).catch((error) => {
      console.error(error);
      showMessage("İşlem tamamlanamadı. Ayrıntı için eklenti konsoluna bakın.", "error");
    });
}

bindApiKeyForm({
  form: $("api-form"),
  input: $("api-key"),
  reveal: $("api-reveal"),
  remove: $("api-remove"),
  status: $("api-status"),
  notify: showMessage,
}).catch((error) => console.error(error));

$("period-form").addEventListener("submit", guard(saveMaxAge));
$("history-form").addEventListener("submit", guard(saveHistorySettings));
$("history-open").addEventListener("click", () => ext.tabs.create({ url: ext.runtime.getURL("src/history/history.html") }));
$("cache-form").addEventListener("submit", guard(saveCacheTtl));
$("cache-clear").addEventListener("click", guard(clearCache));
$("site-form").addEventListener("submit", guard(addSite));
$("site-all").addEventListener("click", guard(() => requestSites(ALL_SITES_PATTERNS)));
ext.permissions.onAdded.addListener(() => renderSites());
ext.permissions.onRemoved.addListener(() => renderSites());

guard(renderSettings)();
initExportEditor().catch((error) => console.error(error));
guard(renderSites)();
