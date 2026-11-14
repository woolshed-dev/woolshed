// Time zones by IANA name. The mod runtime has no Intl (no time-zone
// database), so each zone carries its standard offset (minutes east of UTC)
// and one of the daylight-saving rules below (checked against tz 2026f for
// 2024 to 2030; `then`: a zone that moved to a new standard time, as British
// Columbia, Alberta and Manitoba did in November 2026). Where a runtime does have
// Intl.DateTimeFormat, zones outside this table work through it too.
//   eu: last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC
//   us: second Sunday of March 02:00 to first Sunday of November 02:00, local
//   au: first Sunday of October 02:00 to first Sunday of April 03:00, local
//   nz: last Sunday of September 02:00 to first Sunday of April 03:00, local
//   cl: the Sunday after the first Saturday of September 04:00 UTC to the Sunday after the first Saturday of April 03:00 UTC
//   il: the Friday before the last Sunday of March 02:00 to last Sunday of October 02:00, local
//   eg: last Friday of April 00:00 to last Thursday of October 24:00, local

export const ZONES = [
  ["UTC", "UTC", "Coordinated Universal Time", 0],
  ["Pacific/Pago_Pago", "Pago Pago", "American Samoa", -660],
  ["Pacific/Honolulu", "Honolulu", "United States", -600],
  ["America/Anchorage", "Anchorage", "United States", -540, "us"],
  ["America/Los_Angeles", "Los Angeles", "United States", -480, "us"],
  ["America/Vancouver", "Vancouver", "Canada", -480, "us", { at: Date.UTC(2026, 10, 1, 9), offset: -420 }],
  ["America/Tijuana", "Tijuana", "Mexico", -480, "us"],
  ["America/Denver", "Denver", "United States", -420, "us"],
  ["America/Edmonton", "Edmonton", "Canada", -420, "us", { at: Date.UTC(2026, 10, 1, 8), offset: -360 }],
  ["America/Phoenix", "Phoenix", "United States", -420],
  ["America/Chicago", "Chicago", "United States", -360, "us"],
  ["America/Winnipeg", "Winnipeg", "Canada", -360, "us", { at: Date.UTC(2026, 10, 1, 7), offset: -300 }],
  ["America/Mexico_City", "Mexico City", "Mexico", -360],
  ["America/Costa_Rica", "San José", "Costa Rica", -360],
  ["America/New_York", "New York", "United States", -300, "us"],
  ["America/Toronto", "Toronto", "Canada", -300, "us"],
  ["America/Bogota", "Bogotá", "Colombia", -300],
  ["America/Lima", "Lima", "Peru", -300],
  ["America/Halifax", "Halifax", "Canada", -240, "us"],
  ["America/Caracas", "Caracas", "Venezuela", -240],
  ["America/Santiago", "Santiago", "Chile", -240, "cl"],
  ["America/St_Johns", "St. John's", "Canada", -210, "us"],
  ["America/Sao_Paulo", "São Paulo", "Brazil", -180],
  ["America/Argentina/Buenos_Aires", "Buenos Aires", "Argentina", -180],
  ["America/Montevideo", "Montevideo", "Uruguay", -180],
  ["Atlantic/Azores", "Azores", "Portugal", -60, "eu"],
  ["Atlantic/Reykjavik", "Reykjavík", "Iceland", 0],
  ["Europe/London", "London", "United Kingdom", 0, "eu"],
  ["Europe/Dublin", "Dublin", "Ireland", 0, "eu"],
  ["Europe/Lisbon", "Lisbon", "Portugal", 0, "eu"],
  ["Africa/Accra", "Accra", "Ghana", 0],
  ["Africa/Lagos", "Lagos", "Nigeria", 60],
  ["Europe/Amsterdam", "Amsterdam", "Netherlands", 60, "eu"],
  ["Europe/Berlin", "Berlin", "Germany", 60, "eu"],
  ["Europe/Brussels", "Brussels", "Belgium", 60, "eu"],
  ["Europe/Copenhagen", "Copenhagen", "Denmark", 60, "eu"],
  ["Europe/Madrid", "Madrid", "Spain", 60, "eu"],
  ["Europe/Oslo", "Oslo", "Norway", 60, "eu"],
  ["Europe/Paris", "Paris", "France", 60, "eu"],
  ["Europe/Prague", "Prague", "Czechia", 60, "eu"],
  ["Europe/Rome", "Rome", "Italy", 60, "eu"],
  ["Europe/Stockholm", "Stockholm", "Sweden", 60, "eu"],
  ["Europe/Vienna", "Vienna", "Austria", 60, "eu"],
  ["Europe/Warsaw", "Warsaw", "Poland", 60, "eu"],
  ["Europe/Zurich", "Zurich", "Switzerland", 60, "eu"],
  ["Europe/Budapest", "Budapest", "Hungary", 60, "eu"],
  ["Africa/Johannesburg", "Johannesburg", "South Africa", 120],
  ["Africa/Cairo", "Cairo", "Egypt", 120, "eg"],
  ["Asia/Jerusalem", "Jerusalem", "Israel", 120, "il"],
  ["Europe/Athens", "Athens", "Greece", 120, "eu"],
  ["Europe/Bucharest", "Bucharest", "Romania", 120, "eu"],
  ["Europe/Helsinki", "Helsinki", "Finland", 120, "eu"],
  ["Europe/Kyiv", "Kyiv", "Ukraine", 120, "eu"],
  ["Europe/Riga", "Riga", "Latvia", 120, "eu"],
  ["Europe/Sofia", "Sofia", "Bulgaria", 120, "eu"],
  ["Europe/Tallinn", "Tallinn", "Estonia", 120, "eu"],
  ["Europe/Vilnius", "Vilnius", "Lithuania", 120, "eu"],
  ["Africa/Nairobi", "Nairobi", "Kenya", 180],
  ["Asia/Riyadh", "Riyadh", "Saudi Arabia", 180],
  ["Asia/Qatar", "Doha", "Qatar", 180],
  ["Europe/Istanbul", "Istanbul", "Türkiye", 180],
  ["Europe/Moscow", "Moscow", "Russia", 180],
  ["Asia/Tehran", "Tehran", "Iran", 210],
  ["Asia/Dubai", "Dubai", "United Arab Emirates", 240],
  ["Asia/Baku", "Baku", "Azerbaijan", 240],
  ["Asia/Tbilisi", "Tbilisi", "Georgia", 240],
  ["Asia/Kabul", "Kabul", "Afghanistan", 270],
  ["Asia/Karachi", "Karachi", "Pakistan", 300],
  ["Asia/Tashkent", "Tashkent", "Uzbekistan", 300],
  ["Asia/Kolkata", "Mumbai, Delhi, Bengaluru", "India", 330],
  ["Asia/Colombo", "Colombo", "Sri Lanka", 330],
  ["Asia/Kathmandu", "Kathmandu", "Nepal", 345],
  ["Asia/Dhaka", "Dhaka", "Bangladesh", 360],
  ["Asia/Yangon", "Yangon", "Myanmar", 390],
  ["Asia/Bangkok", "Bangkok", "Thailand", 420],
  ["Asia/Ho_Chi_Minh", "Ho Chi Minh City", "Vietnam", 420],
  ["Asia/Jakarta", "Jakarta", "Indonesia", 420],
  ["Asia/Shanghai", "Shanghai, Beijing", "China", 480],
  ["Asia/Hong_Kong", "Hong Kong", "Hong Kong", 480],
  ["Asia/Taipei", "Taipei", "Taiwan", 480],
  ["Asia/Singapore", "Singapore", "Singapore", 480],
  ["Asia/Kuala_Lumpur", "Kuala Lumpur", "Malaysia", 480],
  ["Asia/Manila", "Manila", "Philippines", 480],
  ["Australia/Perth", "Perth", "Australia", 480],
  ["Asia/Seoul", "Seoul", "South Korea", 540],
  ["Asia/Tokyo", "Tokyo", "Japan", 540],
  ["Australia/Darwin", "Darwin", "Australia", 570],
  ["Australia/Adelaide", "Adelaide", "Australia", 570, "au"],
  ["Australia/Brisbane", "Brisbane", "Australia", 600],
  ["Australia/Sydney", "Sydney", "Australia", 600, "au"],
  ["Australia/Melbourne", "Melbourne", "Australia", 600, "au"],
  ["Australia/Hobart", "Hobart", "Australia", 600, "au"],
  ["Pacific/Guam", "Guam", "United States", 600],
  ["Pacific/Port_Moresby", "Port Moresby", "Papua New Guinea", 600],
  ["Pacific/Noumea", "Nouméa", "New Caledonia", 660],
  ["Pacific/Auckland", "Auckland", "New Zealand", 720, "nz"],
  ["Pacific/Fiji", "Suva", "Fiji", 720],
  ["Pacific/Tongatapu", "Nukuʻalofa", "Tonga", 780],
  ["Pacific/Kiritimati", "Kiritimati", "Kiribati", 840],
].map(([id, city, country, offset, rule, then]) => ({ id, city, country, offset, rule: rule ?? null, then: then ?? null }));

