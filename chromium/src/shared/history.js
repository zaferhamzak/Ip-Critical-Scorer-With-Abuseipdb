// Lookup history: pure helpers over a plain array stored in storage.local.
// Newest first, one entry per IP (a repeat lookup replaces the older entry).

export const MAX_HISTORY_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Builds a history entry from an "ok" lookup response. */
export function entryFromResult(result, now) {
  return {
    ip: result.data.ipAddress,
    at: now,
    fetchedAt: typeof result.fetchedAt === "number" ? result.fetchedAt : now,
    detailUrl: result.detailUrl,
    data: result.data,
    note: "",
  };
}

function isEntry(e) {
  return e && typeof e === "object" && typeof e.ip === "string" && typeof e.at === "number" && e.data && typeof e.data === "object";
}

/** Drops malformed entries and anything older than `days`. */
export function pruneHistory(list, days, now) {
  if (!Array.isArray(list)) return [];
  const cutoff = now - days * DAY_MS;
  return list.filter((e) => isEntry(e) && e.at >= cutoff && e.at <= now + DAY_MS).slice(0, MAX_HISTORY_ENTRIES);
}

/** Adds an entry on top; an existing entry for the same IP is replaced but keeps its note. */
export function addEntry(list, entry, days, now) {
  const current = pruneHistory(list, days, now);
  const previous = current.find((e) => e.ip === entry.ip);
  const merged = { ...entry, note: entry.note || previous?.note || "" };
  return [merged, ...current.filter((e) => e.ip !== entry.ip)].slice(0, MAX_HISTORY_ENTRIES);
}

/** Sets the same note on the given IPs. */
export function setNote(list, ips, note) {
  const wanted = new Set(ips);
  return (Array.isArray(list) ? list : []).map((e) => (wanted.has(e.ip) ? { ...e, note } : e));
}

export function removeEntries(list, ips) {
  const drop = new Set(ips);
  return (Array.isArray(list) ? list : []).filter((e) => !drop.has(e.ip));
}

/** Shape expected by ExportTools.buildRow. The export time is the lookup time. */
export function entryToResult(entry) {
  return { status: "ok", fetchedAt: entry.fetchedAt ?? entry.at, detailUrl: entry.detailUrl, data: entry.data, note: entry.note };
}
