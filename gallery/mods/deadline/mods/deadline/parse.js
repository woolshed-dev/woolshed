// Deadline's date math, kept apart from the UI so it can be tested.

// What people type: "10:00", "2:30 pm", "fri 17:00", "tomorrow 9am", "2026-12-01",
// "1 dec 17:30", "in 45m", "daily 9:30", in this computer's local time
// (new Date(y, m, d, h, min) handles daylight saving: an hour that doesn't
// exist moves forward).

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

export const pad = (n) => String(n).padStart(2, "0");
/** "2026-11-11" for a local date. */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Days since 1970-01-01 of a local date (whole days, whatever daylight saving does). */
export const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
export const hhmm = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

const monthOf = (w) => {
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m, i) => w.startsWith(m) && ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][i].startsWith(w.replace(/\.$/, "")));
};
const weekdayOf = (w) => {
  if (w.length < 3) return -1;
  return WEEKDAYS.findIndex((d, i) => w.startsWith(d) && ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][i].startsWith(w.replace(/\.$/, "")));
};

// "17:30", "9:05", "9am", "2:30pm", "noon", "midnight" -> minutes of the day.
function clockOf(w) {
  if (w === "noon") return 720;
  if (w === "midnight") return 0;
  let m = /^(\d{1,2})(?::|\.)(\d{2})(am|pm)?$/.exec(w) ?? /^(\d{1,2})()(am|pm)$/.exec(w);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3] === "am" || m[3] === "pm") {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

const RELATIVE = /^(?:in\s+)?((?:\d+(?:\.\d+)?\s*(?:d|days?|h|hrs?|hours?|m|mins?|minutes?)\s*)+)$/;

/**
 * What `text` means at `now`: { at } (ms since the epoch), { daily } (minutes of the day,
 * every day), or { error }. A date without a time is its start, or with `endOfDay` its end
 * (24:00). A time alone is today, or tomorrow once it has passed today (`rolled`).
 */
export function parseWhen(text, now = Date.now(), { endOfDay = false } = {}) {
  const raw = String(text ?? "").trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!raw) return { error: "Say when: 10:00, fri 17:00, 2026-12-01 or in 45m" };
  const rel = RELATIVE.exec(raw);
  if (rel) {
    let ms = 0;
    for (const [, n, unit] of rel[1].matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) ms += Number(n) * (unit[0] === "d" ? DAY : unit[0] === "h" ? HOUR : MINUTE);
    if (ms <= 0) return { error: "That's now: say in 10m" };
    if (ms > 3660 * DAY) return { error: "That's more than ten years away" };
    return { at: Math.round((now + ms) / 1000) * 1000, relative: true };
  }
  // Glue "2:30 pm" into "2:30pm" and split "2026-12-01t17:00".
  const words = raw.replace(/(\d)\s+(am|pm)\b/g, "$1$2").replace(/^(\d{4}-\d{2}-\d{2})t/, "$1 ").split(" ");
  let daily = false, time = null, date = null, weekday = -1, offsetDays = null, year = null, month = -1, day = null;
  const unknown = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let m;
    if (w === "daily" || w === "everyday") daily = true;
    else if (w === "every" && words[i + 1] === "day") { daily = true; i++; }
    else if (w === "at" || w === "on" || w === "by") continue;
    else if (w === "today") offsetDays = 0;
    else if (w === "tomorrow" || w === "tmrw") offsetDays = 1;
    else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w))) date = { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
    else if (clockOf(w) !== null) time = clockOf(w);
    else if (/^\d{4}$/.test(w)) year = Number(w);
    else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(w))) day = Number(m[1]);
    else if (monthOf(w) >= 0) month = monthOf(w);
    else if (weekdayOf(w) >= 0) weekday = weekdayOf(w);
    else unknown.push(w);
  }
  if (unknown.length) return { error: `Didn't understand “${unknown[0]}”` };
  if (month >= 0 || day !== null) {
    if (month < 0 || day === null) return { error: "Give the day and the month: 1 dec" };
    if (date) return { error: "Two dates" };
    date = { y: year, m: month, d: day };
  } else if (year !== null && !date) return { error: "Give the day and the month too: 1 dec 2027" };
  if (daily) {
    if (time === null) return { error: "Daily needs a time: daily 9:30" };
    if (date || weekday >= 0 || offsetDays !== null) return { error: "Daily takes only a time: daily 9:30" };
    return { daily: time };
  }
  const base = new Date(now);
  const startOf = (y, m, d) => new Date(y, m, d);
  const instant = (y, m, d, minutes) => new Date(y, m, d, Math.floor(minutes / 60), minutes % 60).getTime();
  const fallback = endOfDay ? 1440 : 0;
  if (date) {
    if ((weekday >= 0) || offsetDays !== null) return { error: "Give either a date or a day" };
    const y = date.y ?? base.getFullYear();
    const check = startOf(y, date.m, date.d);
    if (check.getMonth() !== date.m || check.getDate() !== date.d) return { error: "There's no such date" };
    let at = instant(y, date.m, date.d, time ?? fallback);
    // No year and already gone: next year's.
    if (date.y === null && at <= now) at = instant(y + 1, date.m, date.d, time ?? fallback);
    return { at, timed: time !== null };
  }
  if (weekday >= 0) {
    if (offsetDays !== null) return { error: "Give either a weekday or today/tomorrow" };
    for (let k = 0; k <= 7; k++) {
      const d = startOf(base.getFullYear(), base.getMonth(), base.getDate() + k);
      if (d.getDay() !== weekday) continue;
      const at = instant(d.getFullYear(), d.getMonth(), d.getDate(), time ?? fallback);
      if (at > now) return { at, timed: time !== null };
    }
  }
  if (offsetDays !== null) {
    const minutes = time ?? (offsetDays === 0 ? 1440 : fallback);
    const at = instant(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays, minutes);
    if (at <= now) return { error: "That's already gone" };
    return { at, timed: time !== null };
  }
  if (time !== null) {
    let at = instant(base.getFullYear(), base.getMonth(), base.getDate(), time);
    if (at > now) return { at, timed: true };
    at = instant(base.getFullYear(), base.getMonth(), base.getDate() + 1, time);
    return { at, timed: true, rolled: true };
  }
  return { error: "Say when: 10:00, fri 17:00, 2026-12-01 or in 45m" };
}

