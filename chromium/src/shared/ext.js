// Extension API namespace: Firefox exposes promise-based `browser`, Chromium `chrome`.
export const ext = globalThis.browser ?? globalThis.chrome;
