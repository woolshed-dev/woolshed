// Agent hours' bookkeeping, kept apart from the UI so it can be tested.
// Every few seconds a copy looks at which spaces have a working agent. The
// time from the last look to this one is put on the spaces that were working
// at the last look (so a change shows from when it was seen), split at local
// midnight. A gap of more than 30 s (Woolshed closed, the computer asleep)
// counts nothing.
//   days: { "2026-11-11": { total: ms with any agent working, agent: ms summed over
//           agents, spaces: { "<space name>": ms with an agent working there } } }
//   last: { at: ms, working: { "<space name>": agents working } } | null

const DAY = 86400000;
export const GAP = 30000;
export const KEEP = 14;
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nextMidnight = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };

/** Which spaces have working agents, and how many: from agents(). */
export function working(agents) {
  const out = {};
  for (const a of agents ?? []) if (a?.status === "working") { const k = a.space_name || "space"; out[k] = (out[k] ?? 0) + 1; }
  return out;
}

const any = (w) => Boolean(w && Object.keys(w).length);

/** Puts [from, to) on the days it covers, for the spaces in `w`. */
export function add(days, from, to, w) {
  const out = { ...days };
  if (!any(w) || to <= from) return out;
  const count = Object.values(w).reduce((a, b) => a + b, 0);
  for (let a = from; a < to;) {
    const b = Math.min(to, nextMidnight(a));
    const key = dayKey(a);
    const d = out[key] ?? { total: 0, agent: 0, spaces: {} };
    const span = b - a;
    const spaces = { ...d.spaces };
    for (const name of Object.keys(w)) spaces[name] = (spaces[name] ?? 0) + span;
    out[key] = { total: d.total + span, agent: d.agent + span * count, spaces };
    a = b;
  }
  return out;
}

/** Only the newest KEEP days. */
export function prune(days) {
  const keys = Object.keys(days).sort().slice(-KEEP);
  return Object.fromEntries(keys.map((k) => [k, days[k]]));
}

/** One look at `now` with `w` working: { days, last, write } (write: whether anything changed). */
export function look(days, last, now, w) {
  let next = days;
  if (last && now - last.at <= GAP && now > last.at) next = prune(add(days, last.at, now, last.working));
  if (!any(w)) return { days: next, last: null, write: Boolean(last) };
  return { days: next, last: { at: now, working: w }, write: true };
}

/** The 7 days ending today: { key, label (weekday), total, today }. */
export function week(days, now = Date.now()) {
  const d = new Date(now);
  return [...Array(7)].map((_, i) => {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6 + i, 12).getTime();
    const key = dayKey(t);
    return { key, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(t).getDay()], total: days[key]?.total ?? 0, today: i === 6 };
  });
}

/** Today's spaces, most time first. */
export function spaces(day) {
  return Object.entries(day?.spaces ?? {}).map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
}

/** "3h 42m", "12m", "45s", "0m". */
export function dur(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 60) return s ? `${s}s` : "0m";
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

/** Cleans what was stored. */
export function cleanDays(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== "object") continue;
    const sp = {};
    for (const [n, ms] of Object.entries(v.spaces ?? {})) if (Number(ms) > 0) sp[n] = Number(ms);
    out[k] = { total: Math.max(0, Number(v.total) || 0), agent: Math.max(0, Number(v.agent) || 0), spaces: sp };
  }
  return prune(out);
}
