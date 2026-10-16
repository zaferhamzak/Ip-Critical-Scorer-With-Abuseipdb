// Runs updater/update.sh against a synthetic local release (file:// URLs); no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../updater/update.sh", import.meta.url).pathname;

function manifest(version) {
  return JSON.stringify({ manifest_version: 3, name: "x", version }, null, 2);
}

function fixture({ installed = "0.3.0", released = "0.4.0", assetName } = {}) {
  const root = mkdtempSync(join(tmpdir(), "updater-test-"));
  const target = join(root, "installed");
  mkdirSync(join(target, "src"), { recursive: true });
  writeFileSync(join(target, "manifest.json"), manifest(installed));
  writeFileSync(join(target, "src", "app.js"), "old");
  writeFileSync(join(target, "src", "removed.js"), "gone in new version");

  const build = join(root, "build", "abuseipdb-ip-lookup");
  mkdirSync(join(build, "src"), { recursive: true });
  writeFileSync(join(build, "manifest.json"), manifest(released));
  writeFileSync(join(build, "src", "app.js"), "new");
  writeFileSync(join(build, "src", "added.js"), "added");
  const assets = join(root, "assets");
  mkdirSync(assets);
  const zip = join(assets, assetName ?? `abuseipdb-ip-lookup-${released}.zip`);
  execFileSync("zip", ["-qr", zip, "abuseipdb-ip-lookup"], { cwd: join(root, "build") });

  const releaseJson = join(root, "release.json");
  writeFileSync(releaseJson, JSON.stringify({ tag_name: `v${released}`, assets: [{ browser_download_url: `file://${zip}` }] }, null, 2));
  return { root, target, env: { ...process.env, UPDATE_API_URL: `file://${releaseJson}`, UPDATE_ASSET_PREFIX: `file://${assets}/` } };
}

const run = (target, env) => spawnSync("/bin/sh", [script, target], { env, encoding: "utf8" });

test("updates files, removes stale ones and writes the manifest", () => {
  const { target, env } = fixture();
  const r = run(target, env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /updated to v0\.4\.0/);
  assert.match(readFileSync(join(target, "manifest.json"), "utf8"), /"version": "0\.4\.0"/);
  assert.equal(readFileSync(join(target, "src", "app.js"), "utf8"), "new");
  assert.equal(existsSync(join(target, "src", "added.js")), true);
  assert.equal(existsSync(join(target, "src", "removed.js")), false);
  const again = run(target, env);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /up to date \(v0\.4\.0\)/);
});

test("understands minified GitHub JSON", () => {
  const f = fixture();
  const releaseJson = join(f.root, "release.json");
  writeFileSync(releaseJson, JSON.stringify(JSON.parse(readFileSync(releaseJson, "utf8"))));
  const r = run(f.target, f.env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /updated to v0\.4\.0/);
});

test("does nothing when the release is not newer", () => {
  const { target, env } = fixture({ installed: "0.5.0", released: "0.4.0" });
  const r = run(target, env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /up to date/);
  assert.equal(readFileSync(join(target, "src", "app.js"), "utf8"), "old");
});

test("refuses downloads from outside the expected release location", () => {
  const { target, env } = fixture();
  const r = run(target, { ...env, UPDATE_ASSET_PREFIX: "https://github.com/someone-else/" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /unexpected download URL/);
  assert.equal(readFileSync(join(target, "src", "app.js"), "utf8"), "old");
});

test("refuses a package whose manifest version does not match the tag", () => {
  const f = fixture({ released: "0.4.0" });
  // Re-point the release tag to a different version than the packaged manifest.
  const releaseJson = join(f.root, "release.json");
  writeFileSync(releaseJson, readFileSync(releaseJson, "utf8").replace('"v0.4.0"', '"v0.6.0"'));
  const r = run(f.target, f.env);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /does not match/);
  assert.match(readFileSync(join(f.target, "manifest.json"), "utf8"), /"version": "0\.3\.0"/);
});

test("rejects a folder without a manifest", () => {
  const { root, env } = fixture();
  const r = run(join(root, "nope"), env);
  assert.equal(r.status, 1);
});
