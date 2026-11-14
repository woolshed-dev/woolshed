// Readers for what git-branches asks git for. Pure: no woolshed imports, so bun can test them.

// One record per local branch: fields split by 0x1f, records by 0x1e.
export const BRANCH_FORMAT = "%(HEAD)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f%(committerdate:unix)%1f%(subject)%1e";

// Branches "Delete merged" never offers.
export const PROTECTED = new Set(["main", "master", "develop", "dev", "trunk", "release", "production", "staging"]);

/** `%(upstream:track)`: "[ahead 2, behind 1]", "[gone]" or "" → { ahead, behind, gone }. */
export function parseTrack(text) {
  const t = text ?? "";
  return {
    ahead: Number(/ahead (\d+)/.exec(t)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(t)?.[1] ?? 0),
    gone: /\bgone\b/.test(t),
  };
}

/** `git for-each-ref --format=BRANCH_FORMAT refs/heads` → [{ current, name, upstream, ahead, behind, gone, time, subject }]. */
export function parseBranches(text) {
  const out = [];
  for (const rec of (text ?? "").split("\x1e")) {
    const f = rec.replace(/^\n+/, "").split("\x1f");
    if (f.length < 6 || !f[1]) continue;
    out.push({ current: f[0] === "*", name: f[1], upstream: f[2] || null, ...parseTrack(f[3]), time: Number(f[4]) || null, subject: f.slice(5).join(" ").trim() });
  }
  return out;
}

/** `git status --porcelain=v1 -z` → how many tracked files have changes (new files don't count). */
export function dirtyCount(text) {
  let n = 0;
  const parts = (text ?? "").split("\0");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length < 4) continue;
    const xy = p.slice(0, 2);
    if (xy[0] === "R" || xy[0] === "C") i += 1; // a rename's next field is its old path
    if (xy !== "??" && xy !== "!!") n += 1;
  }
  return n;
}

/** `git worktree list --porcelain` → Map of branch name → worktree folder. */
export function worktreeBranches(text) {
  const out = new Map();
  let folder = null;
  for (const line of (text ?? "").split("\n")) {
    if (line.startsWith("worktree ")) folder = line.slice(9);
    else if (line.startsWith("branch refs/heads/") && folder) out.set(line.slice(18), folder);
  }
  return out;
}

/** The branches "Delete merged" would remove: merged into HEAD, not current, not checked out
 *  in another worktree, not a long-lived name. */
export function deletable(branches, merged, worktrees = new Map()) {
  return branches.filter((b) => !b.current && merged.has(b.name) && !worktrees.has(b.name) && !PROTECTED.has(b.name)).map((b) => b.name);
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
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
