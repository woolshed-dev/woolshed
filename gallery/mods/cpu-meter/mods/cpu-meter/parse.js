// Readers for what cpu-meter asks for: `top -l 2 -n 0 -s 1` (macOS) and
// `cat /proc/stat /proc/loadavg` (Linux). Pure: no Woolshed calls, so they
// can be tested on their own.

/** macOS `top -l 2 -n 0 -s 1`: the last sample's CPU use and load average.
 *  → { user, sys, idle, busy, load: [1m, 5m, 15m] } (percent), or null. */
export function parseTop(text) {
  const lines = (text ?? "").split("\n");
  let cpu = null, load = null;
  for (const line of lines) {
    const c = /CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys,\s*([\d.]+)% idle/.exec(line);
    if (c) cpu = { user: Number(c[1]), sys: Number(c[2]), idle: Number(c[3]) };
    const l = /Load Avg:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(line);
    if (l) load = [Number(l[1]), Number(l[2]), Number(l[3])];
  }
  if (!cpu) return null;
  const busy = clamp(100 - cpu.idle);
  return { ...cpu, busy, load };
}

/** `sysctl -n vm.loadavg` → [1m, 5m, 15m] ("{ 1.23 1.45 1.67 }"). */
export function parseLoadavg(text) {
  const m = /([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Linux `cat /proc/stat /proc/loadavg` → { ticks: { total, idle, user, sys }, cores, load }.
 *  CPU use needs two of these: see `usage`. */
export function parseProcStat(text) {
  let ticks = null, cores = 0, load = null;
  for (const line of (text ?? "").split("\n")) {
    const words = line.trim().split(/\s+/);
    if (words[0] === "cpu") {
      // user nice system idle iowait irq softirq steal (guest is inside user)
      const n = words.slice(1, 9).map((w) => Number(w) || 0);
      const [user, nice, system, idle, iowait, irq, softirq, steal] = n;
      ticks = { total: n.reduce((a, b) => a + b, 0), idle: idle + iowait, user: user + nice, sys: system + irq + softirq + steal };
    } else if (/^cpu\d+$/.test(words[0])) cores += 1;
    else if (words.length >= 4 && /^[\d.]+$/.test(words[0]) && /^\d+\/\d+$/.test(words[3])) {
      load = words.slice(0, 3).map(Number);
    }
  }
  return ticks ? { ticks, cores, load } : null;
}

/** CPU use between two /proc/stat readings → { user, sys, idle, busy } (percent), or null. */
export function usage(before, after) {
  if (!before || !after) return null;
  const total = after.total - before.total;
  if (total <= 0) return null;
  const pct = (v) => clamp((v / total) * 100);
  const idle = pct(after.idle - before.idle);
  return { user: pct(after.user - before.user), sys: pct(after.sys - before.sys), idle, busy: clamp(100 - idle) };
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
