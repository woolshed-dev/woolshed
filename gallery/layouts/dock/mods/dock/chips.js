// The dock's chips, pure: every terminal with a pane, grouped by space in space,
// tab and pane order, each followed by the helpers (sub-agents) it started that
// have no pane of their own.

const STATUSES = new Set(["working", "blocked", "done", "idle"]);
const ENDED = new Set(["exited", "dead", "ended", "killed", "finished"]);

// An agent goes by its program ("Claude Code"); a program Woolshed has no entry for
// goes by its title when that says more than a path ("pytest -x"); else its name.
export function nameOf(agent, program, title, addr) {
  if (agent) return program?.name ?? "agent";
  const clean = String(title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if ((!program || program.key === "program") && clean && !/^[~/]|^[A-Za-z]:\\/.test(clean)) return clean.slice(0, 40);
  return program?.name ?? (clean || addr);
}

export function chips(spaceList, paneList, termList, agentList) {
  const agentOf = new Map((agentList ?? []).map((a) => [a.address, a]));
  const recOf = new Map((termList ?? []).map((r) => [r.address, r]));
  const inPane = new Set((paneList ?? []).filter((p) => p.terminal).map((p) => p.terminal));
  const kids = new Map();
  for (const r of termList ?? []) {
    if (!r?.parent || inPane.has(r.address) || ENDED.has(String(r.state ?? ""))) continue;
    if (!kids.has(r.parent)) kids.set(r.parent, []);
    kids.get(r.parent).push(r);
  }
  const seen = new Set();
  const groups = [];
  for (const s of spaceList ?? []) {
    const group = { space: s.id, name: s.name, active: Boolean(s.active), chips: [] };
    for (const c of s.tabs ?? []) {
      const tabName = c.named ? c.name : `tab ${c.name}`;
      const where = `${s.name} / ${tabName}`;
      const add = (addr, pane, helper, fallback) => {
        if (seen.has(addr)) return;
        seen.add(addr);
        const a = agentOf.get(addr);
        const r = recOf.get(addr);
        const program = a?.program ?? fallback?.program ?? r?.program ?? null;
        const word = a?.status ?? fallback?.status ?? r?.status ?? null;
        group.chips.push({
          address: addr,
          pane,
          tab: c.id,
          tabName,
          where,
          helper,
          cwd: fallback?.cwd ?? r?.cwd ?? null,
          program,
          name: nameOf(a, program, fallback?.title ?? r?.name, addr),
          status: STATUSES.has(word) ? word : null,
        });
        for (const k of kids.get(addr) ?? []) add(k.address, null, true, null);
      };
      for (const p of paneList ?? []) if (p.tab === c.id && p.terminal) add(p.terminal, p.pane, false, p);
    }
    if (group.chips.length) groups.push(group);
  }
  return groups;
}