/** The next time a daily one (minutes of the day) happens at or after `now`, and today's. */
export function dailyAt(minutes, now = Date.now()) {
  const d = new Date(now);
  const at = (k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, Math.floor(minutes / 60), minutes % 60).getTime();
  const today = at(0);
  return { today, next: today > now ? today : at(1) };
}

/** "today 10:00", "tomorrow 09:30", "Fri 13 Nov 17:00", "Tue 1 Dec", "1 Dec 2027". */
export function whenLabel(at, now = Date.now(), { timed = true } = {}) {
  const d = new Date(at);
  const days = dayNumber(d) - dayNumber(new Date(now));
  const time = timed ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  if (timed && days === 0) return `today${time}`;
  if (timed && days === 1) return `tomorrow${time}`;
  if (timed && days === -1) return `yesterday${time}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const date = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  return sameYear || Math.abs(days) < 300 ? `${date}${time}` : `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}${time}`;
}

/** "3 h ago", "in 2 d", "just now", for a difference in ms (positive: the future). */
export function relative(ms) {
  const a = Math.abs(ms);
  const say = (n, unit) => (ms > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`);
  if (a < 45000) return "just now";
  if (Math.round(a / MINUTE) < 60) return say(Math.max(1, Math.round(a / MINUTE)), "min");
  if (Math.round(a / HOUR) < 24) return say(Math.round(a / HOUR), "h");
  if (a < 60 * DAY) return say(Math.round(a / DAY), "d");
  if (a < 365 * DAY) return say(Math.round(a / (30.44 * DAY)), "mo");
  return say(Math.round((a / (365.25 * DAY)) * 10) / 10, "y");
}

/** Time left: "23 d 4 h", "5 h 12 m", "12 m", "now". */
export function left(ms) {
  const m = Math.floor(Math.max(0, ms) / MINUTE);
  if (m < 1) return "now";
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} m`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Weekdays (Monday to Friday) after today, up to and including the deadline's own day.
 *  A deadline at the end of a day (24:00) belongs to that day. */
export function workingDays(at, now = Date.now()) {
  const from = dayNumber(new Date(now));
  const to = dayNumber(new Date(at - 1));
  let n = 0;
  for (let d = from + 1; d <= to; d++) {
    const wd = (d + 4) % 7; // 1970-01-01 was a Thursday
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** A new deadline from a name and a date: { item } or { error }. Without a time it's the
 *  end of that day. */
export function make(name, when, now = Date.now(), id = `d${now.toString(36)}`) {
  const title = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!title) return { error: "Give it a name" };
  const w = parseWhen(when, now, { endOfDay: true });
  if (w.error) return { error: w.error };
  if (typeof w.daily === "number") return { error: "A deadline is one date: 2026-12-04 or fri" };
  // "in 6d": the end of that day.
  if (w.relative) { const d = new Date(w.at); return { item: { id, name: title, at: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), timed: false } }; }
  return { item: { id, name: title, at: w.at, timed: Boolean(w.timed) } };
}

/** Upcoming first (soonest first), then past ones (latest first). */
export function sorted(items, now = Date.now()) {
  return [...items].sort((a, b) => {
    const pa = a.at <= now, pb = b.at <= now;
    if (pa !== pb) return pa ? 1 : -1;
    return pa ? b.at - a.at : a.at - b.at;
  });
}

/** The date under a deadline's name: "Fri 4 Dec", "Fri 4 Dec 17:00", "1 Dec 2027". An
 *  untimed one is shown as its day (its instant is the next midnight). */
export function label(item, now = Date.now()) {
  return whenLabel(item.timed ? item.at : item.at - 1, now, { timed: item.timed });
}

/** How close: "late" past it, "soon" within 2 working days, "near" within a week, else "far". */
export function urgency(item, now = Date.now()) {
  if (item.at <= now) return "late";
  const w = workingDays(item.at, now);
  return w <= 2 ? "soon" : w <= 5 ? "near" : "far";
}
