// When the bell rings. No imports.
// `st.rung`: { addr: { first: when it started waiting, last: last chime, count } }.

// "Again every" choices in minutes; 0 rings only once.
export const EVERY = [0, 1, 2, 3, 5, 10, 15, 30];

// Whether `h` (0-23) is inside quiet hours from `from` to `to` (to not included);
// from 22 to 8 runs across midnight. Equal hours mean no quiet time.
export function inQuiet(h, from, to) {
  if (from === to) return false;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

// Follows waiting agents and says whether to ring now: once when one starts
// waiting, then every `s.every` minutes while it still waits. Off, or in quiet
// hours, it keeps count but stays silent (and rings when they end, if still due).
// One sound per step however many are due.
export function ringStep(st, list, now, s, h) {
  let dirty = false, ring = false;
  const silent = !s.on || (s.quiet?.on && inQuiet(h, s.quiet.from, s.quiet.to));
  const waiting = new Set();
  for (const a of list) {
    if (a.status !== "blocked") continue;
    waiting.add(a.address);
    const r = st.rung[a.address];
    if (!r) {
      st.rung[a.address] = { first: now, last: silent ? null : now, count: silent ? 0 : 1 };
      ring = ring || !silent;
      dirty = true;
      continue;
    }
    const due = r.last == null || (s.every > 0 && now - r.last >= s.every * 60000);
    if (due && !silent) {
      r.last = now;
      r.count = (r.count ?? 0) + 1;
      ring = true;
      dirty = true;
    }
  }
  for (const k of Object.keys(st.rung)) if (!waiting.has(k)) { delete st.rung[k]; dirty = true; }
  return { ring, dirty };
}

// When the bell rings next for anyone waiting (ms), or null.
export function nextRing(st, waiting, s) {
  if (!s.every) return null;
  const at = waiting.map((a) => st.rung[a.address]?.last).filter((x) => x != null).map((x) => x + s.every * 60000);
  return at.length ? Math.min(...at) : null;
}
