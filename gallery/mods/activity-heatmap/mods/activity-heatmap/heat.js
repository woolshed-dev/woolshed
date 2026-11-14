// Working minutes by hour, and the 7×24 grid made from them. No imports.
// Buckets: { "YYYY-MM-DDTHH": agent-minutes } (two agents working one minute = 2).

const pad = (n) => String(n).padStart(2, "0");
export const bucketOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`; };
const msOf = (key) => { const [d, h] = key.split("T"); const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd, Number(h)).getTime(); };

export const KEEP = 28 * 86400000;
export const STEP = 30000;

// One sample: `working` agents for the time since the last sample (at most two
// steps, so a gap while Woolshed was closed counts nothing). Returns the new
// buckets, or null when it's too soon (another copy just sampled).
export function sample(buckets, last, now, working) {
  if (last && now - last < STEP * 0.8) return null;
  const span = last && now - last <= STEP * 2 ? now - last : STEP;
  const next = {};
  for (const [k, v] of Object.entries(buckets ?? {})) if (now - msOf(k) < KEEP) next[k] = v;
  if (working > 0) {
    const k = bucketOf(now);
    next[k] = Math.round(((next[k] ?? 0) + (working * span) / 60000) * 100) / 100;
  }
  return next;
}

// Adds bucket sets together (your own and an example's).
export function merge(...sets) {
  const out = {};
  for (const s of sets) for (const [k, v] of Object.entries(s ?? {})) if (typeof v === "number" && v > 0) out[k] = (out[k] ?? 0) + v;
  return out;
}

// The grid: grid[row][hour] in minutes, rows Monday first, over the last `days` days.
export function grid(buckets, now, days = 28) {
  const g = Array.from({ length: 7 }, () => Array(24).fill(0));
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const start = from.getTime() - (days - 1) * 86400000;
  for (const [k, v] of Object.entries(buckets)) {
    const at = msOf(k);
    if (at < start || at > now) continue;
    const d = new Date(at);
    g[(d.getDay() + 6) % 7][d.getHours()] += v;
  }
  return g;
}

// The color step for a cell: 0 (nothing) to 5, by its share of the busiest cell.
export function level(v, max) {
  if (!v || !max) return 0;
  return Math.max(1, Math.min(5, Math.ceil((v / max) * 5)));
}

// Today's minutes by hour.
export function today(buckets, now) {
  const d = new Date(now);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T`;
  return Array.from({ length: 24 }, (_, h) => buckets[`${base}${pad(h)}`] ?? 0);
}
