import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, parseLatestRelease, checkLatestRelease, RELEASES_PAGE_URL } from "../src/shared/update.js";

test("compareVersions orders x.y.z numerically", () => {
  assert.equal(compareVersions("0.4.0", "0.3.0"), 1);
  assert.equal(compareVersions("v0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("0.3.0", "0.3.1"), -1);
  assert.equal(compareVersions("latest", "0.3.0"), null);
  assert.equal(compareVersions("1.0", "1.0.0"), null);
});

test("parseLatestRelease accepts only this repository's links and stable releases", () => {
  const ok = parseLatestRelease({ tag_name: "v0.4.0", html_url: "https://github.com/zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb/releases/tag/v0.4.0" });
  assert.deepEqual(ok, { version: "0.4.0", url: "https://github.com/zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb/releases/tag/v0.4.0" });
  assert.equal(parseLatestRelease({ tag_name: "v0.4.0", html_url: "https://evil.example/x" }).url, RELEASES_PAGE_URL);
  assert.equal(parseLatestRelease({ tag_name: "v0.4.0", prerelease: true }), null);
  assert.equal(parseLatestRelease({ tag_name: "nightly" }), null);
  assert.equal(parseLatestRelease(null), null);
});

test("checkLatestRelease reports availability and sends no credentials", async () => {
  let seen;
  const fetchFn = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ tag_name: "v0.5.0" }), { status: 200 }); };
  const r = await checkLatestRelease({ fetchFn, currentVersion: "0.3.0", now: () => 42 });
  assert.deepEqual(r, { latestVersion: "0.5.0", url: RELEASES_PAGE_URL, updateAvailable: true, checkedAt: 42 });
  assert.equal(seen.url, "https://api.github.com/repos/zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb/releases/latest");
  assert.equal(seen.init.credentials, "omit");
  const same = await checkLatestRelease({ fetchFn, currentVersion: "0.5.0" });
  assert.equal(same.updateAvailable, false);
});

test("checkLatestRelease returns null on HTTP errors and network failures", async () => {
  assert.equal(await checkLatestRelease({ fetchFn: async () => new Response("{}", { status: 404 }), currentVersion: "0.3.0" }), null);
  assert.equal(await checkLatestRelease({ fetchFn: async () => { throw new TypeError("offline"); }, currentVersion: "0.3.0" }), null);
});
