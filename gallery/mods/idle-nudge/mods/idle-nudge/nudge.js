// When an agent has been quiet long enough to nudge. No imports.
// `st`: { since: { addr: { at } }, nudged: { addr: at }, snooze: { addr: until } }.

// How long to wait (minutes), the choices − and + step through.
export const CHOICES = [2, 5, 10, 15, 20, 30, 45, 60, 90, 120];

const quiet = (a) => a.status === "done" || a.status === "idle";

// Follows each agent into and out of its quiet stretch (done and idle are one:
// looking turns one into the other). Forgets agents that are gone. Returns
// whether anything changed.
export function quietStep(st, list, now) {
  let dirty = false;
  const live = new Set();
  for (const a of list) {
    live.add(a.address);
    const q = quiet(a);
    const cur = st.since[a.address];
    if (q && !cur) { st.since[a.address] = { at: now }; dirty = true; }
    if (!q && cur) { delete st.since[a.address]; delete st.nudged[a.address]; dirty = true; }
  }
  for (const map of [st.since, st.nudged, st.snooze]) {
    for (const k of Object.keys(map)) if (!live.has(k)) { delete map[k]; dirty = true; }
  }
  for (const [k, until] of Object.entries(st.snooze)) if (until <= now) { delete st.snooze[k]; dirty = true; }
  return dirty;
}

// The quiet agents due a nudge: quiet for `after` ms, not nudged this stretch, not snoozed.
export function due(st, list, now, after) {
  return list.filter((a) => {
    const at = st.since[a.address]?.at;
    if (!quiet(a) || at == null) return false;
    if (now - at < after) return false;
    if (st.nudged[a.address] === at) return false;
    return !((st.snooze[a.address] ?? 0) > now);
  });
}
