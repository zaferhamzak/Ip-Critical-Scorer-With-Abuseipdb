import { ext } from "../shared/ext.js";
import { entryToResult, sanitizeList } from "../shared/history.js";
import { STORAGE_KEYS, describeQuota, siteInputToMatchPattern } from "../shared/settings.js";
import { bindApiKeyForm } from "../ui/api-key-form.js";

const $ = (id) => document.getElementById(id);

let messageTimer = null;
function showMessage(text, kind = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => el.classList.remove("show"), kind === "error" ? 6000 : 3500);
}

let sitePattern = null;

// activeTab exposes the current tab's URL only while the popup is open.
async function renderSite() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  let origin = null;
  try {
    const url = new URL(tab?.url ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") origin = url.origin;
  } catch {
    origin = null;
  }
  sitePattern = origin ? siteInputToMatchPattern(origin) : null;
  const button = $("site-enable");
  if (!sitePattern) {
    $("site-host").textContent = "Bu sayfa";
    $("site-status").textContent = "Eklenti yalnızca http/https sayfalarında çalışır.";
    $("site-dot").dataset.state = "na";
    button.hidden = true;
    return;
  }
  const granted = await ext.permissions.contains({ origins: [sitePattern] });
  $("site-host").textContent = new URL(origin).host;
  $("site-host").title = origin;
  $("site-status").textContent = granted ? "Etkin · IP seçip “IP’yi sorgula”ya basın" : "Etkin değil";
  $("site-dot").dataset.state = granted ? "on" : "off";
  button.hidden = granted;
}

$("site-enable").addEventListener("click", () => {
  if (!sitePattern) return;
  // permissions.request must be called directly from the click handler.
  ext.permissions
    .request({ origins: [sitePattern] })
    .then((granted) => {
      showMessage(granted ? "Etkinleştirildi. Sayfayı yenileyin." : "İzin verilmedi.", granted ? "ok" : "error");
      return renderSite();
    })
    .catch((error) => {
      console.error(error);
      showMessage("İzin istenemedi.", "error");
    });
});

// Updates are delivered by the Chrome Web Store; just show what is running.
$("version-status").textContent = `v${ext.runtime.getManifest().version}`;

async function renderQuota() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.quota);
  const raw = stored[STORAGE_KEYS.quota];
  const quota = describeQuota(raw);
  const value = $("quota-status");
  const box = $("quota-box");
  if (!quota) {
    value.textContent = "—";
    box.title = "İlk sorgudan sonra AbuseIPDB'nin bildirdiği kalan hak görünür.";
    return;
  }
  const n = new Intl.NumberFormat("tr-TR");
  const reset = typeof raw.resetAt === "number" && Date.now() >= raw.resetAt;
  value.textContent = reset ? "yenilendi" : `${n.format(raw.remaining)}${typeof raw.limit === "number" ? ` / ${n.format(raw.limit)}` : ""}`;
  const ratio = reset ? 1 : typeof raw.limit === "number" && raw.limit > 0 ? raw.remaining / raw.limit : 0;
  $("quota-meter").style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  box.classList.toggle("low", quota.low);
  const updated = raw.updatedAt ? new Intl.DateTimeFormat("tr-TR", { timeStyle: "short" }).format(new Date(raw.updatedAt)) : null;
  box.title = reset ? quota.text : `${quota.text}${updated ? ` · ${updated} itibarıyla` : ""}`;
}

renderQuota().catch(() => {});

function openHistory(view) {
  ext.tabs.create({ url: ext.runtime.getURL(`src/history/history.html${view ? `#${view}` : ""}`) });
  window.close();
}

$("open-history").addEventListener("click", () => openHistory());
$("list-open").addEventListener("click", () => openHistory("list"));

// Excel list: only the IPs the analyst added from the card or the history page.
async function renderExportList() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.exportList);
  const list = sanitizeList(stored[STORAGE_KEYS.exportList]);
  $("list-section").hidden = list.length === 0;
  $("list-count").textContent = String(list.length);
  $("list-status").textContent = "Eklenme sırasıyla, Excel şablonunuza göre kopyalanır. Kopyaladıktan sonra Düzenle'den temizleyebilirsiniz.";
  return list;
}

$("list-copy").addEventListener("click", async () => {
  try {
    const stored = await ext.storage.local.get([STORAGE_KEYS.exportList, STORAGE_KEYS.exportTemplate]);
    const list = sanitizeList(stored[STORAGE_KEYS.exportList]);
    if (list.length === 0) return showMessage("Liste boş.", "error");
    const tools = globalThis.ExportTools;
    // Oldest first so the spreadsheet reads in the order the IPs were added.
    await navigator.clipboard.writeText(tools.buildRows(stored[STORAGE_KEYS.exportTemplate], [...list].reverse().map(entryToResult)));
    showMessage(`${list.length} satır kopyalandı. Excel'de satırın ilk hücresine yapıştırın.`);
  } catch (error) {
    console.error(error);
    showMessage("Kopyalanamadı.", "error");
  }
});

renderExportList().catch(() => {});

async function renderHistoryCount() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.history);
  const n = Array.isArray(stored[STORAGE_KEYS.history]) ? stored[STORAGE_KEYS.history].length : 0;
  if (n > 0) $("open-history").replaceChildren("Sorgu geçmişi ", Object.assign(document.createElement("span"), { className: "badge-count", textContent: String(n) }));
}

renderHistoryCount().catch(() => {});

$("open-options").addEventListener("click", () => ext.runtime.openOptionsPage());

bindApiKeyForm({
  form: $("api-form"),
  input: $("api-key"),
  reveal: $("api-reveal"),
  remove: $("api-remove"),
  status: $("api-status"),
  notify: showMessage,
  labels: { ok: "Kayıtlı", missing: "Yok" },
  // The form stays folded once a key exists; without one it is the first thing to do.
  onChange: (hasKey) => {
    $("api-details").open = !hasKey;
    document.querySelector("#api-details .summary-action").textContent = hasKey ? "Değiştir" : "Ekle";
  },
}).catch((error) => console.error(error));

renderSite().catch((error) => {
  console.error(error);
  $("site-status").textContent = "Site durumu okunamadı.";
});
