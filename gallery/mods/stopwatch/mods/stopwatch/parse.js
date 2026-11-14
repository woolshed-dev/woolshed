// Stopwatch math, kept apart from the UI so it can be tested. State:
// { running, startedAt (ms, while running), base (ms counted before), laps: [elapsed at each lap] }.

export const EMPTY = { running: false, startedAt: null, base: 0, laps: [] };

/** A clean state from whatever was stored. */
export function clean(st) {
  if (!st || typeof st !== "object") return { ...EMPTY };
  const laps = Array.isArray(st.laps) ? st.laps.filter((n) => typeof n === "number" && n >= 0).slice(-200) : [];
  const running = Boolean(st.running) && typeof st.startedAt === "number";
  return { running, startedAt: running ? st.startedAt : null, base: Math.max(0, Number(st.base) || 0), laps };
}

/** Time on the watch at `now`. A clock set back (startedAt in the future) counts nothing. */
export function elapsed(st, now = Date.now()) {
  return st.base + (st.running ? Math.max(0, now - st.startedAt) : 0);
}

export const start = (st, now = Date.now()) => (st.running ? st : { ...st, running: true, startedAt: now });
export const stop = (st, now = Date.now()) => (st.running ? { ...st, running: false, startedAt: null, base: elapsed(st, now) } : st);
export const toggle = (st, now = Date.now()) => (st.running ? stop(st, now) : start(st, now));
export const reset = () => ({ ...EMPTY });
/** A lap while running (a stopped watch has nothing to split). */
export const lap = (st, now = Date.now()) => (st.running ? { ...st, laps: [...st.laps, elapsed(st, now)].slice(-200) } : st);

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** "0:07", "12:34", "1:02:03"; `tenths`: "12:34.5" (rounded down, as a watch does). */
export function clock(ms, tenths = false) {
  const t = Math.max(0, Math.floor(ms / 100));
  const s = Math.floor(t / 10), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const body = h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  return tenths ? `${body}.${t % 10}` : body;
}

/** The laps newest first: { n, lap (its own length), split (the watch at its end), best, worst }.
 *  Best and worst are marked once there are three laps. */
export function rows(st) {
  const out = st.laps.map((split, i) => ({ n: i + 1, split, lap: split - (i ? st.laps[i - 1] : 0), best: false, worst: false }));
  if (out.length >= 3) {
    const lens = out.map((r) => r.lap);
    const lo = Math.min(...lens), hi = Math.max(...lens);
    if (lo !== hi) {
      out.find((r) => r.lap === lo).best = true;
      out.find((r) => r.lap === hi).worst = true;
    }
  }
  return out.reverse();
}

/** The laps as text to paste: one per line, oldest first, then the total. */
export function text(st, now = Date.now()) {
  const lines = rows(st).reverse().map((r) => `Lap ${r.n}\t${clock(r.lap, true)}\t${clock(r.split, true)}`);
  lines.push(`Total\t${clock(elapsed(st, now), true)}`);
  return lines.join("\n");
}

/** How long until the shown second changes (so a tick lands right on it). */
export function untilNextSecond(st, now = Date.now()) {
  return 1000 - (elapsed(st, now) % 1000) + 15;
}
