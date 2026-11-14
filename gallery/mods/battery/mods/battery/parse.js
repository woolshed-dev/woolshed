// Readers for what battery asks for: `pmset -g batt` (macOS) and a listing of
// /sys/class/power_supply (Linux, `name=`, `type=` then each file's `key=value`).
// Both give { present, percent, state, minutes, source }:
//   state: "charging" | "discharging" | "charged" | "not charging" | null
//   minutes: to full while charging, to empty while discharging, null when unknown
//   source: "ac" | "battery" | null. Pure.

const NONE = { present: false, percent: null, state: null, minutes: null, source: null };

/** macOS `pmset -g batt`. A Mac without a battery prints only the power source. */
export function parsePmset(text) {
  const src = /drawing from '([^']+)'/.exec(text ?? "");
  const source = src ? (/AC/i.test(src[1]) ? "ac" : "battery") : null;
  const m = /InternalBattery[^\t]*\t\s*(\d+)%;\s*([^;]+);\s*([^\n]*)/.exec(text ?? "");
  if (!m) return { ...NONE, source };
  const raw = m[2].trim().toLowerCase();
  const state = raw === "charging" || raw === "finishing charge" ? "charging"
    : raw === "discharging" ? "discharging"
    : raw === "charged" ? "charged"
    : raw.includes("not charging") || raw === "ac attached" ? "not charging"
    : null;
  const t = /(\d+):(\d\d) remaining/.exec(m[3]);
  let minutes = t ? Number(t[1]) * 60 + Number(t[2]) : null;
  // pmset says 0:00 remaining while it's still working the estimate out.
  if (minutes === 0 && state !== "charged") minutes = null;
  return { present: true, percent: Number(m[1]), state, minutes, source };
}

/** Linux: blocks of key=value lines, each starting with `name=`. */
export function parsePowerSupply(text) {
  const blocks = [];
  for (const line of (text ?? "").split("\n")) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim(), value = line.slice(i + 1).trim();
    if (key === "name") blocks.push({ name: value });
    else if (blocks.length) blocks[blocks.length - 1][key] = value;
  }
  const mains = blocks.filter((b) => b.type === "Mains" || b.type === "USB");
  const online = mains.some((b) => b.online === "1");
  const source = mains.length ? (online ? "ac" : "battery") : null;
  // A laptop's own battery; scope "Device" ones are mice and headsets.
  const bat = blocks.find((b) => b.type === "Battery" && b.scope !== "Device" && b.capacity !== undefined);
  if (!bat) return { ...NONE, source };
  const raw = (bat.status ?? "").toLowerCase();
  const state = raw === "charging" ? "charging" : raw === "discharging" ? "discharging" : raw === "full" ? "charged" : raw === "not charging" ? "not charging" : null;
  const n = (k) => (bat[k] !== undefined && bat[k] !== "" ? Number(bat[k]) : null);
  // energy (µWh) over power (µW), or charge (µAh) over current (µA): hours.
  const now = n("energy_now") ?? n("charge_now");
  const full = n("energy_full") ?? n("charge_full");
  const rate = n("power_now") ?? n("current_now");
  let minutes = null;
  if (now !== null && rate) {
    if (state === "discharging") minutes = Math.round((now / Math.abs(rate)) * 60);
    else if (state === "charging" && full !== null) minutes = Math.round(((full - now) / Math.abs(rate)) * 60);
  }
  if (minutes !== null && (minutes <= 0 || minutes > 48 * 60)) minutes = null;
  return { present: true, percent: Math.max(0, Math.min(100, Number(bat.capacity))), state, minutes, source: source ?? (state === "discharging" ? "battery" : "ac") };
}

/** 152 → "2:32". */
export function clock(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
