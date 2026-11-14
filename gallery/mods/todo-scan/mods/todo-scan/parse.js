// Readers for what todo-scan asks git for. Pure: no woolshed imports, so bun can test them.

export const KINDS = ["TODO", "FIXME", "HACK", "XXX"];
const MARK = /\b(TODO|FIXME|HACK|XXX)\b/;

// What a marked line says, without the comment around it: "// TODO(maya): drop it" → "drop it".
export function cleanText(line, kind) {
  let s = line;
  const i = s.search(new RegExp(`\\b${kind}\\b`));
  if (i >= 0) s = s.slice(i + kind.length);
  s = s.replace(/^\([^)]*\)/, "").replace(/^[\s:!\-–—]+/, "");
  s = s.replace(/\s*(\*\/|-->|#}|%>)\s*$/, "").trim();
  return s || line.trim();
}

/** `git grep -n -z` → [{ path, line, kind, text }]: "path\0line\0text" per match. */
export function parseGrep(text, limit = 2000) {
  const out = [];
  for (const row of (text ?? "").split("\n")) {
    if (out.length >= limit) break;
    const a = row.indexOf("\0");
    if (a < 0) continue;
    const b = row.indexOf("\0", a + 1);
    if (b < 0) continue;
    const path = row.slice(0, a), line = Number(row.slice(a + 1, b)), body = row.slice(b + 1);
    const m = MARK.exec(body);
    if (!path || !line || !m) continue;
    out.push({ path, line, kind: m[1], text: cleanText(body, m[1]).slice(0, 300) });
  }
  return out;
}

/** Matches with `kinds` (a Set) that contain every word of `query` in their path or text. */
export function filter(matches, query, kinds) {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return matches.filter((m) => (!kinds || kinds.has(m.kind)) && words.every((w) => m.path.toLowerCase().includes(w) || m.text.toLowerCase().includes(w)));
}

/** Matches by file, files in path order, lines in order. */
export function group(matches) {
  const by = new Map();
  for (const m of matches) {
    if (!by.has(m.path)) by.set(m.path, []);
    by.get(m.path).push(m);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([path, items]) => ({ path, items: items.sort((a, b) => a.line - b.line) }));
}

/** How many of each kind. */
export function counts(matches) {
  const out = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const m of matches) out[m.kind] += 1;
  return out;
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
  if (/timed? ?out/i.test(e)) return { text: "The repository is too big to scan in 20 seconds." };
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
