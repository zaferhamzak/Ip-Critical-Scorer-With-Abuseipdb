// Styles for the in-page button and card, applied inside a closed Shadow DOM so page CSS
// cannot leak in. Kept as a classic script because registered content scripts cannot be
// ES modules.
globalThis.AbuseIpdbCardStyles = `
:host { all: initial; }

* { box-sizing: border-box; }

.ui {
  --fg: #111827;
  --muted: #6b7280;
  --bg: #ffffff;
  --surface: #f3f4f6;
  --border: #e5e7eb;
  --focus: #2563eb;
  --btn-bg: #111827;
  --btn-fg: #ffffff;
  --sev: #6b7280;
  --sev-soft: #f3f4f6;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  font-style: normal;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  .ui {
    --fg: #f3f4f6;
    --muted: #9ca3af;
    --bg: #1f2125;
    --surface: #2a2d33;
    --border: #363a41;
    --focus: #60a5fa;
    --btn-bg: #f3f4f6;
    --btn-fg: #111827;
  }
}

/* Severity palette: set on the card via data-sev. */
.card[data-sev="none"]   { --sev: #6b7280; --sev-soft: rgba(107, 114, 128, 0.12); }
.card[data-sev="low"]    { --sev: #15803d; --sev-soft: rgba(21, 128, 61, 0.12); }
.card[data-sev="medium"] { --sev: #b45309; --sev-soft: rgba(180, 83, 9, 0.12); }
.card[data-sev="high"]   { --sev: #dc2626; --sev-soft: rgba(220, 38, 38, 0.12); }
.card[data-sev="info"]   { --sev: #2563eb; --sev-soft: rgba(37, 99, 235, 0.10); }
.card[data-sev="error"]  { --sev: #dc2626; --sev-soft: rgba(220, 38, 38, 0.10); }
@media (prefers-color-scheme: dark) {
  .card[data-sev="none"]   { --sev: #9ca3af; }
  .card[data-sev="low"]    { --sev: #4ade80; }
  .card[data-sev="medium"] { --sev: #fbbf24; }
  .card[data-sev="high"]   { --sev: #f87171; }
  .card[data-sev="info"]   { --sev: #60a5fa; }
  .card[data-sev="error"]  { --sev: #f87171; }
}

button, a { font: inherit; color: inherit; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* ---------- lookup button ---------- */

.lookup-button {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px 5px 9px;
  border: 0;
  border-radius: 999px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  /* Light ring keeps the dark button visible on dark SIEM/log pages. */
  box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.55), 0 4px 14px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
  animation: pop 120ms ease-out;
}
.lookup-button:hover { filter: brightness(1.15); }
.lookup-button .icon { width: 14px; height: 14px; flex: none; }

/* ---------- card ---------- */

.card {
  position: fixed;
  width: min(340px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-top: 4px solid var(--sev);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12);
  animation: pop 140ms ease-out;
}
.card:focus { outline: none; }

.header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 12px 10px 14px;
}
.title { flex: 1; min-width: 0; }
.source {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.ip {
  display: block;
  margin-top: 2px;
  font: 600 15px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
}

.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.close:hover { background: var(--surface); color: var(--fg); }

.body { padding: 0 14px 14px; }

/* score block */
.score-block {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--sev-soft);
}
.score-row { display: flex; align-items: baseline; gap: 6px; }
.score-value { font-size: 28px; font-weight: 700; line-height: 1; color: var(--sev); font-variant-numeric: tabular-nums; }
.score-max { color: var(--muted); font-size: 12px; }
.chip {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--sev);
  color: var(--bg);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.meter {
  height: 6px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.meter-fill { height: 100%; border-radius: inherit; background: var(--sev); }
.score-caption { margin-top: 6px; font-size: 11px; color: var(--muted); }

.note { margin: 8px 0 0; font-size: 12px; color: var(--muted); }

/* info / error panel for non-result states */
.panel {
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--sev);
  background: var(--sev-soft);
}
.panel-title { margin: 0; font-weight: 600; }
.panel-text { margin: 4px 0 0; color: var(--muted); font-size: 12px; }

.loading { display: flex; align-items: center; gap: 8px; color: var(--muted); padding: 4px 0 2px; }
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--fg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface);
  font-size: 11px;
  font-weight: 600;
}

dl { margin: 10px 0 0; }
.row {
  display: grid;
  grid-template-columns: 112px 1fr;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}
.row:first-child { border-top: 0; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.missing { color: var(--muted); font-style: italic; }

.footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.meta { flex: 1 1 100%; margin: 0 0 4px; font-size: 11px; color: var(--muted); }

.action {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.action:hover { background: var(--surface); }
.action.primary { background: var(--btn-bg); border-color: var(--btn-bg); color: var(--btn-fg); }
.action.primary:hover { filter: brightness(1.15); }
.action:disabled { opacity: 0.5; cursor: default; }
.action.icon-action { padding: 6px 10px; font-size: 14px; line-height: 1; }

@keyframes pop { from { opacity: 0; transform: translateY(-3px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .card, .lookup-button { animation: none; }
  .spinner { animation-duration: 2s; }
}
`;