const BY_ID = new Map(ZONES.map((z) => [z.id, z]));
const HOUR = 3600000;

// The day of the month of the nth `weekday` (0 = Sunday) of a month; n = -1: the last.
export function nthDay(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, days)).getUTCDay();
  return days - ((last - weekday + 7) % 7);
}

// Whether daylight saving is on at `t` (ms) for a zone with that rule and standard offset.
function summer(rule, offset, t) {
  const year = new Date(t + offset * 60000).getUTCFullYear();
  // A wall-clock time in standard time, as ms since the epoch.
  const local = (month, day, hour) => Date.UTC(year, month, day, hour) - offset * 60000;
  const utc = (month, day, hour) => Date.UTC(year, month, day, hour);
  switch (rule) {
    case "eu": return t >= utc(2, nthDay(year, 2, 0, -1), 1) && t < utc(9, nthDay(year, 9, 0, -1), 1);
    case "us": return t >= local(2, nthDay(year, 2, 0, 2), 2) && t < local(10, nthDay(year, 10, 0, 1), 2) - HOUR;
    case "au": return t >= local(9, nthDay(year, 9, 0, 1), 2) || t < local(3, nthDay(year, 3, 0, 1), 3) - HOUR;
    case "nz": return t >= local(8, nthDay(year, 8, 0, -1), 2) || t < local(3, nthDay(year, 3, 0, 1), 3) - HOUR;
    case "cl": return t >= utc(8, nthDay(year, 8, 6, 1) + 1, 4) || t < utc(3, nthDay(year, 3, 6, 1) + 1, 3);
    case "il": return t >= local(2, nthDay(year, 2, 0, -1) - 2, 2) && t < local(9, nthDay(year, 9, 0, -1), 2) - HOUR;
    case "eg": return t >= local(3, nthDay(year, 3, 5, -1), 0) && t < local(9, nthDay(year, 9, 4, -1), 24) - HOUR;
    default: return false;
  }
}

