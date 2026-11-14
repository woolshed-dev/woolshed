// Readers for what blame-line asks git for. Pure: no woolshed imports, so bun can test them.

export const UNCOMMITTED = "0000000000000000000000000000000000000000";
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const CONTEXT = 3; // lines shown above and below

/** "src/a.ts:12", "src/a.ts:12:5", "./src/a.ts:12", "src/a.ts#L12", "/abs/repo/src/a.ts:12" → { path, line }, else null. */
export function parseTarget(text, root = null) {
  let s = (text ?? "").trim().replace(/^["'`]|["'`]$/g, "");
  const m = /^(.+?)(?::|#L|\s+line\s+)(\d+)(?::\d+)?\s*$/i.exec(s);
  if (!m) return null;
  let path = m[1].trim();
  const line = Number(m[2]);
  if (!line) return null;
  if (root && (path === root || path.startsWith(root.replace(/\/+$/, "") + "/"))) path = path.slice(root.replace(/\/+$/, "").length + 1);
  path = path.replace(/^\.\//, "");
  return path ? { path, line } : null;
}

/** `git blame --line-porcelain` → [{ sha, line, author, time, summary, boundary, text }]. */
export function parseBlame(text) {
  const out = [];
  let cur = null;
  for (const raw of (text ?? "").split("\n")) {
    if (cur && raw.startsWith("\t")) { cur.text = raw.slice(1); out.push(cur); cur = null; continue; }
    const head = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/.exec(raw);
    if (head) { cur = { sha: head[1], line: Number(head[3]), author: null, time: null, summary: "", boundary: false, text: "" }; continue; }
    if (!cur) continue;
    if (raw.startsWith("author ")) cur.author = raw.slice(7);
    else if (raw.startsWith("author-time ")) cur.time = Number(raw.slice(12)) || null;
    else if (raw.startsWith("summary ")) cur.summary = raw.slice(8);
    else if (raw === "boundary") cur.boundary = true;
  }
  return out;
}

/** The first line `git diff -U0` changed on the new side, else null. */
export function firstChangedLine(diff) {
  for (const line of (diff ?? "").split("\n")) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) return Math.max(1, Number(m[1]) + (m[2] === "0" ? 1 : 0));
  }
  return null;
}

/** The window of lines to blame around `line`. */
export function around(line, context = CONTEXT) {
  return [Math.max(1, line - context), line + context];
}

/** "3m ago", "2h ago", "5d ago" since a unix time in seconds. */
export function since(seconds, now = Date.now()) {
  if (!seconds) return "";
  const m = Math.floor(Math.max(0, now / 1000 - seconds) / 60);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d ago`;
  return d < 730 ? `${Math.floor(d / 30)}mo ago` : `${Math.floor(d / 365)}y ago`;
}

/** What a failed exec or git run means for a person. */
export function explain(error, stderr = "") {
  const e = String(error?.message ?? error ?? "");
  if (/cannot start git|program not found|ENOENT/i.test(e)) return { missing: true, text: "git isn't installed on this machine. Install it (git-scm.com, or your package manager) and look again." };
  if (/not a git repository/i.test(stderr || e)) return { notRepo: true, text: "Not a git repository" };
  const only = /has only (\d+) lines?/.exec(stderr || e);
  if (only) return { text: `That file has only ${only[1]} line${only[1] === "1" ? "" : "s"}.` };
  if (/no such path|no such file|does not exist/i.test(stderr || e)) return { text: "No such file in this repository (paths are from its top folder)." };
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
