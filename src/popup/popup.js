import { siteInputToMatchPattern } from "../shared/settings.js";
import { bindApiKeyForm } from "../ui/api-key-form.js";
import { RELEASES_PAGE_URL, UPDATE_STATE_KEY, compareVersions } from "../shared/update.js";

const $ = (id) => document.getElementById(id);

function showMessage(text, kind = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = kind;
}

let sitePattern = null;

// activeTab exposes the current tab's URL only while the popup is open.
async function renderSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  const granted = await chrome.permissions.contains({ origins: [sitePattern] });
  $("site-status").textContent = granted
    ? `${origin} için etkin. IP seçip “IP’yi sorgula” butonunu kullanın.`
    : `${origin} için etkin değil.`;
  button.hidden = granted;
}

$("site-enable").addEventListener("click", () => {
  if (!sitePattern) return;
  // permissions.request must be called directly from the click handler.
  chrome.permissions
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

async function renderVersion() {
  const running = chrome.runtime.getManifest().version;
  const state = (await chrome.storage.local.get(UPDATE_STATE_KEY))[UPDATE_STATE_KEY];
  const newer = state && compareVersions(state.latestVersion, running) === 1;
  const status = $("version-status");
  if (newer) {
    status.textContent = `v${running} kurulu · v${state.latestVersion} hazır. Otomatik güncelleme kuruluysa birkaç saat içinde kendiliğinden yüklenir.`;
    $("version-link").href = state.url || RELEASES_PAGE_URL;
    $("version-link-wrap").hidden = false;
  } else {
    const checked = state?.checkedAt
      ? ` · son kontrol ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(state.checkedAt))}`
      : "";
    status.textContent = `v${running} · güncel${checked}`;
  }
}

renderVersion().catch(() => {
  $("version-status").textContent = `v${chrome.runtime.getManifest().version}`;
});

$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

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
