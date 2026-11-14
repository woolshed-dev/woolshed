// The cockpit's right column, as layout nodes: the shown tab's other terminals,
// each in a card with a 28 px tag on top. Pure, so it can be tested alone.

export const MOD = "cockpit";
export const MAX = 4;

export const slug = (addr) => String(addr).replace(/[^A-Za-z0-9_-]/g, "-");

export function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

// Who goes in the column: the terminals of the tab on screen, in pane order,
// except the one on the stage. Mod panes (a file viewer) have no terminal and stay out.
export function others(paneList, tab, stage) {
  if (!tab) return [];
  const out = [];
  for (const p of paneList ?? []) {
    if (p.tab !== tab || !p.terminal || p.terminal === stage) continue;
    if (!out.includes(p.terminal)) out.push(p.terminal);
  }
  return out.slice(0, MAX);
}

export function column(addrs) {
  if (!addrs.length) return [{ id: "side-empty", type: "block", content: { mod: MOD, props: { role: "empty" } } }];
  return addrs.map((addr) => {
    const s = slug(addr);
    return {
      id: `pen-${s}`, type: "column", background: "background", border: { width: 1, color: "border" }, radius: 10,
      focus: { border: { width: 1, color: "accent" } }, resizable: false,
      children: [
        { id: `tag-${s}`, type: "block", size: { px: 28 }, content: { mod: MOD, props: { role: "tag", terminal: addr } } },
        { id: `term-${s}`, type: "block", content: { terminal: addr } },
      ],
    };
  });
}

export function shownIn(node) {
  const out = [];
  const walk = (n) => { if (n?.content?.terminal) out.push(n.content.terminal); for (const c of n?.children ?? []) walk(c); };
  walk(node);
  return out;
}
