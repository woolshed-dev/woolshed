// Standup timer's round, kept apart from the UI so it can be tested. State:
// { names, seconds (each person's box), phase: "ready" | "running" | "paused" | "done",
//   at (whose turn), since (ms the turn last resumed, while running), base (ms of the turn
//   before that), spent: [ms per person, as each finishes] }.

export const SECONDS = [30, 45, 60, 90, 120, 180, 300];
const pad = (n) => String(n).padStart(2, "0");

export function ready(names = [], seconds = 90) {
  return { names, seconds, phase: "ready", at: 0, since: null, base: 0, spent: [] };
}

export function clean(st) {
  if (!st || typeof st !== "object") return ready();
  const names = Array.isArray(st.names) ? st.names.filter((n) => typeof n === "string" && n.trim()).slice(0, 30) : [];
  const seconds = SECONDS.includes(st.seconds) ? st.seconds : 90;
  const phase = ["ready", "running", "paused", "done"].includes(st.phase) ? st.phase : "ready";
  if (phase === "ready" || !names.length) return ready(names, seconds);
  const spent = Array.isArray(st.spent) ? st.spent.map((n) => Math.max(0, Number(n) || 0)).slice(0, names.length) : [];
  const at = Math.min(Math.max(0, Number(st.at) || 0), names.length);
  const running = phase === "running" && typeof st.since === "number";
  return { names, seconds, phase: running || phase !== "running" ? phase : "paused", at, since: running ? st.since : null, base: Math.max(0, Number(st.base) || 0), spent };
}

/** The current turn's time so far. */
export const turn = (st, now = Date.now()) => (st.phase === "done" || st.phase === "ready" ? 0 : st.base + (st.phase === "running" ? Math.max(0, now - st.since) : 0));
/** Everyone's time so far, the current turn included. */
export const total = (st, now = Date.now()) => st.spent.reduce((a, b) => a + b, 0) + turn(st, now);
/** The whole round's box: everyone's seconds. */
export const budget = (st) => st.names.length * st.seconds * 1000;
export const isOver = (ms, st) => ms > st.seconds * 1000;

export function start(st, now = Date.now()) {
  if (!st.names.length) return st;
  if (st.phase === "ready" || st.phase === "done") return { ...st, phase: "running", at: 0, since: now, base: 0, spent: [] };
  if (st.phase === "paused") return { ...st, phase: "running", since: now };
  return st;
}
export const pause = (st, now = Date.now()) => (st.phase === "running" ? { ...st, phase: "paused", base: turn(st, now), since: null } : st);

/** The next person: this turn's time is kept; after the last, the round is done. */
export function next(st, now = Date.now()) {
  if (st.phase !== "running" && st.phase !== "paused") return start(st, now);
  const spent = [...st.spent, turn(st, now)];
  if (st.at + 1 >= st.names.length) return { ...st, phase: "done", at: st.names.length, since: null, base: 0, spent };
  return { ...st, at: st.at + 1, since: st.phase === "running" ? now : null, base: 0, spent };
}

export const reset = (st) => ready(st.names, st.seconds);

export function add(st, name) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!n) return { st, error: "Type a name" };
  const same = st.names.find((x) => x.toLowerCase() === n.toLowerCase());
  if (same) return { st, error: `${same} is already in` };
  if (st.names.length >= 30) return { st, error: "Up to 30 people" };
  return { st: ready([...st.names, n], st.seconds) };
}
export const remove = (st, i) => ready(st.names.filter((_, k) => k !== i), st.seconds);
/** Names in a random order (`random`: a function like Math.random). */
export function shuffle(st, random = Math.random) {
  const names = [...st.names];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return ready(names, st.seconds);
}
export function cycleSeconds(st) {
  const i = SECONDS.indexOf(st.seconds);
  return { ...st, seconds: SECONDS[(i + 1) % SECONDS.length] };
}

/** "1:05", "0:07", "12:00". */
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
export const secondsLabel = (s) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)}:${pad(s % 60)} min` : `${s / 60} min`);

/** How many went over their box. */
export const overCount = (st) => st.spent.filter((ms) => isOver(ms, st)).length;
