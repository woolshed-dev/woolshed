// Readers for what machines-health asks for: `hc machine ls --json` and, on
// each machine, `uptime` followed by its core count (`nproc`, else
// `sysctl -n hw.ncpu`). Pure.

/** `hc machine ls --json` → [{ name, host, state, why, since, version, temporary }]. */
export function parseMachines(text) {
  let doc;
  try { doc = JSON.parse(text ?? ""); } catch { return null; }
  const list = Array.isArray(doc?.machines) ? doc.machines : [];
  return list.map((m) => ({
    name: String(m.name ?? "?"),
    host: m.host ?? null,
    state: String(m.state ?? "connecting"),
    why: m.why ?? null,
    since: typeof m.since_ms === "number" ? m.since_ms : null,
    version: m.version ?? null,
    temporary: m.temporary === true,
  }));
}

/** `uptime` (Linux, macOS, BusyBox), then a line with the core count →
 *  { load: [1m, 5m, 15m], up (minutes), users, cores }, or null. */
export function parseUptime(text) {
  const lines = (text ?? "").trim().split("\n");
  const line = lines.find((l) => /load averages?:/.test(l));
  if (!line) return null;
  const load = /load averages?:\s*([\d.]+),?\s+([\d.]+),?\s+([\d.]+)/.exec(line);
  const users = /(\d+) users?/.exec(line);
  const cores = Number(lines.find((l) => /^\s*\d+\s*$/.test(l))?.trim()) || null;
  return {
    load: load ? [Number(load[1]), Number(load[2]), Number(load[3])] : null,
    up: upMinutes(line),
    users: users ? Number(users[1]) : null,
    cores,
  };
}

/** The "up ..." part of an uptime line in minutes: "3 days,  4:05", "18:15", "5 mins", "2 hrs", "1 day, 12 min". */
export function upMinutes(line) {
  const m = /\bup\s+(.*?),?\s+(?:\d+ users?|load averages?)/.exec(line);
  if (!m) return null;
  let total = 0, found = false;
  const part = m[1];
  const days = /(\d+)\s+days?/.exec(part);
  if (days) { total += Number(days[1]) * 1440; found = true; }
  const hm = /(\d+):(\d\d)/.exec(part);
  if (hm) { total += Number(hm[1]) * 60 + Number(hm[2]); found = true; }
  const hrs = /(\d+)\s+hrs?\b/.exec(part);
  if (hrs) { total += Number(hrs[1]) * 60; found = true; }
  const mins = /(\d+)\s+mins?\b/.exec(part);
  if (mins) { total += Number(mins[1]); found = true; }
  if (/\d+\s+secs?\b/.test(part)) found = true;
  return found ? total : null;
}

/** Minutes → "3 d 4 h", "18 h 15 min", "5 min". */
export function since(minutes) {
  if (minutes === null || minutes === undefined) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return minutes % 60 ? `${h} h ${minutes % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** How busy, from the 1-minute load over the cores: "ok" | "busy" | "over". */
export function strain(load, cores) {
  if (!load || !cores) return "ok";
  const r = load[0] / cores;
  return r > 1 ? "over" : r > 0.7 ? "busy" : "ok";
}
