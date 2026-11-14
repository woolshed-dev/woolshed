// Readers for what uptime-card asks for: `sysctl -n kern.boottime` (macOS),
// /proc/uptime (Linux), `who`, and `hc server status --json`. Pure.

/** macOS `sysctl -n kern.boottime` ("{ sec = 1794294575, usec = 123364 } Tue Nov 10 ...") → ms since the epoch. */
export function parseBoottime(text) {
  const m = /sec = (\d+)/.exec(text ?? "");
  return m ? Number(m[1]) * 1000 : null;
}

/** Linux `/proc/uptime` ("282910.42 1102233.18") → boot time in ms since the epoch. */
export function bootFromUptime(text, now = Date.now()) {
  const s = Number((text ?? "").trim().split(/\s+/)[0]);
  return Number.isFinite(s) && s > 0 ? Math.round(now - s * 1000) : null;
}

/** `who` → [{ user, sessions, from: [hosts] }], most sessions first.
 *  macOS: "pat  console  10 Nov 18:42"; Linux: "alice pts/0 2026-11-11 09:12 (192.168.1.20)". */
export function parseWho(text) {
  const by = new Map();
  for (const line of (text ?? "").split("\n")) {
    const words = line.trim().split(/\s+/);
    if (words.length < 2 || !words[0]) continue;
    const host = /\(([^)]+)\)\s*$/.exec(line)?.[1];
    const u = by.get(words[0]) ?? { user: words[0], sessions: 0, from: [] };
    u.sessions += 1;
    // A local terminal shows its display or tty there: only remote hosts count.
    if (host && !/^(:\d|tty|pts|console)/.test(host) && !u.from.includes(host)) u.from.push(host);
    by.set(words[0], u);
  }
  return [...by.values()].sort((a, b) => b.sessions - a.sessions || a.user.localeCompare(b.user));
}

/** `hc server status --json` → { uptime, version, live, name } (uptime in ms), or null. */
export function parseCoreStatus(text) {
  let s;
  try { s = JSON.parse(text ?? ""); } catch { return null; }
  if (typeof s?.uptime_ms !== "number") return null;
  return { uptime: s.uptime_ms, version: s.version ?? null, live: s.live ?? null, name: s.core?.name ?? null };
}

/** ms → "3 days 4 h", "18 h 15 min", "9 min", "40 s". */
export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} day${d === 1 ? "" : "s"} ${h % 24} h` : `${d} day${d === 1 ? "" : "s"}`;
}

/** The short form for a strip: "3 d", "18 h", "9 min". */
export function short(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ms → "Tue 10 Nov, 18:09" (this computer's clock). */
export function when(ms) {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
