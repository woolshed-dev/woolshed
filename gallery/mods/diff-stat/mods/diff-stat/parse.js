// Readers for what diff-stat asks git for. Pure: no woolshed imports, so bun can test them.

/** `git diff --numstat -z` → [{ path, from, added, removed, binary }]. A rename is
 *  "a\tr\t\0old\0new\0"; a binary file has "-" for both counts. */
export function parseNumstat(text) {
  const out = [];
  const f = (text ?? "").split("\0");
  for (let i = 0; i < f.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(f[i].replace(/^\n+/, ""));
    if (!m) continue;
    const binary = m[1] === "-";
    let path = m[3], from = null;
    if (path === "" && i + 2 < f.length) { from = f[i + 1]; path = f[i + 2]; i += 2; }
    out.push({ path, from, added: binary ? 0 : Number(m[1]), removed: binary ? 0 : Number(m[2]), binary });
  }
  return out;
}

/** `git ls-files -o --exclude-standard -z` → paths. */
export function parseZ(text) {
  return (text ?? "").split("\0").map((s) => s.replace(/^\n+/, "")).filter(Boolean);
}

/** `wc -l -- a b` → Map path → lines (the "total" line left out). */
export function parseWc(text, paths) {
  const out = new Map();
  const want = new Set(paths ?? []);
  for (const line of (text ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    if (want.size ? want.has(m[2]) : m[2] !== "total") out.set(m[2], Number(m[1]));
  }
  return out;
}

/** Sums of { added, removed } over files, and how many files. */
export function totals(...lists) {
  const seen = new Set();
  let added = 0, removed = 0;
  for (const list of lists) for (const f of list ?? []) { added += f.added ?? 0; removed += f.removed ?? 0; seen.add(f.path); }
  return { added, removed, files: seen.size };
}

/** A file's bar: the green and red widths in px for `width` px at the biggest change `max`. */
export function bar(f, max, width) {
  const total = (f.added ?? 0) + (f.removed ?? 0);
  if (!max || !total) return [0, 0];
  const w = Math.max(2, Math.round((Math.min(total, max) / max) * width));
  const add = Math.round((w * f.added) / total);
  return [add, w - add];
}

/** "src/routes/" and "voice.ts" from a path. */
export function split(path) {
  const i = (path ?? "").lastIndexOf("/");
  return i < 0 ? ["", path ?? ""] : [path.slice(0, i + 1), path.slice(i + 1)];
}

/** What a failed exec or git run means for a person. */
export function explain(error, stderr = "") {
  const e = String(error?.message ?? error ?? "");
  if (/cannot start git|program not found|ENOENT/i.test(e)) return { missing: true, text: "git isn't installed on this machine. Install it (git-scm.com, or your package manager) and look again." };
  if (/not a git repository/i.test(stderr || e)) return { notRepo: true, text: "Not a git repository" };
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
