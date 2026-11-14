// Time convert's parsing and formatting, kept apart from the UI so it can be
// tested. Reads Unix timestamps (seconds, milliseconds, microseconds or
// nanoseconds, told apart by length), ISO 8601, RFC 2822 and JavaScript's
// Date.toString() text, without Date.parse (whose rules differ between
// runtimes). A date or time without an offset is this computer's local time.

import { wall, utcLabel } from "./zones.js";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZONE_WORDS = { ut: 0, utc: 0, gmt: 0, z: 0, est: -300, edt: -240, cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420 };
const MAX = 8.64e15; // the largest time a Date can hold
const pad = (n, w = 2) => String(n).padStart(w, "0");

// A wall-clock time with an offset (minutes east of UTC), or local time (offset null).
function build(y, mo, d, h, mi, s, ms, offset) {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 24 || mi > 59 || s > 60) return null;
  if (h === 24 && (mi || s || ms)) return null;
  const check = new Date(Date.UTC(y, mo, d));
  if (check.getUTCMonth() !== mo) return null;
  const at = offset === null ? new Date(y, mo, d, h, mi, s, ms).getTime() : Date.UTC(y, mo, d, h, mi, s, ms) - offset * 60000;
  return Number.isFinite(at) ? at : null;
}

const offsetOf = (text) => {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t in ZONE_WORDS) return ZONE_WORDS[t];
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(t);
  if (!m) return undefined;
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0);
  if (Number(m[2]) > 23 || Number(m[3] ?? 0) > 59) return undefined;
  return m[1] === "-" ? -v : v;
};
const fraction = (f) => (f ? Math.floor(Number(`0.${f}`) * 1000) : 0);

/**
 * What `text` is: { at (ms), kind, offset (minutes the text gave, or null: local) } or { error }.
 * `now` answers "now".
 */
export function detect(text, now = Date.now()) {
  const raw = String(text ?? "").trim().replace(/^["'`]+|["'`,;]+$/g, "").trim();
  if (!raw) return { error: "empty" };
  if (/^now$/i.test(raw)) return { at: now, kind: "now", offset: null };
  let m;
  if ((m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw))) {
    const digits = m[2].replace(/^0+(?=\d)/, "").length;
    const [unit, scale] = digits <= 11 ? ["Unix seconds", 1000] : digits <= 14 ? ["Unix milliseconds", 1] : digits <= 17 ? ["Unix microseconds", 1e-3] : digits <= 19 ? ["Unix nanoseconds", 1e-6] : [null, 0];
    if (!unit) return { error: "That number is too long for a timestamp" };
    const at = Math.floor(Number(`${m[1]}${m[2]}.${m[3] ?? 0}`) * scale);
    if (Math.abs(at) > MAX) return { error: "That's beyond the dates a computer can show" };
    return { at, kind: unit, offset: 0 };
  }
  // ISO 8601: 2026-11-11, 2026-11-11T14:00, 2026-11-11 14:00:00.123+11:00, 2026-11-11T03:00:00Z
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(raw))) {
    const offset = offsetOf(m[8]);
    if (offset === undefined) return { error: "That offset isn't one: use Z or +hh:mm" };
    const at = build(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), fraction(m[7]), offset);
    return at === null ? { error: "There's no such date or time" } : { at, kind: m[4] ? "ISO 8601" : "ISO 8601 date", offset };
  }
  // ISO 8601 basic: 20261111T030000Z
  if ((m = /^(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})?(z|[+-]\d{4})?$/i.exec(raw))) {
    const offset = offsetOf(m[7]);
    const at = build(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0), 0, offset ?? null);
    return at === null ? { error: "There's no such date or time" } : { at, kind: "ISO 8601", offset: offset ?? null };
  }
  // RFC 2822: Wed, 11 Nov 2026 14:00:00 +1100 (also "GMT", "EST", or none: local)
  if ((m = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[a-z]+)?(?:\s*\(.*\))?$/i.exec(raw))) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    if (mo < 0) return { error: `“${m[2]}” isn't a month` };
    const offset = offsetOf(m[7]);
    if (offset === undefined) return { error: `“${m[7]}” isn't a time zone I know: use +hhmm` };
    let y = +m[3];
    if (m[3].length === 2) y += y < 50 ? 2000 : 1900;
    const at = build(y, mo, +m[1], +m[4], +m[5], +(m[6] ?? 0), 0, offset);
    return at === null ? { error: "There's no such date or time" } : { at, kind: "RFC 2822", offset };
  }
  // JavaScript's Date.toString(): Wed Nov 11 2026 14:00:00 GMT+1100 (Australian Eastern Daylight Time)
  if ((m = /^(?:[a-z]{3}\s+)?([a-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(?:gmt|utc)([+-]\d{4})(?:\s*\(.*\))?$/i.exec(raw))) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    if (mo < 0) return { error: `“${m[1]}” isn't a month` };
    const at = build(+m[3], mo, +m[2], +m[4], +m[5], +m[6], 0, offsetOf(m[7]));
    return at === null ? { error: "There's no such date or time" } : { at, kind: "JavaScript date", offset: offsetOf(m[7]) };
  }
  return { error: "Not a time I can read" };
}

