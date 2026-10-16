// Content script: shows an "IP'yi sorgula" button next to a selected IP and renders the
// result card. Selecting text never triggers a network request; only the button (or the
// keyboard shortcut) sends the selected IP to the service worker. Page content, URL and
// surrounding text are never sent.
(() => {
  "use strict";

  if (globalThis.__abuseIpdbLookupLoaded) return;
  const ext = globalThis.browser ?? globalThis.chrome;
  globalThis.__abuseIpdbLookupLoaded = true;

  const { analyzeSelection, detailUrl, MAX_INPUT_LENGTH } = globalThis.IpTools;
  const STYLES = globalThis.AbuseIpdbCardStyles;
  const MARGIN = 8;
  const GAP = 6;

  const ERROR_MESSAGES = {
    unauthorized: "API anahtarı geçersiz ya da yetkisiz (401).",
    forbidden: "AbuseIPDB isteği reddetti (403).",
    rate_limited: "AbuseIPDB istek sınırına ulaşıldı (429).",
    invalid_request: "AbuseIPDB isteği geçersiz buldu (422).",
    server_error: "AbuseIPDB geçici bir sunucu hatası döndürdü.",
    http_error: "AbuseIPDB'den beklenmeyen bir yanıt alındı.",
    network: "Ağ hatası: AbuseIPDB'ye ulaşılamadı.",
    timeout: "İstek zaman aşımına uğradı.",
    bad_response: "AbuseIPDB yanıtı beklenen biçimde değil; alanlar okunamadı.",
    extension_unavailable: "Eklenti yeniden yüklenmiş. Bu sayfayı yenileyip tekrar deneyin.",
    internal: "Eklentide beklenmeyen bir hata oluştu.",
  };

  const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  const timeFormat = new Intl.DateTimeFormat("tr-TR", { timeStyle: "short" });
  let regionNames = null;
  try {
    regionNames = new Intl.DisplayNames(["tr"], { type: "region" });
  } catch {
    regionNames = null;
  }

  let host = null;
  let root = null;
  let ui = null;
  let button = null;
  let card = null;
  let pending = null; // { analysis, rect } for the visible button
  let requestSeq = 0;

  // ---------- DOM helpers (textContent only; no HTML strings from data) ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function searchIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "7");
    circle.setAttribute("cy", "7");
    circle.setAttribute("r", "4.5");
    const line = document.createElementNS(NS, "path");
    line.setAttribute("d", "M10.5 10.5 14 14");
    for (const node of [circle, line]) {
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", "currentColor");
      node.setAttribute("stroke-width", "2");
      node.setAttribute("stroke-linecap", "round");
      svg.append(node);
    }
    return svg;
  }

  function ensureRoot() {
    if (host && host.isConnected) return;
    host = document.createElement("abuseipdb-lookup");
    host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
    root = host.attachShadow({ mode: "closed" });
    try {
      const sheet = new window.CSSStyleSheet();
      sheet.replaceSync(STYLES);
      root.adoptedStyleSheets = [sheet];
    } catch {
      root.append(el("style", null, STYLES));
    }
    ui = el("div", "ui");
    root.append(ui);
    (document.body || document.documentElement).append(host);
    button = null;
    card = null;
  }

  function isOwnEvent(event) {
    return Boolean(host && event.composedPath().includes(host));
  }

  // Places `node` (position: fixed) next to `rect`, keeping it fully inside the viewport.
  function place(node, rect) {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const { width, height } = node.getBoundingClientRect();
    let left = Math.min(Math.max(rect.left, MARGIN), vw - width - MARGIN);
    let top = rect.bottom + GAP;
    if (top + height > vh - MARGIN) top = rect.top - height - GAP;
    top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - height - MARGIN));
    left = Math.max(MARGIN, left);
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  // ---------- selection ----------

  function readSelection() {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && /^(text|search|url)$/i.test(active.type))) &&
      typeof active.selectionStart === "number" &&
      active.selectionStart !== active.selectionEnd
    ) {
      const text = active.value.slice(active.selectionStart, active.selectionEnd);
      const analysis = text.length <= MAX_INPUT_LENGTH ? analyzeSelection(text) : null;
      return analysis ? { analysis, rect: active.getBoundingClientRect() } : null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const text = selection.toString();
    if (text.length === 0 || text.length > MAX_INPUT_LENGTH) return null;
    const analysis = analyzeSelection(text);
    if (!analysis) return null;
    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const rects = range.getClientRects();
      if (rects.length === 0) return null;
      rect = rects[rects.length - 1];
    }
    return { analysis, rect };
  }

  function showButton(found) {
    ensureRoot();
    pending = found;
    if (!button) {
      button = el("button", "lookup-button");
      button.type = "button";
      button.append(searchIcon(), el("span", null, "IP’yi sorgula"));
      // Keep the page selection intact when the button is pressed.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (!pending) return;
        const { analysis, rect } = pending;
        hideButton();
        openCard(analysis, rect);
      });
      ui.append(button);
    }
    button.setAttribute("aria-label", `${found.analysis.ip} adresini AbuseIPDB'de sorgula`);
    button.title = found.analysis.ip;
    place(button, found.rect);
  }

  function hideButton() {
    pending = null;
    if (button) {
      button.remove();
      button = null;
    }
  }

  function onSelectionEnd(event) {
    if (event && isOwnEvent(event)) return;
    // Wait for the browser to finish updating the selection.
    setTimeout(() => {
      const found = readSelection();
      if (found) showButton(found);
      else hideButton();
    }, 0);
  }

  // ---------- card ----------

  const SEVERITY = {
    none: "Skor 0",
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
  };

  function closeCard() {
    requestSeq += 1;
    if (card) {
      card.remove();
      card = null;
    }
  }

  function openCard(analysis, rect) {
    ensureRoot();
    closeCard();
    card = el("div", "card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `AbuseIPDB sonucu: ${analysis.ip}`);
    card.tabIndex = -1;
    for (const type of ["keydown", "keyup", "keypress"]) card.addEventListener(type, (event) => event.stopPropagation());
    card.dataset.anchor = JSON.stringify({ left: rect.left, top: rect.top, bottom: rect.bottom });
    ui.append(card);
    renderLoading(analysis.ip);
    card.focus({ preventScroll: true });
    runLookup(analysis, false);
  }

  function anchorRect() {
    try {
      return JSON.parse(card.dataset.anchor);
    } catch {
      return { left: MARGIN, top: MARGIN, bottom: MARGIN };
    }
  }

  function copyIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    for (const [x, y] of [[5, 5], [2, 2]]) {
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", "9");
      rect.setAttribute("height", "9");
      rect.setAttribute("rx", "1.5");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", "currentColor");
      rect.setAttribute("stroke-width", "1.5");
      svg.append(rect);
    }
    return svg;
  }

  // Small icon next to the IP: copies only the IP address.
  function ipCopyButton(ip) {
    const button = el("button", "copy-ip");
    button.type = "button";
    button.title = "IP adresini kopyala";
    button.setAttribute("aria-label", `${ip} adresini kopyala`);
    button.append(copyIcon());
    button.addEventListener("click", async () => {
      const ok = await copyText(ip);
      button.replaceChildren(document.createTextNode(ok ? "✓" : "!"));
      button.title = ok ? "Kopyalandı" : "Kopyalanamadı";
      setTimeout(() => {
        if (!button.isConnected) return;
        button.replaceChildren(copyIcon());
        button.title = "IP adresini kopyala";
      }, 1200);
    });
    return button;
  }

  function setCardContent(ip, sev, children, { copyIp = false } = {}) {
    if (!card) return;
    card.dataset.sev = sev;
    const header = el("div", "header");
    const title = el("div", "title");
    const ipLine = el("span", "ip-line");
    ipLine.append(el("span", "ip", ip));
    if (copyIp) ipLine.append(ipCopyButton(ip));
    title.append(el("span", "source", "AbuseIPDB"), ipLine);
    const close = el("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Kartı kapat");
    close.addEventListener("click", closeCard);
    header.append(title, close);
    const body = el("div", "body");
    body.append(...children);
    card.replaceChildren(header, body);
    place(card, anchorRect());
  }

  function panel(title, text) {
    const box = el("div", "panel");
    box.append(el("p", "panel-title", title));
    if (text) box.append(el("p", "panel-text", text));
    return box;
  }

  function footer(meta, actions) {
    const node = el("div", "footer");
    if (meta) node.append(el("p", "meta", meta));
    node.append(...actions);
    return node;
  }

  function actionLink(label, href) {
    const a = el("a", "action primary", `${label} ↗`);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function actionButton(label, onClick) {
    const b = el("button", "action", label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function refreshButton(analysis) {
    const button = actionButton("↻", () => runLookup(analysis, true));
    button.classList.add("icon-action");
    button.title = "Yenile";
    button.setAttribute("aria-label", "Sonucu yenile");
    return button;
  }

  function copyButton(response) {
    const button = actionButton("Excel'e kopyala", () => copyForExcel(button, response));
    button.title = "Ayarlardaki Excel şablonuna göre tek satır kopyalar";
    return button;
  }

  function optionsButton(label) {
    return actionButton(label, () => {
      sendMessage({ type: "openOptions" }).catch(() => {});
    });
  }

  // Clipboard API needs a secure context; plain-http pages (common for internal tools)
  // fall back to copying from a hidden textarea inside our shadow root.
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to the legacy path
    }
    const area = el("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    ui.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  // Template and quick notes come from the background (storage.local is not readable here).
  async function getExportSettings() {
    try {
      const settings = await sendMessage({ type: "getExportSettings" });
      if (settings && typeof settings === "object") return settings;
    } catch {
      // fall through to defaults
    }
    return { template: null, quickNotes: [] };
  }

  function currentNote() {
    const input = card?.querySelector(".note-input");
    return input ? input.value.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  }

  function noteBox() {
    const box = el("div", "note-box");
    const chips = el("div", "note-chips");
    const input = el("input", "note-input");
    input.type = "text";
    input.maxLength = 200;
    input.placeholder = "Not ekle (Excel satırına girer)";
    input.setAttribute("aria-label", "Excel satırına eklenecek not");
    const syncChips = () => {
      for (const chip of chips.children) chip.setAttribute("aria-pressed", String(chip.textContent === input.value.trim()));
    };
    input.addEventListener("input", syncChips);
    box.append(chips, input);
    getExportSettings().then(({ quickNotes }) => {
      for (const text of quickNotes || []) {
        const chip = el("button", "note-chip", text);
        chip.type = "button";
        chip.setAttribute("aria-pressed", "false");
        chip.addEventListener("click", () => {
          input.value = input.value.trim() === text ? "" : text;
          syncChips();
          input.focus();
        });
        chips.append(chip);
      }
    });
    return box;
  }

  async function copyForExcel(button, response) {
    const { template } = await getExportSettings();
    const ok = await copyText(globalThis.ExportTools.buildRow(template, { ...response, note: currentNote() }));
    button.textContent = ok ? "Kopyalandı ✓" : "Kopyalanamadı";
    setTimeout(() => {
      if (button.isConnected) button.textContent = "Excel'e kopyala";
    }, 1600);
  }

  function renderLoading(ip) {
    card.setAttribute("aria-busy", "true");
    const loading = el("div", "loading");
    loading.append(el("span", "spinner"), el("span", null, "Sorgulanıyor…"));
    setCardContent(ip, "none", [loading]);
  }

  function row(label, value) {
    const wrap = el("div", "row");
    const missing = value === null || value === undefined || value === "";
    wrap.append(el("dt", null, label), el("dd", missing ? "missing" : null, missing ? "Bilinmiyor" : value));
    return wrap;
  }

  function severity(score) {
    if (score === null) return "none";
    if (score >= 75) return "high";
    if (score >= 25) return "medium";
    if (score > 0) return "low";
    return "none";
  }

  function countryText(code) {
    if (!code) return null;
    const name = regionNames?.of(code);
    return name && name !== code ? `${name} (${code})` : code;
  }

  // Same wording as describeQuota() in shared/settings.js (ES module, not loadable here).
  function describeQuota(quota) {
    if (!quota || typeof quota.remaining !== "number") return null;
    const n = new Intl.NumberFormat("tr-TR");
    if (typeof quota.resetAt === "number" && Date.now() >= quota.resetAt) {
      return { text: "Kalan hak: yenilendi (yeni sorguda güncellenir)", low: false };
    }
    const limit = typeof quota.limit === "number" ? ` / ${n.format(quota.limit)}` : "";
    const low = typeof quota.limit === "number" && quota.remaining < quota.limit * 0.1;
    return { text: `Kalan hak: ${n.format(quota.remaining)}${limit}`, low };
  }

  function periodText(days) {
    return days === 365 ? "1 yıl" : `${days} gün`;
  }

  function lastReportText(data) {
    if (data.lastReportedAt) return dateFormat.format(new Date(data.lastReportedAt));
    if (data.totalReports === 0) return `Son ${periodText(data.maxAgeInDays)} içinde rapor yok`;
    return null;
  }

  function renderResult(analysis, response) {
    const { data } = response;
    const score = data.abuseConfidenceScore;
    const sev = severity(score);
    const parts = [];

    const block = el("div", "score-block");
    const scoreRow = el("div", "score-row");
    scoreRow.append(
      el("span", "score-value", score === null ? "?" : score),
      el("span", "score-max", "/ 100"),
      el("span", "chip", score === null ? "Skor yok" : SEVERITY[sev]),
    );
    const meter = el("div", "meter");
    const fill = el("div", "meter-fill");
    fill.style.width = `${score === null ? 0 : Math.max(score, 2)}%`;
    meter.append(fill);
    meter.setAttribute("role", "img");
    meter.setAttribute("aria-label", score === null ? "Skor bilinmiyor" : `Abuse confidence ${score} / 100`);
    block.append(scoreRow, meter, el("div", "score-caption", "Abuse confidence skoru"));
    parts.push(block);

    if (score === null) parts.push(el("p", "note", "Skor yanıtta yer almıyor."));
    else if (score === 0) {
      parts.push(el("p", "note", "0 skor, IP'nin güvenli olduğunu kanıtlamaz; yalnızca AbuseIPDB'de güncel kötüye kullanım raporu bulunmadığını gösterir."));
    }

    const tags = el("div", "tags");
    if (data.isWhitelisted === true) tags.append(el("span", "tag", "Beyaz listede"));
    if (data.isTor === true) tags.append(el("span", "tag", "Tor çıkış düğümü"));
    if (tags.childElementCount > 0) parts.push(tags);

    const reports =
      data.totalReports === null
        ? null
        : data.numDistinctUsers === null
          ? String(data.totalReports)
          : `${data.totalReports} (${data.numDistinctUsers} kaynak)`;
    const dl = el("dl");
    dl.append(
      row(`Rapor (son ${periodText(data.maxAgeInDays)})`, reports),
      row("Son rapor", lastReportText(data)),
      row("Ülke", countryText(data.countryCode)),
      row("ISP", data.isp),
      row("Kullanım türü", data.usageType),
      row("Alan adı", data.domain),
    );
    parts.push(dl);

    const fetched = dateFormat.format(new Date(response.fetchedAt));
    const meta = response.fromCache
      ? `AbuseIPDB APIv2 · ${fetched} · önbellekten (${response.ttlMinutes} dk)`
      : `AbuseIPDB APIv2 · ${fetched}`;
    parts.push(noteBox());
    const quota = describeQuota(response.quota);
    if (quota) parts.push(el("p", quota.low ? "quota low" : "quota", quota.text));
    parts.push(
      footer(meta, [
        actionLink("AbuseIPDB'de aç", response.detailUrl || detailUrl(analysis.ip)),
        copyButton(response),
        refreshButton(analysis),
      ]),
    );
    setCardContent(analysis.ip, sev, parts, { copyIp: true });
  }

  function renderError(analysis, response) {
    const code = response.code in ERROR_MESSAGES ? response.code : "internal";
    const rateLimited = code === "rate_limited" && typeof response.retryAt === "number" && response.retryAt > Date.now();
    const detail = rateLimited
      ? `${timeFormat.format(new Date(response.retryAt))} sonrasında tekrar deneyin. Bilgiyi AbuseIPDB sayfasında görebilirsiniz.`
      : "Bilgiyi AbuseIPDB sayfasında doğrudan görebilirsiniz.";

    const actions = [actionLink("AbuseIPDB'de aç", detailUrl(analysis.ip))];
    if (code === "extension_unavailable") {
      // Messaging is broken until reload; only the link is useful.
    } else if (code === "unauthorized" || code === "forbidden") {
      actions.push(optionsButton("API anahtarını düzenle"));
    } else if (!rateLimited) {
      actions.push(actionButton("Tekrar dene", () => runLookup(analysis, true)));
    }
    setCardContent(analysis.ip, "error", [panel(ERROR_MESSAGES[code], detail), footer(null, actions)]);
  }

  function render(analysis, response) {
    if (!card) return;
    card.removeAttribute("aria-busy");
    switch (response?.status) {
      case "ok":
        renderResult(analysis, response);
        break;
      case "local":
        setCardContent(analysis.ip, "info", [
          panel(response.label, "Bu adres internette yönlendirilmediği için AbuseIPDB'ye gönderilmedi."),
        ]);
        break;
      case "no_key":
        setCardContent(analysis.ip, "info", [
          panel(
            "API anahtarı tanımlı değil",
            "Skor ve rapor bilgisi için eklenti simgesinden AbuseIPDB API anahtarı ekleyin ya da bilgiyi AbuseIPDB sayfasında görün.",
          ),
          footer(null, [actionLink("AbuseIPDB'de aç", detailUrl(analysis.ip)), optionsButton("API anahtarı ekle")]),
        ]);
        break;
      case "invalid":
        setCardContent(analysis.ip, "error", [panel("Seçim geçerli bir IP adresi değil.")]);
        break;
      default:
        renderError(analysis, { code: response?.code ?? "internal", retryAt: response?.retryAt ?? null });
    }
  }

  async function sendMessage(message) {
    if (!ext.runtime?.id) throw new Error("extension_unavailable");
    return ext.runtime.sendMessage(message);
  }

  async function runLookup(analysis, refresh) {
    const seq = ++requestSeq;
    if (card) {
      card.setAttribute("aria-busy", "true");
      if (!refresh) renderLoading(analysis.ip);
      else card.querySelectorAll("button.action").forEach((node) => { node.disabled = true; });
    }
    let response;
    try {
      response = await sendMessage({ type: "lookup", ip: analysis.ip, refresh });
    } catch {
      response = { status: "error", code: "extension_unavailable" };
    }
    if (seq !== requestSeq) return; // card closed or a newer request started
    render(analysis, response);
  }

  // ---------- events ----------

  document.addEventListener("mouseup", onSelectionEnd, true);
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key !== "Escape" && !isOwnEvent(event)) onSelectionEnd(event);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || (!card && !button)) return;
      hideButton();
      closeCard();
    },
    true,
  );
  document.addEventListener(
    "mousedown",
    (event) => {
      // A click anywhere outside our UI dismisses both the button and the card.
      if (isOwnEvent(event)) return;
      hideButton();
      closeCard();
    },
    true,
  );
  window.addEventListener("scroll", () => hideButton(), { capture: true, passive: true });
  window.addEventListener("resize", () => {
    hideButton();
    if (card) place(card, anchorRect());
  });

  ext.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== ext.runtime.id || message?.type !== "lookupSelection") return;
    const found = readSelection();
    if (!found) return;
    hideButton();
    openCard(found.analysis, found.rect);
  });
})();
