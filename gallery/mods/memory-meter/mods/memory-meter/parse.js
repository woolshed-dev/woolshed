// Readers for what memory-meter asks for: `vm_stat` and
// `sysctl -n hw.memsize vm.swapusage kern.memorystatus_vm_pressure_level`
// (macOS), `cat /proc/meminfo` and /proc/pressure/memory (Linux). Pure.
// Every reader returns bytes: { total, used, parts: [{ name, bytes }], swap:
// { total, used }, pressure: "normal" | "warning" | "critical" | null }.

const MB = 1024 * 1024;

/** macOS `vm_stat` → { pageSize, pages: { "free": n, "wired down": n, ... } }. */
export function parseVmStat(text) {
  const lines = (text ?? "").split("\n");
  const size = /page size of (\d+) bytes/.exec(lines[0] ?? "");
  const pages = {};
  for (const line of lines.slice(1)) {
    const m = /^"?([^":]+)"?:\s+(\d+)\.?$/.exec(line.trim());
    if (m) pages[m[1].replace(/^Pages /, "").trim().toLowerCase()] = Number(m[2]);
  }
  return { pageSize: size ? Number(size[1]) : 4096, pages };
}

/** `vm.swapusage` → { total, used } in bytes ("total = 2048.00M  used = 1024.00M ..."). */
export function parseSwapusage(text) {
  const n = (key) => {
    const m = new RegExp(`${key} = ([\\d.]+)([KMG])`).exec(text ?? "");
    return m ? Number(m[1]) * { K: 1024, M: MB, G: 1024 * MB }[m[2]] : 0;
  };
  return { total: n("total"), used: n("used") };
}

const LEVELS = { 1: "normal", 2: "warning", 4: "critical" };

/** macOS: `vm_stat` and the three sysctl lines → the memory reading.
 *  Used is what Activity Monitor calls Memory Used: app memory + wired + compressed. */
export function readMac(vmStatText, sysctlText) {
  const { pageSize, pages } = parseVmStat(vmStatText);
  const [memsize, swap, level] = (sysctlText ?? "").split("\n");
  const total = Number(memsize) || 0;
  if (!total || pages.free === undefined) return null;
  const p = (k) => (pages[k] ?? 0) * pageSize;
  const app = Math.max(0, p("anonymous pages") - p("purgeable"));
  const wired = p("wired down");
  const compressed = p("occupied by compressor");
  const used = Math.min(total, app + wired + compressed);
  return {
    total, used,
    parts: [{ name: "App", bytes: app }, { name: "Wired", bytes: wired }, { name: "Compressed", bytes: compressed }],
    cached: p("file-backed pages") + p("purgeable"),
    swap: parseSwapusage(swap),
    pressure: LEVELS[Number(level)] ?? null,
  };
}

/** Linux `/proc/meminfo` (and, if there, `/proc/pressure/memory`) → the memory reading.
 *  Used is total minus MemAvailable; cache is what the kernel gives back when asked. */
export function readLinux(meminfoText, pressureText) {
  const kb = {};
  for (const line of (meminfoText ?? "").split("\n")) {
    const m = /^(\w+(?:\(\w+\))?):\s+(\d+)/.exec(line);
    if (m) kb[m[1]] = Number(m[2]) * 1024;
  }
  const total = kb.MemTotal ?? 0;
  if (!total) return null;
  const available = kb.MemAvailable ?? (kb.MemFree ?? 0) + (kb.Cached ?? 0) + (kb.Buffers ?? 0);
  const used = Math.max(0, total - available);
  const cached = (kb.Cached ?? 0) + (kb.Buffers ?? 0) + (kb.SReclaimable ?? 0);
  const swap = { total: kb.SwapTotal ?? 0, used: Math.max(0, (kb.SwapTotal ?? 0) - (kb.SwapFree ?? 0)) };
  return { total, used, parts: [{ name: "Used", bytes: used }], cached, swap, pressure: pressureOf(pressureText, used / total) };
}

/** Pressure from PSI's `some avg10` (share of the last 10 s some task waited on memory),
 *  else from how full memory is. */
export function pressureOf(text, share) {
  const m = /some avg10=([\d.]+)/.exec(text ?? "");
  if (m) {
    const v = Number(m[1]);
    return v >= 25 ? "critical" : v >= 5 ? "warning" : "normal";
  }
  if (share === undefined) return null;
  return share >= 0.95 ? "critical" : share >= 0.85 ? "warning" : "normal";
}

/** 1536 MiB → "1.5 GB"; under a GB in MB. */
export function size(bytes) {
  if (!bytes) return "0 MB";
  const gb = bytes / (1024 * MB);
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / MB)} MB`;
}
