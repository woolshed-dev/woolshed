// Time zones without Intl (the mod runtime has none): standard offsets in
// minutes and the four daylight-saving rules most people meet.
//   eu: last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC
//   us: second Sunday of March 02:00 to first Sunday of November 02:00, local
//   au: first Sunday of October 02:00 to first Sunday of April 03:00, local
//   nz: last Sunday of September 02:00 to first Sunday of April 03:00, local

export const ZONES = [
  { id: "utc", name: "UTC", offset: 0 },
  { id: "honolulu", name: "Honolulu", offset: -600 },
  { id: "anchorage", name: "Anchorage", offset: -540, rule: "us" },
  { id: "los-angeles", name: "Los Angeles", offset: -480, rule: "us" },
  { id: "vancouver", name: "Vancouver", offset: -480, rule: "us" },
  { id: "denver", name: "Denver", offset: -420, rule: "us" },
  { id: "phoenix", name: "Phoenix", offset: -420 },
  { id: "chicago", name: "Chicago", offset: -360, rule: "us" },
  { id: "mexico-city", name: "Mexico City", offset: -360 },
  { id: "new-york", name: "New York", offset: -300, rule: "us" },
  { id: "toronto", name: "Toronto", offset: -300, rule: "us" },
  { id: "bogota", name: "Bogotá", offset: -300 },
  { id: "sao-paulo", name: "São Paulo", offset: -180 },
  { id: "buenos-aires", name: "Buenos Aires", offset: -180 },
  { id: "london", name: "London", offset: 0, rule: "eu" },
  { id: "dublin", name: "Dublin", offset: 0, rule: "eu" },
  { id: "lisbon", name: "Lisbon", offset: 0, rule: "eu" },
  { id: "lagos", name: "Lagos", offset: 60 },
  { id: "berlin", name: "Berlin", offset: 60, rule: "eu" },
  { id: "paris", name: "Paris", offset: 60, rule: "eu" },
  { id: "madrid", name: "Madrid", offset: 60, rule: "eu" },
  { id: "stockholm", name: "Stockholm", offset: 60, rule: "eu" },
  { id: "warsaw", name: "Warsaw", offset: 60, rule: "eu" },
  { id: "johannesburg", name: "Johannesburg", offset: 120 },
  { id: "athens", name: "Athens", offset: 120, rule: "eu" },
  { id: "helsinki", name: "Helsinki", offset: 120, rule: "eu" },
  { id: "kyiv", name: "Kyiv", offset: 120, rule: "eu" },
  { id: "nairobi", name: "Nairobi", offset: 180 },
  { id: "istanbul", name: "Istanbul", offset: 180 },
  { id: "moscow", name: "Moscow", offset: 180 },
  { id: "dubai", name: "Dubai", offset: 240 },
  { id: "karachi", name: "Karachi", offset: 300 },
  { id: "india", name: "India", offset: 330 },
  { id: "kathmandu", name: "Kathmandu", offset: 345 },
  { id: "dhaka", name: "Dhaka", offset: 360 },
  { id: "bangkok", name: "Bangkok", offset: 420 },
  { id: "jakarta", name: "Jakarta", offset: 420 },
  { id: "singapore", name: "Singapore", offset: 480 },
  { id: "shanghai", name: "Shanghai", offset: 480 },
  { id: "hong-kong", name: "Hong Kong", offset: 480 },
  { id: "taipei", name: "Taipei", offset: 480 },
  { id: "perth", name: "Perth", offset: 480 },
  { id: "seoul", name: "Seoul", offset: 540 },
  { id: "tokyo", name: "Tokyo", offset: 540 },
  { id: "brisbane", name: "Brisbane", offset: 600 },
  { id: "sydney", name: "Sydney", offset: 600, rule: "au" },
  { id: "melbourne", name: "Melbourne", offset: 600, rule: "au" },
  { id: "auckland", name: "Auckland", offset: 720, rule: "nz" },
];

const HOUR = 3600000;
// The day of the month of the nth Sunday (n = -1: the last).
function sunday(year, month, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  }
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, days)).getUTCDay();
  return days - last;
}

// Whether daylight saving is on at `t` (ms) for a zone with that rule and standard offset.
function summer(rule, offset, t) {
  const year = new Date(t + offset * 60000).getUTCFullYear();
  const local = (month, day, hour) => Date.UTC(year, month, day, hour) - offset * 60000;
  if (rule === "eu") return t >= Date.UTC(year, 2, sunday(year, 2, -1), 1) && t < Date.UTC(year, 9, sunday(year, 9, -1), 1);
  if (rule === "us") return t >= local(2, sunday(year, 2, 2), 2) && t < local(10, sunday(year, 10, 1), 2) - HOUR;
  if (rule === "au") return t >= local(9, sunday(year, 9, 1), 2) || t < local(3, sunday(year, 3, 1), 3) - HOUR;
  if (rule === "nz") return t >= local(8, sunday(year, 8, -1), 2) || t < local(3, sunday(year, 3, 1), 3) - HOUR;
  return false;
}

/** The zone's offset from UTC at `t`, in minutes. */
export function offsetAt(zone, t = Date.now()) {
  return zone.offset + (zone.rule && summer(zone.rule, zone.offset, t) ? 60 : 0);
}

/** { hours, minutes, day } as the zone's wall clock shows them at `t`; `day` is a UTC day number. */
export function wall(zone, t = Date.now()) {
  const d = new Date(t + offsetAt(zone, t) * 60000);
  return { hours: d.getUTCHours(), minutes: d.getUTCMinutes(), day: Math.floor(d.getTime() / 86400000) };
}

/** The same for this computer's own clock. */
export function here(t = Date.now()) {
  const d = new Date(t);
  return { hours: d.getHours(), minutes: d.getMinutes(), day: Math.floor((t - d.getTimezoneOffset() * 60000) / 86400000), offset: -d.getTimezoneOffset() };
}

export function format(hours, minutes, h12) {
  const mm = String(minutes).padStart(2, "0");
  if (!h12) return `${String(hours).padStart(2, "0")}:${mm}`;
  return `${((hours + 11) % 12) + 1}:${mm} ${hours < 12 ? "am" : "pm"}`;
}

export function utcLabel(minutes) {
  const sign = minutes < 0 ? "−" : "+";
  const m = Math.abs(minutes);
  return `UTC${sign}${Math.floor(m / 60)}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""}`;
}
