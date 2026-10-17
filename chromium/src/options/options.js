import { ext } from "../shared/ext.js";
import {
  ALL_SITES_PATTERNS,
  CACHE_KEY_PREFIX,
  STORAGE_KEYS,
  describeQuota,
  mergeSettings,
  normalizeCacheTtl,
  normalizeMaxAge,
  normalizeHistoryDays,
  pagePatternsFromGranted,
  siteInputToMatchPattern,
} from "../shared/settings.js";
import { bindApiKeyForm } from "../ui/api-key-form.js";
import { initExportEditor } from "./export-editor.js";
import { buildSettingsFile, parseSettingsFile } from "../shared/settings.js";

const $ = (id) => document.getElementById(id);

// Toast at the bottom of the window, so feedback is visible wherever the button was.
let messageTimer = null;
function showMessage(text, kind = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => el.classList.remove("show"), kind === "error" ? 7000 : 4000);
}

$("version").textContent = `v${ext.runtime.getManifest().version}`;

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
    li.className = "empty";
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

let importedSites = [];

async function exportSettings() {
  const stored = await ext.storage.local.get(null);
  const { origins = [] } = await ext.permissions.getAll();
  const file = buildSettingsFile(stored, origins);
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ip-critical-scorer-ayarlar.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Ayar dosyası indirildi. API anahtarı ve geçmiş dosyada yok.");
}

async function importSettings(file) {
  const { settings, rawTemplate, sites } = parseSettingsFile(await file.text());
  if (rawTemplate) settings[STORAGE_KEYS.exportTemplate] = globalThis.ExportTools.normalizeTemplate(rawTemplate);
  await ext.storage.local.set(settings);
  const { origins = [] } = await ext.permissions.getAll();
  importedSites = sites.filter((s) => !origins.includes(s));
  const grant = $("settings-grant-sites");
  grant.hidden = importedSites.length === 0;
  grant.textContent = `Dosyadaki ${importedSites.length} siteye izin ver`;
  await renderSettings();
  showMessage(`Ayarlar içe aktarıldı (${Object.keys(settings).length} ayar).${importedSites.length ? " Site izinleri için aşağıdaki butona basın." : ""} Excel şablonunu görmek için sayfayı yenileyin.`);
}

$("settings-export").addEventListener("click", guard(exportSettings));
$("settings-import").addEventListener("click", () => $("settings-file").click());
$("settings-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  importSettings(file).catch((error) => showMessage(error.message || "Dosya içe aktarılamadı.", "error"));
});
// permissions.request must run directly in the click handler (user gesture).
$("settings-grant-sites").addEventListener("click", () => {
  if (importedSites.length === 0) return;
  ext.permissions.request({ origins: importedSites }).then((granted) => {
    showMessage(granted ? "Site izinleri verildi. Açık sekmeleri yenileyin." : "Site izinleri verilmedi.", granted ? "ok" : "error");
    if (granted) $("settings-grant-sites").hidden = true;
  });
});

guard(renderSettings)();
initExportEditor().catch((error) => console.error(error));
guard(renderSites)();

// Side menu follows the scroll position: the active section is the last one whose top
// has passed under the header; at the very bottom the last section wins, so short
// sections at the end can be selected too.
const tocLinks = [...document.querySelectorAll(".toc a")];
const tocSections = tocLinks.map((a) => document.querySelector(a.getAttribute("href")));
let pinnedSection = null; // set by a menu click until the user scrolls

const narrowLayout = window.matchMedia("(max-width: 900px)");

// Distance from the viewport top that counts as "reading this section": below the
// sticky header (and the sticky horizontal menu on narrow screens).
function headerOffset() {
  const header = document.querySelector(".topbar").getBoundingClientRect().height;
  const menu = narrowLayout.matches ? document.querySelector(".toc").getBoundingClientRect().height : 0;
  return header + menu + 24;
}

function setActive(index) {
  tocLinks.forEach((a, i) => {
    const on = i === index;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
    tocSections[i]?.classList.toggle("active", on);
  });
  const link = tocLinks[index];
  if (!link) return;
  const fill = $("toc-fill");
  if (fill) fill.style.height = `${Math.max(0, link.offsetTop + link.offsetHeight / 2 - 4)}px`;
  if (narrowLayout.matches) {
    // Keep the active chip visible in the horizontal menu without moving the page.
    const toc = link.parentElement;
    const left = link.offsetLeft - (toc.clientWidth - link.offsetWidth) / 2;
    toc.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
}

function syncActive() {
  if (pinnedSection !== null) return setActive(pinnedSection);
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) return setActive(tocSections.length - 1);
  const line = headerOffset();
  let index = 0;
  tocSections.forEach((section, i) => {
    if (section && section.getBoundingClientRect().top - line <= 1) index = i;
  });
  setActive(index);
}

let scrollFrame = 0;
let pinnedY = null; // scroll position once the click's smooth scroll has settled

function releasePin() {
  if (pinnedSection === null) return;
  pinnedSection = null;
  pinnedY = null;
  syncActive();
}

window.addEventListener("scroll", () => {
  // Any later movement away from where the click landed means the user scrolls again.
  if (pinnedSection !== null && pinnedY !== null && Math.abs(window.scrollY - pinnedY) > 4) releasePin();
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    syncActive();
  });
}, { passive: true });
window.addEventListener("scrollend", () => {
  if (pinnedSection !== null && pinnedY === null) pinnedY = window.scrollY;
});
window.addEventListener("resize", syncActive);
// Input during the smooth scroll itself also hands control back.
for (const type of ["wheel", "touchmove"]) window.addEventListener(type, releasePin, { passive: true });

// A menu click keeps its section selected even when the page cannot scroll that far
// (short sections near the end).
tocLinks.forEach((a, i) => {
  a.addEventListener("click", () => {
    pinnedSection = i;
    pinnedY = null;
    setActive(i);
    // No scroll happens when the page is already there; start watching from here.
    setTimeout(() => {
      if (pinnedSection === i && pinnedY === null) pinnedY = window.scrollY;
    }, 1200);
  });
});
// Sections grow after async rendering (sites, template), so re-sync once things settle.
new ResizeObserver(() => syncActive()).observe(document.querySelector("main"));
syncActive();

// Header status chips mirror the API key state and the stored daily quota.
const keyStatus = $("api-status");
function syncKeyChip() {
  const ok = keyStatus.dataset.state === "ok";
  $("top-key").textContent = ok ? "Anahtar ✓" : "Anahtar yok";
  $("top-key").dataset.state = ok ? "ok" : "missing";
}
new MutationObserver(syncKeyChip).observe(keyStatus, { attributes: true, childList: true, characterData: true, subtree: true });
syncKeyChip();

async function renderQuotaChip() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.quota);
  const quota = describeQuota(stored[STORAGE_KEYS.quota]);
  const chip = $("top-quota");
  chip.hidden = !quota;
  if (!quota) return;
  chip.textContent = quota.text.replace("Kalan hak: ", "Kalan ");
  chip.dataset.state = quota.low ? "low" : "";
}
renderQuotaChip().catch(() => {});
ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORAGE_KEYS.quota in changes) renderQuotaChip().catch(() => {});
});
