// Day progress math, kept apart from the UI so it can be tested. All spans are
// local wall-clock spans measured in real time, so a daylight-saving day or week
// is its true length (23 or 25 hours).

const MINUTE = 60000;
const pad = (n) => String(n).padStart(2, "0");
export const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULTS = { start: 540, end: 1050, weekends: false };
export const STEP = 30;

export function settings(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  const ok = (m) => Number.isInteger(m) && m >= 0 && m <= 1440 && m % STEP === 0;
  if (!ok(s.start) || !ok(s.end) || s.end - s.start < 60) return { ...DEFAULTS, weekends: Boolean(s.weekends) };
  return { start: s.start, end: s.end, weekends: Boolean(s.weekends) };
}

/** Moves the start or the end by `by` minutes, keeping at least an hour between them. */
export function nudge(s, which, by) {
  const next = { ...s, [which]: s[which] + by };
  if (next.start < 0 || next.end > 1440 || next.end - next.start < 60) return s;
  return next;
}

const at = (d, days, minutes) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, Math.floor(minutes / 60), minutes % 60).getTime();
const share = (now, from, to) => Math.max(0, Math.min(1, (now - from) / (to - from)));

/** The working day: { state: "before" | "during" | "after" | "off", share, left (ms to its end), until (ms to its start) }. */
export function workday(now, s) {
  const d = new Date(now);
  const off = !s.weekends && (d.getDay() === 0 || d.getDay() === 6);
  const from = at(d, 0, s.start), to = at(d, 0, s.end);
  if (off) return { state: "off", share: 0, left: 0, until: 0, from, to };
  if (now < from) return { state: "before", share: 0, left: to - now, until: from - now, from, to };
  if (now >= to) return { state: "after", share: 1, left: 0, until: 0, from, to };
  return { state: "during", share: share(now, from, to), left: to - now, until: 0, from, to };
}

/** The week, Monday 00:00 to the next Monday 00:00. */
export function week(now) {
  const d = new Date(now);
  const back = (d.getDay() + 6) % 7;
  const from = at(d, -back, 0), to = at(d, 7 - back, 0);
  return { share: share(now, from, to), left: to - now, day: WEEKDAYS[d.getDay()] };
}

export function month(now) {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { share: share(now, from, to), day: d.getDate(), days };
}

export function year(now) {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), 0, 1).getTime();
  const to = new Date(d.getFullYear() + 1, 0, 1).getTime();
  const days = Math.round((Date.UTC(d.getFullYear() + 1, 0, 1) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
  const day = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
  return { share: share(now, from, to), day, days, year: d.getFullYear() };
}

/** "62%": whole percent, rounded down (it isn't 100% until it's over). */
export const percent = (x) => `${Math.floor(x * 100)}%`;

/** "3h 02m", "45m", "2d 4h". */
export function span(ms) {
  const m = Math.max(0, Math.floor(ms / MINUTE));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${pad(m % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
