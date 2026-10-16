import { ext } from "../shared/ext.js";
import { STORAGE_KEYS, describeQuota, siteInputToMatchPattern } from "../shared/settings.js";
import { bindApiKeyForm } from "../ui/api-key-form.js";

const $ = (id) => document.getElementById(id);

function showMessage(text, kind = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = kind;
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
    $("site-status").textContent = "Bu sayfada eklenti kullanılamaz (yalnızca http/https sayfaları).";
    button.hidden = true;
    return;
  }
  const granted = await ext.permissions.contains({ origins: [sitePattern] });
  $("site-status").textContent = granted
    ? `${origin} için etkin. IP seçip “IP’yi sorgula” butonunu kullanın.`
    : `${origin} için etkin değil.`;
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
$("version-status").textContent = `v${ext.runtime.getManifest().version} · Chrome Web Store tarafından otomatik güncellenir`;

async function renderQuota() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.quota);
  const quota = describeQuota(stored[STORAGE_KEYS.quota]);
  const line = $("quota-status");
  if (!quota) return;
  const updated = stored[STORAGE_KEYS.quota].updatedAt;
  const at = updated ? ` · ${new Intl.DateTimeFormat("tr-TR", { timeStyle: "short" }).format(new Date(updated))} itibarıyla` : "";
  line.textContent = quota.text + at;
  line.classList.toggle("low", quota.low);
  line.hidden = false;
}

renderQuota().catch(() => {});

$("open-history").addEventListener("click", () => {
  ext.tabs.create({ url: ext.runtime.getURL("src/history/history.html") });
  window.close();
});

async function renderHistoryCount() {
  const stored = await ext.storage.local.get(STORAGE_KEYS.history);
  const n = Array.isArray(stored[STORAGE_KEYS.history]) ? stored[STORAGE_KEYS.history].length : 0;
  if (n > 0) $("open-history").textContent = `Sorgu geçmişi (${n})`;
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
}).catch((error) => console.error(error));

renderSite().catch((error) => {
  console.error(error);
  $("site-status").textContent = "Site durumu okunamadı.";
});
