// Calendar math, kept apart from the UI so it can be tested. Dates are plain
// { y, m (0-11), d } on this computer's calendar; day arithmetic goes through
// Date.UTC so daylight saving never shifts a day.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const iso = ({ y, m, d }) => `${y}-${pad(m + 1)}-${pad(d)}`;
const utc = ({ y, m, d }) => Date.UTC(y, m, d);
const fromUtc = (t) => { const x = new Date(t); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() }; };
export const weekday = (date) => new Date(utc(date)).getUTCDay();
export const addDays = (date, n) => fromUtc(utc(date) + n * DAY);
export const today = (now = Date.now()) => { const x = new Date(now); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
export const same = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;

/** ISO 8601 week: { year, week } (weeks start Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date) {
  const thursday = addDays(date, 3 - ((weekday(date) + 6) % 7));
  const jan1 = utc({ y: thursday.y, m: 0, d: 1 });
  return { year: thursday.y, week: 1 + Math.floor((utc(thursday) - jan1) / DAY / 7) };
}
export const weekLabel = (w) => `${w.year}-W${pad(w.week)}`;

/** The day of the year, from 1, and how many days the year has. */
export function dayOfYear(date) {
  const n = Math.round((utc(date) - utc({ y: date.y, m: 0, d: 1 })) / DAY) + 1;
  const len = Math.round((utc({ y: date.y + 1, m: 0, d: 1 }) - utc({ y: date.y, m: 0, d: 1 })) / DAY);
  return { day: n, of: len };
}

/** The month to show, moved by `n` months. */
export function shift({ y, m }, n) {
  const k = y * 12 + m + n;
  return { y: Math.floor(k / 12), m: ((k % 12) + 12) % 12 };
}

/**
 * The weeks of a month as rows of 7 days, starting Monday (or Sunday with `sunday`), each with
 * the ISO week of the row's Monday (the second cell in a Sunday-first row). Days outside the
 * month are marked `outside`.
 */
export function grid({ y, m }, { sunday = false } = {}) {
  const first = { y, m, d: 1 };
  const lead = sunday ? weekday(first) : (weekday(first) + 6) % 7;
  let day = addDays(first, -lead);
  const rows = [];
  do {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push({ ...day, iso: iso(day), weekday: weekday(day), outside: day.m !== m });
      day = addDays(day, 1);
    }
    rows.push({ week: isoWeek(sunday ? days[1] : days[0]), days });
  } while (day.m === m);
  return rows;
}

/** ms until the next local midnight (plus a second), for redrawing "today". */
export function untilMidnight(now = Date.now()) {
  const x = new Date(now);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1).getTime() - now + 1000;
}

/** "Thu 12 November 2026". */
export const longDate = (date) => `${WEEKDAYS[weekday(date)]} ${date.d} ${MONTHS[date.m]} ${date.y}`;
