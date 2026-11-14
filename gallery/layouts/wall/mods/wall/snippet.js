// The wall's pure parts: the bottom of a screen as a tile shows it, how many
// tiles fit across, and the agents grouped by space in wall order.

export const LINES = 7;
const DECOR = /^[\s─-▟│┃┆┊╎╏═║▏▕⎯—_=·•.]*$/u;

// The last `n` lines of text on a screen (`hc read <t> --lines 0`), trailing blank
// lines and lines of only box drawing dropped, tabs expanded, each cut to `width`.
export function snippet(screen, n = LINES, width = 160) {
  const lines = String(screen ?? "").replace(/\r\n?/g, "\n").split("\n")
    .map((l) => l.replace(/\t/g, "    ").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trimEnd());
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const kept = lines.filter((l, i) => !(l.trim() && DECOR.test(l) && l.trim().length > 2) || i === lines.length - 1);
  // Runs of blank lines fold to one, so a tile isn't half empty.
  const out = [];
  for (const l of kept) {
    if (!l.trim() && (!out.length || !out.at(-1).trim())) continue;
    out.push(l.length > width ? `${l.slice(0, width - 1)}…` : l);
  }
  return out.slice(-n);
}

// Columns for a wall `width` px wide: tiles at least `min` px, `gap` apart, at most 4.
export function columns(width, min = 300, gap = 10) {
  if (!width || width <= 0) return 1;
  return Math.max(1, Math.min(4, Math.floor((width + gap) / (min + gap))));
}

// Agents grouped by space, in space order; inside a space, the ones that need you
// first, then by tab and pane (the model's order). Spaces without agents are left out.
const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
export function groups(spaceList, agentList) {
  const out = [];
  for (const s of spaceList ?? []) {
    const mine = (agentList ?? []).filter((a) => a.space === s.id);
    if (!mine.length) continue;
    const idx = new Map(mine.map((a, i) => [a.address, i]));
    mine.sort((x, y) => Number(y.pinned) - Number(x.pinned) || (RANK[x.status] ?? 4) - (RANK[y.status] ?? 4) || idx.get(x.address) - idx.get(y.address));
    out.push({ space: s, agents: mine });
  }
  // Agents whose space isn't listed (yet) still get a place.
  const known = new Set(out.flatMap((g) => g.agents.map((a) => a.address)));
  const rest = (agentList ?? []).filter((a) => !known.has(a.address));
  if (rest.length) out.push({ space: { id: "other", name: "Other" }, agents: rest });
  return out;
}
