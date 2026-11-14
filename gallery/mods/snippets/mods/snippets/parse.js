// Snippets: the file's shape, search and tags. Pure functions, no Woolshed calls.

export const SEEDS = [
  { name: "Undo the last commit, keep the changes", tags: ["git"], text: "git reset --soft HEAD~1" },
  { name: "What's listening on port 3000", tags: ["ports"], text: "lsof -nP -iTCP:3000 -sTCP:LISTEN" },
  { name: "Tests with coverage", tags: ["test"], text: "npm test -- --coverage" },
  { name: "Clean up Docker", tags: ["docker"], text: "docker system prune --volumes" },
  { name: "Review before merging", tags: ["prompt"], text: "Review your diff for bugs, missing tests and leftover debug code. List what you find before changing anything." },
  { name: "Branches merged into main", tags: ["git"], text: "git branch --merged main | grep -v '^\\*\\|main'" },
];

export function tagsOf(value) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const out = [];
  for (const t of list) {
    const tag = String(t).trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

// The list, or null when the text isn't a list of snippets.
export function parse(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.snippets;
    if (!Array.isArray(list)) return null;
    return list.filter((s) => s && typeof s.text === "string").map((s, i) => ({
      id: String(s.id ?? `s${i + 1}`),
      name: String(s.name ?? s.title ?? s.text.split("\n")[0].slice(0, 40)),
      tags: tagsOf(s.tags),
      text: s.text,
    }));
  } catch { return null; }
}

export const dump = (list) => JSON.stringify({ snippets: list }, null, 2) + "\n";

export function allTags(list) {
  const count = new Map();
  for (const s of list) for (const t of s.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

// Every word of the query must be in the name, a tag or the text; every chosen tag must be on it.
export function filter(list, query, tags = []) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((s) => {
    if (tags.some((t) => !s.tags.includes(t))) return false;
    const hay = `${s.name}\n${s.tags.join(" ")}\n${s.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
