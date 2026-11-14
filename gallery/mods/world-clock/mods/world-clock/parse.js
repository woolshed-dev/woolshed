// World clock's time math, kept apart from the UI so it can be tested.
// Zones and their daylight-saving rules are in ./zones.js.

import { zone, wall, here, utcLabel, diffLabel } from "./zones.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

export const DEFAULT_ZONES = ["America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo"];
export const MAX = 12;

export function format(hours, minutes, h12) {
  if (!h12) return `${pad(hours)}:${pad(minutes)}`;
  return `${((hours + 11) % 12) + 1}:${pad(minutes)} ${hours < 12 ? "am" : "pm"}`;
}

/** Daytime is 07:00 to 19:00 on the place's own clock. */
export const isDay = (hours) => hours >= 7 && hours < 19;
/** Working hours are 09:00 to 17:00. */
export const isWorking = (hours, weekday) => hours >= 9 && hours < 17 && weekday !== 0 && weekday !== 6;

/** A clock card's facts for a zone at `t`, against this computer's clock. */
export function card(z, t = Date.now(), h12 = false) {
  const w = wall(z, t);
  const me = here(t);
  const shift = w.dayNumber - me.dayNumber;
  return {
    id: z.id, city: z.city, country: z.country,
    time: format(w.hours, w.minutes, h12),
    date: `${DAYS[w.weekday]} ${w.day} ${MONTHS[w.month]}`,
    day: shift > 0 ? "tomorrow" : shift < 0 ? "yesterday" : "today",
    utc: utcLabel(w.offset),
    diff: diffLabel(w.offset - me.offset),
    hours: w.hours, minutes: w.minutes,
    daytime: isDay(w.hours),
    working: isWorking(w.hours, w.weekday),
  };
}

/** The stored list, cleaned: known zones only, no repeats, at most MAX. */
export function zonesOf(stored) {
  const ids = Array.isArray(stored) ? stored : DEFAULT_ZONES;
  const seen = new Set();
  return ids.filter((id) => typeof id === "string" && !seen.has(id) && seen.add(id) && zone(id)).slice(0, MAX);
}