/** The zone for an IANA name: from the table, else (where the runtime has Intl) a bare one. */
export function zone(id) {
  if (BY_ID.has(id)) return BY_ID.get(id);
  if (intlOffset(id, Date.now()) === null) return null;
  const city = id.split("/").pop().replace(/_/g, " ");
  return { id, city, country: id.split("/")[0], offset: null, rule: null };
}

// Through Intl, where there is one: minutes east of UTC, or null.
function intlOffset(id, t) {
  try {
    if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return null;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: id, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(t));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return Math.round((wall - Math.floor(t / 60000) * 60000) / 60000);
  } catch {
    return null;
  }
}

/** Every zone people can pick: the table, plus Intl's list where the runtime has one. */
export function allZones() {
  let extra = [];
  try {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      extra = Intl.supportedValuesOf("timeZone").filter((id) => !BY_ID.has(id)).map(zone).filter(Boolean);
    }
  } catch {}
  return [...ZONES, ...extra];
}

/** Zones whose name, city or country contains every word of `query`. */
export function search(query, list = allZones()) {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((z) => {
    const hay = `${z.id} ${z.id.replace(/_/g, " ")} ${z.city} ${z.country}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The zone's offset from UTC at `t`, in minutes. */
export function offsetAt(z, t = Date.now()) {
  if (z.offset === null) return intlOffset(z.id, t) ?? 0;
  // A zone that changed its standard time keeps the new one, without daylight saving.
  if (z.then && t >= z.then.at) return z.then.offset;
  return z.offset + (z.rule && summer(z.rule, z.offset, t) ? 60 : 0);
}

/** The zone's wall clock at `t`: { year, month (0-11), day, weekday (0 = Sunday), hours, minutes, seconds, offset, dayNumber }. */
export function wall(z, t = Date.now()) {
  const offset = offsetAt(z, t);
  const d = new Date(t + offset * 60000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay(),
    hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds(), offset,
    dayNumber: Math.floor(d.getTime() / 86400000),
  };
}

/** The same for this computer's own clock. */
export function here(t = Date.now()) {
  const d = new Date(t);
  const offset = -d.getTimezoneOffset();
  return {
    year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay(),
    hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds(), offset,
    dayNumber: Math.floor((t + offset * 60000) / 86400000),
  };
}

export function utcLabel(minutes) {
  if (!minutes) return "UTC";
  const sign = minutes < 0 ? "−" : "+";
  const m = Math.abs(minutes);
  return `UTC${sign}${Math.floor(m / 60)}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""}`;
}

/** "+3 h", "−16 h", "+5:30 h", "same time" for a difference in minutes. */
export function diffLabel(minutes) {
  if (!minutes) return "same time";
  const sign = minutes < 0 ? "−" : "+";
  const m = Math.abs(minutes);
  return `${sign}${Math.floor(m / 60)}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""} h`;
}
