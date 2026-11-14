// Break reminder's logic, kept apart from the UI so it can be tested.
// The work stretch starts at your last break. A break is: time away from the
// keyboard and mouse for a break's length (where the system says how long it's
// been idle), the computer asleep or Woolshed closed that long, or a break you
// start or mark yourself.

const MINUTE = 60000;
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

export const DEFAULTS = { work: 50, rest: 5, snooze: 10, quiet: [1140, 480] };
export const CHOICES = {
  work: [25, 30, 45, 50, 60, 75, 90],
  rest: [3, 5, 10, 15],
  snooze: [5, 10, 15, 30],
  quiet: [null, [1080, 480], [1140, 480], [1200, 420], [1320, 420]],
};

export function settings(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  for (const k of ["work", "rest", "snooze"]) if (!CHOICES[k].includes(s[k])) s[k] = DEFAULTS[k];
  if (s.quiet !== null && !(Array.isArray(s.quiet) && s.quiet.length === 2)) s.quiet = DEFAULTS.quiet;
  return s;
}

/** The next choice after the current one. */
export function cycle(key, current) {
  const list = CHOICES[key];
  const i = list.findIndex((c) => JSON.stringify(c) === JSON.stringify(current));
  return list[(i + 1) % list.length];
}

export const quietLabel = (q) => (q ? `quiet ${hhmm(q[0])}–${hhmm(q[1])}` : "no quiet hours");

/** Whether `now` (local) falls in the quiet hours [from, to) (minutes of the day; may wrap midnight). */
export function inQuiet(quiet, now = Date.now()) {
  if (!quiet) return false;
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  const [from, to] = quiet;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

export function fresh(now = Date.now()) {
  return { since: now, seen: now, away: false, breakUntil: null, snoozeUntil: null, lastRemind: null, breaks: { day: ymd(new Date(now)), count: 0 } };
}

export function clean(st, now = Date.now()) {
  if (!st || typeof st !== "object" || typeof st.since !== "number") return fresh(now);
  return { ...fresh(now), ...st };
}

function counted(st, now) {
  const day = ymd(new Date(now));
  const count = st.breaks?.day === day ? st.breaks.count : 0;
  return { ...st, breaks: { day, count: count + 1 } };
}

/** Today's breaks so far. */
export const breaksToday = (st, now = Date.now()) => (st.breaks?.day === ymd(new Date(now)) ? st.breaks.count : 0);

/** A new stretch from `at`: reminders and snoozes start over. */
const restart = (st, at) => ({ ...st, since: at, lastRemind: null, snoozeUntil: null });

/**
 * One look at `now`. `idle`: ms since the last keyboard or mouse input, or null where the
 * system doesn't say. Returns { st, remind, over }: remind = post the reminder now;
 * over = a break you started has just ended.
 */
export function step(st, now, idle, cfg) {
  const rest = cfg.rest * MINUTE;
  let s = { ...st, seen: now };
  let over = false;
  // Asleep, or Woolshed closed, for a break's length: that was a break.
  if (now - st.seen >= rest && !st.breakUntil) s = counted(restart(s, now), now);
  if (s.breakUntil) {
    if (now >= s.breakUntil) { s = restart({ ...s, breakUntil: null, away: false }, now); over = true; }
    else return { st: { ...s, since: now }, remind: false, over: false };
  }
  if (idle !== null && idle >= rest) {
    if (!s.away) s = counted({ ...s, away: true }, now);
    s = restart(s, now);
  } else if (idle !== null && s.away) {
    // Back: the stretch starts at the first touch.
    s = restart({ ...s, away: false }, now - idle);
  }
  const worked = now - s.since;
  const here = idle === null || idle < 2 * MINUTE;
  const remind = !s.away && here && worked >= cfg.work * MINUTE
    && now >= (s.snoozeUntil ?? 0)
    && (s.lastRemind === null || now - s.lastRemind >= cfg.snooze * MINUTE)
    && !inQuiet(cfg.quiet, now);
  if (remind) s.lastRemind = now;
  return { st: s, remind, over };
}

export const takeBreak = (st, now, cfg) => counted({ ...restart(st, now), breakUntil: now + cfg.rest * MINUTE }, now);
export const endBreak = (st, now) => ({ ...restart(st, now), breakUntil: null, away: false });
export const tookOne = (st, now) => counted(restart(st, now), now);
export const snooze = (st, now, cfg) => ({ ...st, snoozeUntil: now + cfg.snooze * MINUTE, lastRemind: now });

/** "34 min", "1 h 12 min". */
export function minutes(ms) {
  const m = Math.max(0, Math.floor(ms / MINUTE));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
export function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// Idle time from the system's own tools.
/** macOS `ioreg -c IOHIDSystem -d 4 -k HIDIdleTime`: nanoseconds. */
export function ioregIdle(out) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(out ?? "");
  return m ? Math.floor(Number(m[1]) / 1e6) : null;
}
/** `xprintidle`: milliseconds. */
export function xprintidle(out) {
  const m = /^\s*(\d+)\s*$/.exec(out ?? "");
  return m ? Number(m[1]) : null;
}
/** GNOME's `gdbus call ... org.gnome.Mutter.IdleMonitor.GetIdletime`: "(uint64 1234,)" in ms. */
export function mutterIdle(out) {
  const m = /\(uint64\s+(\d+),?\)/.exec(out ?? "");
  return m ? Number(m[1]) : null;
}
