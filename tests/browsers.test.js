// Guards against drift between the two browser builds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p));
const manifest = (b) => JSON.parse(read(`${b}/manifest.json`));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("firefox/src and icons are identical to chromium (run scripts/sync-src.sh)", () => {
  for (const sub of ["src", "icons"]) {
    const chromium = files(join(root, "chromium", sub)).map((f) => relative(join(root, "chromium"), f)).sort();
    const firefox = files(join(root, "firefox", sub)).map((f) => relative(join(root, "firefox"), f)).sort();
    assert.deepEqual(firefox, chromium);
    for (const f of chromium) assert.ok(read(`chromium/${f}`).equals(read(`firefox/${f}`)), f);
  }
});

test("manifests agree on identity, version and permissions", () => {
  const c = manifest("chromium");
  const f = manifest("firefox");
  for (const key of ["name", "short_name", "version", "description", "icons", "permissions", "host_permissions", "optional_host_permissions", "action", "options_ui", "commands"]) {
    assert.deepEqual(f[key], c[key], key);
  }
});

test("each manifest uses its browser's background model", () => {
  assert.equal(manifest("chromium").background.service_worker, "src/background/service-worker.js");
  assert.deepEqual(manifest("firefox").background.scripts, ["src/background/service-worker.js"]);
  assert.equal(manifest("firefox").background.type, "module");
  const gecko = manifest("firefox").browser_specific_settings.gecko;
  assert.match(gecko.id, /@/);
  assert.ok(gecko.data_collection_permissions.required.length > 0);
});

test("no source file calls chrome.* directly (use ext from shared/ext.js)", () => {
  for (const f of files(join(root, "chromium", "src"))) {
    const code = readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const hits = code.filter((l) => /\bchrome\.(storage|permissions|scripting|runtime|commands|tabs|action)\b/.test(l));
    assert.deepEqual(hits, [], relative(root, f));
  }
});
