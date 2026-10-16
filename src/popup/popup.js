import { siteInputToMatchPattern } from "../shared/settings.js";
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

// Updates are delivered by the Chrome Web Store; just show what is running.
$("version-status").textContent = `v${chrome.runtime.getManifest().version} · Chrome Web Store tarafından otomatik güncellenir`;

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
