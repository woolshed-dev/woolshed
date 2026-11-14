// Status changes as log entries, and the log as markdown. No imports.
// An entry: { id, at, address, space, tab, program, from, to }; from null: it
// appeared; to "gone": it closed.

export const CAP = 1000;

const snap = (a) => ({
  address: a.address, space: a.space_name || "space",
  tab: a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : "",
  program: a.program ? { key: a.program.key, name: a.program.name, icon: a.program.icon, tint: a.program.tint } : null,
});

// `last`: this copy's memory, { addr: { s, seq, snap } }; `seeded`: whether it has
// seen the agents before (the first look logs nothing). Returns new entries.
export function follow(last, list, now, seeded) {
  const out = [];
  const live = new Set();
  for (const a of list) {
    live.add(a.address);
    const prev = last[a.address];
    if (!prev) {
      if (seeded) out.push({ id: `${a.address}#new#${a.seq ?? now}`, at: now, ...snap(a), from: null, to: a.status });
    } else if (prev.s !== a.status) {
      out.push({ id: `${a.address}#${a.seq ?? now}#${a.status}`, at: now, ...snap(a), from: prev.s, to: a.status });
    }
    last[a.address] = { s: a.status, seq: a.seq, snap: snap(a) };
  }
  for (const [k, prev] of Object.entries(last)) {
    if (live.has(k)) continue;
    out.push({ id: `${k}#gone#${prev.seq ?? ""}`, at: now, ...prev.snap, from: prev.s, to: "gone" });
    delete last[k];
  }
  return out;
}

// Appends entries not already there (two copies see the same change); keeps the newest `cap`.
export function append(log, entries, cap = CAP) {
  const have = new Set(log.map((e) => e.id));
  const fresh = entries.filter((e) => !have.has(e.id));
  if (!fresh.length) return null;
  return [...log, ...fresh].sort((x, y) => x.at - y.at).slice(-cap);
}

// Whether an entry matches a search (space, tab, program, address) and a status filter.
export function matches(e, query, status) {
  if (status && e.to !== status) return false;
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;
  return [e.space, e.tab, e.program?.name, e.address].some((x) => (x ?? "").toLowerCase().includes(q));
}

// The log as markdown, oldest first, a heading per day.
export function markdown(entries, fmt) {
  const out = ["# Agent log", ""];
  let day = null;
  for (const e of [...entries].sort((x, y) => x.at - y.at)) {
    const d = fmt.day(e.at);
    if (d !== day) { if (day) out.push(""); out.push(`## ${d}`, ""); day = d; }
    const who = `**${e.space}**${e.tab ? ` · ${e.tab}` : ""}${e.program?.name ? ` (${e.program.name})` : ""}`;
    out.push(`- ${fmt.time(e.at)} ${who}: ${fmt.word(e.from)} → ${fmt.word(e.to)}`);
  }
  out.push("");
  return out.join("\n");
}
