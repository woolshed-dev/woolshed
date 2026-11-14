// The notebook's pure parts: where a space's notes live, and how a note splits
// into sections (each "## " heading starts one) for Read mode's Copy buttons.

export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

// One file per folder (and machine) under dir; a space without a folder gets its own.
export function noteOf(space, dir) {
  if (!space) return null;
  const where = space.folder || `space ${space.id}`;
  const base = (space.folder ? space.folder.split(/[\\/]/).filter(Boolean).pop() : space.name) || "home";
  const slug = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "notes";
  const machine = space.machine ? `${space.machine.replace(/[^A-Za-z0-9_-]+/g, "-")}--` : "";
  return {
    key: `${space.machine ?? ""}\u0000${where}`,
    path: `${dir}/${machine}${slug}-${hash(`${space.machine ?? ""}:${where}`)}.md`,
    name: space.name,
    folder: space.folder,
  };
}

// Sections: text before the first heading (if any), then one per "#"/"##"/"###" heading.
// Headings inside ``` fences don't count. Each: { title, level, body, text } where text
// is what Copy puts on the clipboard (heading included, trimmed).
export function sections(md) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let cur = { title: "", level: 0, lines: [] };
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      out.push(cur);
      cur = { title: m[2], level: m[1].length, lines: [line] };
    } else cur.lines.push(line);
  }
  out.push(cur);
  return out
    .map((s) => {
      const text = s.lines.join("\n").trim();
      const body = (s.title ? s.lines.slice(1) : s.lines).join("\n").trim();
      return { title: s.title, level: s.level, body, text };
    })
    .filter((s) => s.title || s.body);
}

export const TEMPLATE = `## Goal

What this project is trying to get done, in a sentence or two.

## Next

- [ ]
- [ ]

## Ask the agent

Paste-ready instructions: what to change, what not to touch, how to check it.

## Decisions

-
`;

export function tidy(path, home) {
  if (!path) return "";
  return path === home ? "~" : path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}
