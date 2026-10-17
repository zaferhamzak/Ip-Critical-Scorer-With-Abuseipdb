// Shared API key form used by the popup and the options page.
// The stored key is never read back into the page; only its presence is shown.

import { ext } from "../shared/ext.js";
import { STORAGE_KEYS, normalizeApiKey } from "../shared/settings.js";

/**
 * @param {object} els
 * @param {HTMLFormElement} els.form
 * @param {HTMLInputElement} els.input
 * @param {HTMLInputElement} [els.reveal]  checkbox that toggles plain-text display while typing
 * @param {HTMLButtonElement} els.remove
 * @param {HTMLElement} els.status
 * @param {(text: string, kind?: "ok"|"error") => void} els.notify
 * @param {{ok: string, missing: string}} [els.labels]  status texts (the popup uses short ones)
 * @param {(hasKey: boolean) => void} [els.onChange]
 */
export function bindApiKeyForm({ form, input, reveal, remove, status, notify, labels, onChange }) {
  async function render() {
    const stored = await ext.storage.local.get(STORAGE_KEYS.apiKey);
    const hasKey = normalizeApiKey(stored?.[STORAGE_KEYS.apiKey]) !== null;
    status.textContent = hasKey ? labels?.ok ?? "Anahtar kayıtlı" : labels?.missing ?? "Anahtar yok – kart yalnızca detay bağlantısı gösterir";
    status.dataset.state = hasKey ? "ok" : "missing";
    remove.disabled = !hasKey;
    input.placeholder = hasKey ? "Yeni anahtar girerek değiştirin" : "AbuseIPDB API anahtarınız";
    onChange?.(hasKey);
  }

  async function save(event) {
    event.preventDefault();
    const key = normalizeApiKey(input.value);
    if (!key) {
      notify("Geçersiz anahtar biçimi. Boşluk içermeyen harf/rakam dizisi bekleniyor.", "error");
      input.focus();
      return;
    }
    await ext.storage.local.set({ [STORAGE_KEYS.apiKey]: key });
    input.value = "";
    if (reveal) {
      reveal.checked = false;
      input.type = "password";
    }
    notify("Anahtar kaydedildi.");
    await render();
  }

  async function removeKey() {
    await ext.storage.local.remove(STORAGE_KEYS.apiKey);
    notify("Anahtar silindi.");
    await render();
  }

  const guard = (fn) => (event) =>
    fn(event).catch((error) => {
      console.error(error);
      notify("İşlem tamamlanamadı.", "error");
    });

  form.addEventListener("submit", guard(save));
  remove.addEventListener("click", guard(removeKey));
  reveal?.addEventListener("change", () => {
    input.type = reveal.checked ? "text" : "password";
  });
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STORAGE_KEYS.apiKey in changes) render().catch(() => {});
  });

  return render();
}