// Parts of `at` as seen at `offset` minutes east of UTC.
function parts(at, offset) {
  const d = new Date(at + offset * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds() };
}
const year = (y) => (y < 0 ? `-${pad(-y, 6)}` : y > 9999 ? `+${pad(y, 6)}` : pad(y, 4));
const offsetText = (o, colon = true) => (o === 0 && colon ? "Z" : `${o < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(o) / 60))}${colon ? ":" : ""}${pad(Math.abs(o) % 60)}`);
export const localOffset = (at) => -new Date(at).getTimezoneOffset();

/** ISO 8601 at that offset: "2026-11-11T14:00:00+11:00", "2026-11-11T03:00:00.250Z". */
export function isoAt(at, offset = 0) {
  const p = parts(at, offset);
  return `${year(p.y)}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${p.ms ? "." + pad(p.ms, 3) : ""}${offsetText(offset)}`;
}
/** RFC 2822: "Wed, 11 Nov 2026 14:00:00 +1100". */
export function rfcAt(at, offset = 0) {
  const p = parts(at, offset);
  return `${DAY_NAMES[p.wd]}, ${p.d} ${MONTH_NAMES[p.mo]} ${p.y} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} ${offsetText(offset, false)}`;
}
/** For people: "Wed 11 Nov 2026, 14:00:00". */
export function readable(at, offset = 0) {
  const p = parts(at, offset);
  return `${DAY_NAMES[p.wd]} ${p.d} ${MONTH_NAMES[p.mo]} ${p.y}, ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${p.ms ? "." + pad(p.ms, 3) : ""}`;
}

/** "3 h ago", "in 2 d", "just now", "in 1.5 y". */
export function relative(ms) {
  const a = Math.abs(ms);
  const say = (n, unit) => (ms > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`);
  if (a < 45000) return "just now";
  if (Math.round(a / 60000) < 60) return say(Math.max(1, Math.round(a / 60000)), "min");
  if (Math.round(a / 3600000) < 24) return say(Math.round(a / 3600000), "h");
  if (a < 60 * 86400000) return say(Math.round(a / 86400000), "d");
  if (a < 365 * 86400000) return say(Math.round(a / (30.44 * 86400000)), "mo");
  return say(Math.round((a / (365.25 * 86400000)) * 10) / 10, "y");
}

/** The rows to show for `at`: { id, label, text (shown), copy (copied) }. */
export function rows(at, now = Date.now(), zones = []) {
  const here = localOffset(at);
  const out = [
    { id: "local", label: "Local", text: `${readable(at, here)} ${utcLabel(here)}`, copy: isoAt(at, here) },
    { id: "utc", label: "UTC", text: isoAt(at, 0), copy: isoAt(at, 0) },
    { id: "relative", label: "Relative", text: relative(at - now), copy: relative(at - now) },
    { id: "unix", label: "Unix s", text: String(Math.floor(at / 1000)), copy: String(Math.floor(at / 1000)) },
    { id: "unixms", label: "Unix ms", text: String(at), copy: String(at) },
    { id: "rfc", label: "RFC 2822", text: rfcAt(at, here), copy: rfcAt(at, here) },
  ];
  for (const z of zones) {
    const o = wall(z, at).offset;
    out.push({ id: `z-${z.id}`, zone: z.id, label: z.city, text: `${readable(at, o)} ${utcLabel(o)}`, copy: isoAt(at, o) });
  }
  return out;
}
