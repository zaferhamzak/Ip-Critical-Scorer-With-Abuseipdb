// Update helpers: GitHub release check and version comparison.
// The extension cannot rewrite its own files; the external updater script does that.
// This module only reports whether a newer release exists.

export const UPDATE_REPO = "zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb";
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPO}/releases/latest`;
export const UPDATE_STATE_KEY = "update:latest";

const RELEASE_URL_PREFIX = `https://github.com/${UPDATE_REPO}/releases/`;

export function parseVersion(value) {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(String(value ?? "").trim());
  return m ? m.slice(1).map(Number) : null;
}

/** Returns -1, 0 or 1; null when either side is not an x.y.z version. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Extracts { version, url } from a GitHub "latest release" response, or null. */
export function parseLatestRelease(body) {
  if (!body || typeof body !== "object" || body.draft === true || body.prerelease === true) return null;
  const version = parseVersion(body.tag_name);
  if (!version) return null;
  const url =
    typeof body.html_url === "string" && body.html_url.startsWith(RELEASE_URL_PREFIX)
      ? body.html_url
      : RELEASES_PAGE_URL;
  return { version: version.join("."), url };
}

/**
 * Asks GitHub for the latest release. Sends no user data; no cookies.
 * @returns {Promise<{latestVersion: string, url: string, updateAvailable: boolean, checkedAt: number} | null>}
 */
export async function checkLatestRelease({ fetchFn, currentVersion, now = Date.now, timeoutMs = 15_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(LATEST_RELEASE_URL, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const release = parseLatestRelease(await response.json());
    if (!release) return null;
    return {
      latestVersion: release.version,
      url: release.url,
      updateAvailable: compareVersions(release.version, currentVersion) === 1,
      checkedAt: now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
