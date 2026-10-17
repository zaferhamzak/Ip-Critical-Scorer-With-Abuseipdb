import { test } from "node:test";
import assert from "node:assert/strict";
import { addEntry, addToList, entryFromResult, sanitizeList, entryToResult, pruneHistory, removeEntries, setNote, MAX_HISTORY_ENTRIES } from "../chromium/src/shared/history.js";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;
const result = (ip, score = 50) => ({ status: "ok", fetchedAt: now - 1000, detailUrl: `https://www.abuseipdb.com/check/${ip}`, data: { ipAddress: ip, abuseConfidenceScore: score } });

test("newest first, one entry per IP, note survives a repeat lookup", () => {
  let list = addEntry([], entryFromResult(result("8.8.8.8", 10), now - 5000), 7, now);
  list = addEntry(list, entryFromResult(result("1.1.1.1"), now - 4000), 7, now);
  list = setNote(list, ["8.8.8.8"], "False positive");
  list = addEntry(list, entryFromResult(result("8.8.8.8", 20), now), 7, now);
  assert.deepEqual(list.map((e) => e.ip), ["8.8.8.8", "1.1.1.1"]);
  assert.equal(list[0].data.abuseConfidenceScore, 20);
  assert.equal(list[0].note, "False positive");
});

test("retention drops old and malformed entries; size is capped", () => {
  const old = { ...entryFromResult(result("9.9.9.9"), now - 8 * DAY) };
  const fresh = entryFromResult(result("8.8.8.8"), now - DAY);
  assert.deepEqual(pruneHistory([old, fresh, { ip: 1 }, null], 7, now).map((e) => e.ip), ["8.8.8.8"]);
  assert.deepEqual(pruneHistory("nope", 7, now), []);
  let list = [];
  for (let i = 0; i < MAX_HISTORY_ENTRIES + 20; i++) list = addEntry(list, entryFromResult(result(`1.1.${Math.floor(i / 250)}.${i % 250}`), now), 7, now);
  assert.equal(list.length, MAX_HISTORY_ENTRIES);
});

test("remove and export helpers", () => {
  let list = [entryFromResult(result("8.8.8.8"), now), entryFromResult(result("1.1.1.1"), now)];
  list = setNote(list, ["1.1.1.1", "8.8.8.8"], "Bloklandı");
  assert.ok(list.every((e) => e.note === "Bloklandı"));
  assert.deepEqual(removeEntries(list, ["8.8.8.8"]).map((e) => e.ip), ["1.1.1.1"]);
  const r = entryToResult(list[0]);
  assert.equal(r.status, "ok");
  assert.equal(r.note, "Bloklandı");
  assert.equal(r.fetchedAt, now - 1000);
});

test("Excel list keeps picked IPs in order, replaces duplicates and keeps notes", () => {
  const e = (ip, note = "") => ({ ...entryFromResult(result(ip), now), note });
  let list = addToList([], [e("8.8.8.8", "Bloklandı"), e("1.1.1.1")]);
  assert.deepEqual(list.map((x) => x.ip), ["8.8.8.8", "1.1.1.1"]);
  list = addToList(list, [e("9.9.9.9"), e("8.8.8.8")]);
  assert.deepEqual(list.map((x) => x.ip), ["9.9.9.9", "8.8.8.8", "1.1.1.1"]);
  assert.equal(list[1].note, "Bloklandı");
  list = addToList(list, [e("1.1.1.1", "False positive")]);
  assert.equal(list[0].note, "False positive");
  assert.deepEqual(sanitizeList([{ ip: 1 }, null, ...list]).length, 3);
  assert.deepEqual(sanitizeList("x"), []);
});
