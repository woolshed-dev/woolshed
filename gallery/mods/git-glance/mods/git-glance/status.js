// Reads `git status --porcelain=v2 --branch --show-stash` into plain numbers.

export function parseStatus(text) {
  const out = { head: null, detached: false, oid: null, upstream: null, ahead: 0, behind: 0, stash: null,
    staged: 0, changed: 0, untracked: 0, conflicts: 0 };
  for (const line of (text ?? "").split("\n")) {
    if (line.startsWith("# branch.oid ")) out.oid = line.slice(13).trim();
    else if (line.startsWith("# branch.head ")) {
      const h = line.slice(14).trim();
      out.detached = h === "(detached)";
      out.head = out.detached ? null : h;
    } else if (line.startsWith("# branch.upstream ")) out.upstream = line.slice(18).trim();
    else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(line);
      if (m) { out.ahead = Number(m[1]); out.behind = Number(m[2]); }
    } else if (line.startsWith("# stash ")) out.stash = Number(line.slice(8)) || 0;
    else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4);
      if (xy[0] !== ".") out.staged += 1;
      if (xy[1] !== ".") out.changed += 1;
    } else if (line.startsWith("u ")) out.conflicts += 1;
    else if (line.startsWith("? ")) out.untracked += 1;
  }
  return out;
}

// "3m", "2h", "5d" since a unix time in seconds.
export function since(seconds, now = Date.now()) {
  const m = Math.floor(Math.max(0, now / 1000 - seconds) / 60);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}
