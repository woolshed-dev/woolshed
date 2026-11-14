// Weather: reading wttr.in's JSON (format=j1). Pure functions.

// wttr.in's weather codes, grouped into the icons the mod draws.
const KINDS = {
  sun: [113],
  partly: [116],
  cloud: [119, 122],
  fog: [143, 248, 260],
  rain: [176, 263, 266, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359],
  snow: [179, 182, 185, 227, 230, 281, 284, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377, 392, 395],
  storm: [200, 386, 389],
};

export function kindOf(code) {
  const n = Number(code);
  for (const [k, list] of Object.entries(KINDS)) if (list.includes(n)) return k;
  return "cloud";
}

const first = (a) => (Array.isArray(a) && a.length ? a[0] : null);
const text = (a) => String(first(a)?.value ?? "").trim();
const n = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

// The parts of the answer the mod shows (small enough to keep for offline).
export function summarize(json) {
  const cur = first(json?.current_condition);
  if (!cur || !Array.isArray(json?.weather)) throw new Error("wttr.in sent something unexpected");
  const area = first(json.nearest_area);
  return {
    area: area ? [text(area.areaName), text(area.country)].filter(Boolean).join(", ") : "",
    now: {
      c: n(cur.temp_C), f: n(cur.temp_F), feelsC: n(cur.FeelsLikeC), feelsF: n(cur.FeelsLikeF),
      code: n(cur.weatherCode), desc: text(cur.weatherDesc), humidity: n(cur.humidity),
      kmph: n(cur.windspeedKmph), mph: n(cur.windspeedMiles), dir: String(cur.winddir16Point ?? ""),
    },
    days: json.weather.slice(0, 3).map((d) => {
      const hours = Array.isArray(d.hourly) ? d.hourly : [];
      // Midday stands for the day; rain is the day's highest chance.
      const noon = hours.find((h) => String(h.time) === "1200") ?? hours[Math.floor(hours.length / 2)] ?? {};
      const rain = Math.max(0, ...hours.map((h) => n(h.chanceofrain) ?? 0));
      const snow = Math.max(0, ...hours.map((h) => n(h.chanceofsnow) ?? 0));
      return {
        date: String(d.date ?? ""), minC: n(d.mintempC), maxC: n(d.maxtempC), minF: n(d.mintempF), maxF: n(d.maxtempF),
        code: n(noon.weatherCode), desc: text(noon.weatherDesc), rain, snow,
      };
    }),
  };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Today", "Tomorrow", else the weekday ("2026-11-13" -> "Fri"). `today` is "YYYY-MM-DD".
export function dayLabel(date, today) {
  if (date === today) return "Today";
  const d = new Date(`${date}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  if (Math.round((d - t) / 86400000) === 1) return "Tomorrow";
  return DAYS[d.getDay()];
}

export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// The address to ask, for a city as typed.
export function urlFor(city) {
  return `https://wttr.in/${encodeURIComponent(city.trim().replace(/\s+/g, "+")).replace(/%2B/g, "+")}?format=j1`;
}

// Where a day's range sits on the three days' scale, as fractions 0..1.
export function rangeBar(min, max, lo, hi) {
  if (min === null || max === null || hi <= lo) return { from: 0, to: 1 };
  return { from: (min - lo) / (hi - lo), to: (max - lo) / (hi - lo) };
}

// A city as typed, tidied: "  new   york " -> "New York".
export function tidyCity(s) {
  return (s ?? "").trim().replace(/\s+/g, " ").replace(/(^|[\s-])(\p{Ll})/gu, (_m, a, b) => a + b.toUpperCase());
}
