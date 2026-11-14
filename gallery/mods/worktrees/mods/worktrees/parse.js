// Readers for what worktrees asks git for. Pure: no woolshed imports, so bun can test them.

/** `git worktree list --porcelain` → [{ path, head, branch, detached, bare, locked, prunable }]. */
export function parseWorktrees(text) {
  const out = [];
  let cur = null;
  for (const line of (text ?? "").split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice(9), head: null, branch: null, detached: false, bare: false, locked: false, prunable: false };
      out.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith("HEAD ")) cur.head = line.slice(5);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (line === "detached") cur.detached = true;
    else if (line === "bare") cur.bare = true;
    else if (line === "locked" || line.startsWith("locked ")) cur.locked = true;
    else if (line === "prunable" || line.startsWith("prunable ")) cur.prunable = true;
  }
  return out;
}

/** `git status --porcelain=v1 -z` → { changed, fresh, conflicts }. */
export function parseDirty(text) {
  const out = { changed: 0, fresh: 0, conflicts: 0 };
  const parts = (text ?? "").split("\0");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length < 4) continue;
    const xy = p.slice(0, 2);
    if (xy[0] === "R" || xy[0] === "C") i += 1; // a rename's next field is its old path
    if (xy === "??") out.fresh += 1;
    else if (/U|AA|DD/.test(xy)) out.conflicts += 1;
    else if (xy !== "!!") out.changed += 1;
  }
  return out;
}

/** Is `folder` the worktree at `root`, or inside it? (Both on one machine.) */
export function within(folder, root) {
  if (!folder || !root) return false;
  const r = root.replace(/[\\/]+$/, "");
  return folder === r || folder.startsWith(r + "/") || folder.startsWith(r + "\\");
}

/** The deepest worktree holding `folder`: nested worktrees (inside the main checkout) win. */
export function worktreeOf(folder, trees) {
  return trees.filter((w) => within(folder, w.path)).sort((a, b) => b.path.length - a.path.length)[0] ?? null;
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
