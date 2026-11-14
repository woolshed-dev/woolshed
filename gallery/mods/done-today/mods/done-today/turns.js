// Agent turns from the status changes this copy sees. No imports.
// A turn starts when an agent starts working and ends when it stops (done or
// idle); time spent asking you stays inside the turn.

const busy = (s) => s === "working" || s === "blocked";

// `last`: this copy's memory, { addr: { s, start } }. `startOf(a)`: when an agent
// already working at first sight began (its tab's working_since), else null.
// Returns the turns that just finished: { id, address, space, tab, program, start, end }.
export function follow(last, list, now, startOf = () => null) {
  const out = [];
  for (const a of list) {
    const prev = last[a.address];
    if (!prev) {
      last[a.address] = { s: a.status, start: busy(a.status) ? startOf(a) ?? now : null };
      continue;
    }
    if (prev.s === a.status) continue;
    if (busy(a.status) && prev.start == null) prev.start = now;
    if (!busy(a.status) && prev.start != null) {
      out.push({
        id: `${a.address}#${a.seq ?? now}`, address: a.address, space: a.space_name || "space",
        tab: a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : "",
        program: a.program ? { key: a.program.key, name: a.program.name, icon: a.program.icon, tint: a.program.tint } : null,
        start: prev.start, end: now,
      });
      prev.start = null;
    }
    prev.s = a.status;
  }
  return out;
}

// Adds turns to the per-day record (by the day each ended), once each; keeps `keep` days.
export function addTurns(days, turns, dayOf, keep = 14) {
  const next = { ...days };
  let added = 0;
  for (const t of turns) {
    const d = dayOf(t.end);
    const list = next[d] ? [...next[d]] : [];
    if (list.some((x) => x.id === t.id)) continue;
    list.push(t);
    next[d] = list;
    added++;
  }
  const kept = Object.keys(next).sort().slice(-keep);
  for (const k of Object.keys(next)) if (!kept.includes(k)) delete next[k];
  return { days: next, added };
}

// The day as markdown: a heading, a total and one line per turn, oldest first.
export function markdown(title, turns, fmt) {
  const total = turns.reduce((n, t) => n + (t.end - t.start), 0);
  const lines = [...turns].sort((x, y) => x.end - y.end).map((t) =>
    `- ${fmt.clock(t.end)} **${t.space}**${t.tab ? ` · ${t.tab}` : ""}${t.program?.name ? ` (${t.program.name})` : ""}: worked ${fmt.span(t.end - t.start)}`);
  const spaces = new Set(turns.map((t) => t.space)).size;
  return [`## ${title}`, "", `${turns.length} agent turn${turns.length === 1 ? "" : "s"}, ${fmt.span(total)} of work, in ${spaces} space${spaces === 1 ? "" : "s"}.`, "", ...lines, ""].join("\n");
}
