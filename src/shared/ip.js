// IP parsing and special-purpose address classification.
// Written as a classic script that publishes `globalThis.IpTools` so the same file can be
// loaded by the content script (classic), the module service worker (side-effect import)
// and Node tests. It performs no I/O.
(() => {
  "use strict";

  const MAX_INPUT_LENGTH = 100;

  // ---------- parsing ----------

  function parseIPv4(text) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
    if (!m) return null;
    let value = 0;
    for (let i = 1; i <= 4; i += 1) {
      const part = m[i];
      // Leading zeros are ambiguous (octal in some tools); reject them.
      if (part.length > 1 && part[0] === "0") return null;
      const n = Number(part);
      if (n > 255) return null;
      value = value * 256 + n;
    }
    return { version: 4, value, ip: m.slice(1, 5).map(Number).join(".") };
  }

  function parseIPv6(input) {
    const text = input.toLowerCase();
    if (!/^[0-9a-f:.]+$/.test(text) || !text.includes(":")) return null;

    let head = text;
    let tail = [];
    if (text.includes(".")) {
      const idx = text.lastIndexOf(":");
      const v4 = parseIPv4(text.slice(idx + 1));
      if (!v4) return null;
      tail = [Math.floor(v4.value / 65536), v4.value % 65536];
      head = text.slice(0, idx + 1);
      // "::1.2.3.4" leaves "::", "a::1.2.3.4" leaves "a::", "a:b:...:1.2.3.4" leaves "a:b:...:".
      if (head.endsWith(":") && !head.endsWith("::")) head = head.slice(0, -1);
    }

    const doubleColon = head.indexOf("::");
    if (doubleColon !== -1 && head.indexOf("::", doubleColon + 1) !== -1) return null;

    const parseGroups = (s) => {
      if (s === "") return [];
      const parts = s.split(":");
      const groups = [];
      for (const p of parts) {
        if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
        groups.push(parseInt(p, 16));
      }
      return groups;
    };

    let groups;
    if (doubleColon === -1) {
      groups = parseGroups(head);
      if (!groups) return null;
      groups = groups.concat(tail);
      if (groups.length !== 8) return null;
    } else {
      const left = parseGroups(head.slice(0, doubleColon));
      const right = parseGroups(head.slice(doubleColon + 2));
      if (!left || !right) return null;
      const known = left.length + right.length + tail.length;
      if (known > 7) return null;
      groups = left.concat(new Array(8 - known).fill(0), right, tail);
    }

    let value = 0n;
    for (const g of groups) value = (value << 16n) | BigInt(g);
    return { version: 6, value, ip: formatIPv6(groups) };
  }

  // RFC 5952 canonical text form.
  function formatIPv6(groups) {
    const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (isMapped) {
      const v4 = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
      return `::ffff:${v4}`;
    }
    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < 8; ) {
      if (groups[i] !== 0) { i += 1; continue; }
      let j = i;
      while (j < 8 && groups[j] === 0) j += 1;
      if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
      i = j;
    }
    const hex = groups.map((g) => g.toString(16));
    if (bestLen < 2) return hex.join(":");
    const left = hex.slice(0, bestStart).join(":");
    const right = hex.slice(bestStart + bestLen).join(":");
    return `${left}::${right}`;
  }

  // Cleans up a user selection: surrounding punctuation, defanged dots, brackets, ports.
  function cleanSelection(text) {
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_INPUT_LENGTH) return null;
    let s = text.trim().replace(/\[\.\]|\(\.\)|\{\.\}/g, ".");
    s = s.replace(/^[\s"'`<({,;]+/, "").replace(/[\s"'`>)},;.]+$/, "");
    let m = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/.exec(s);
    if (m) return m[1];
    s = s.replace(/^\[|\]$/g, "");
    m = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(s);
    if (m) return m[1];
    return s.length > 0 ? s : null;
  }

  function parseIp(text) {
    const s = cleanSelection(text);
    if (!s) return null;
    return parseIPv4(s) || parseIPv6(s);
  }

  // ---------- classification ----------

  const V4_SPECIAL = [
    ["0.0.0.0", 8, "this-network", "“Bu ağ” adresi (0.0.0.0/8)"],
    ["10.0.0.0", 8, "private", "Özel ağ adresi (RFC 1918)"],
    ["100.64.0.0", 10, "shared", "Paylaşımlı adres alanı / CGNAT (RFC 6598)"],
    ["127.0.0.0", 8, "loopback", "Loopback adresi"],
    ["169.254.0.0", 16, "link-local", "Link-local adres"],
    ["172.16.0.0", 12, "private", "Özel ağ adresi (RFC 1918)"],
    ["192.0.0.0", 24, "ietf", "IETF protokol ataması (192.0.0.0/24)"],
    ["192.0.2.0", 24, "documentation", "Dokümantasyon adresi (TEST-NET-1)"],
    ["192.88.99.0", 24, "6to4-relay", "6to4 relay anycast (kullanımdan kalktı)"],
    ["192.168.0.0", 16, "private", "Özel ağ adresi (RFC 1918)"],
    ["198.18.0.0", 15, "benchmarking", "Ağ performans testi adresi (RFC 2544)"],
    ["198.51.100.0", 24, "documentation", "Dokümantasyon adresi (TEST-NET-2)"],
    ["203.0.113.0", 24, "documentation", "Dokümantasyon adresi (TEST-NET-3)"],
    ["224.0.0.0", 4, "multicast", "Multicast adresi"],
    ["255.255.255.255", 32, "broadcast", "Yayın (broadcast) adresi"],
    ["240.0.0.0", 4, "reserved", "Gelecek kullanım için ayrılmış adres (240.0.0.0/4)"],
  ].map(([base, bits, category, label]) => ({ base: parseIPv4(base).value, bits, category, label }));

  const V6_SPECIAL = [
    ["::", 128, "unspecified", "Belirtilmemiş adres (::)"],
    ["::1", 128, "loopback", "Loopback adresi"],
    ["::ffff:0:0", 96, "ipv4-mapped", "IPv4 eşlemeli adres; içindeki IPv4 adresini ayrıca seçip sorgulayın"],
    ["64:ff9b:1::", 48, "nat64-local", "Yerel NAT64 çeviri adresi"],
    ["64:ff9b::", 96, "nat64", "NAT64 çeviri adresi; içindeki IPv4 adresini ayrıca sorgulayın"],
    ["100::", 64, "discard", "Atılacak (discard-only) adres"],
    ["2001:db8::", 32, "documentation", "Dokümantasyon adresi (2001:db8::/32)"],
    ["2001::", 23, "ietf", "IETF protokol ataması (2001::/23)"],
    ["2002::", 16, "6to4", "6to4 adresi"],
    ["3fff::", 20, "documentation", "Dokümantasyon adresi (3fff::/20)"],
    ["fc00::", 7, "unique-local", "Benzersiz yerel adres (ULA, fc00::/7)"],
    ["fe80::", 10, "link-local", "Link-local adres"],
    ["fec0::", 10, "site-local", "Site-local adres (kullanımdan kalktı)"],
    ["ff00::", 8, "multicast", "Multicast adresi"],
  ].map(([base, bits, category, label]) => ({ base: parseIPv6(base).value, bits, category, label }));

  const V6_GLOBAL_UNICAST = { base: parseIPv6("2000::").value, bits: 3 };

  function inV4(value, base, bits) {
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) === Math.floor(base / size);
  }

  function inV6(value, base, bits) {
    const shift = BigInt(128 - bits);
    return value >> shift === base >> shift;
  }

  function classifyParsed(parsed) {
    const table = parsed.version === 4 ? V4_SPECIAL : V6_SPECIAL;
    const within = parsed.version === 4 ? inV4 : inV6;
    for (const entry of table) {
      if (within(parsed.value, entry.base, entry.bits)) {
        return { isPublic: false, category: entry.category, label: entry.label };
      }
    }
    if (parsed.version === 6 && !inV6(parsed.value, V6_GLOBAL_UNICAST.base, V6_GLOBAL_UNICAST.bits)) {
      return { isPublic: false, category: "reserved", label: "Global unicast aralığı (2000::/3) dışında ayrılmış adres" };
    }
    return { isPublic: true, category: "public", label: "Genel (public) adres" };
  }

  /**
   * Returns null for anything that is not exactly one IP address, otherwise
   * { ip, version, isPublic, category, label } with `ip` in canonical form.
   */
  function analyzeSelection(text) {
    const parsed = parseIp(text);
    if (!parsed) return null;
    return { ip: parsed.ip, version: parsed.version, ...classifyParsed(parsed) };
  }

  function detailUrl(ip) {
    const parsed = parseIp(ip);
    if (!parsed) return "https://www.abuseipdb.com/";
    return `https://www.abuseipdb.com/check/${parsed.ip}`;
  }

  globalThis.IpTools = Object.freeze({ MAX_INPUT_LENGTH, cleanSelection, parseIp, analyzeSelection, detailUrl });
})();
