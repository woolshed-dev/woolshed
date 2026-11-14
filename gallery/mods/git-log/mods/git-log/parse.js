// Readers for what git-log asks git for. Pure: no woolshed imports, so bun can test them.

// One record per commit, fields split by the unit separator (0x1f), records by 0x1e.
export const LOG_FORMAT = "%H%x1f%h%x1f%an%x1f%ct%x1f%D%x1f%s%x1e";

/** `%D` ("HEAD -> main, origin/main, tag: v1.2") → [{ name, kind: "head" | "branch" | "remote" | "tag" }]. */
export function parseRefs(text, remotes = ["origin"]) {
  const out = [];
  for (const raw of (text ?? "").split(", ")) {
    const r = raw.trim();
    if (!r || r === "HEAD" || /\/HEAD$/.test(r)) continue;
    if (r.startsWith("HEAD -> ")) out.push({ name: r.slice(8), kind: "head" });
    else if (r.startsWith("tag: ")) out.push({ name: r.slice(5), kind: "tag" });
    else if (remotes.some((m) => r.startsWith(m + "/"))) out.push({ name: r, kind: "remote" });
    else out.push({ name: r, kind: "branch" });
  }
  return out;
}

/** `git log --format=LOG_FORMAT` → [{ sha, short, author, time, refs, subject }]. */
export function parseLog(text, remotes) {
  const out = [];
  for (const rec of (text ?? "").split("\x1e")) {
    const f = rec.replace(/^\n+/, "").split("\x1f");
    if (f.length < 6 || !/^[0-9a-f]{7,64}$/.test(f[0])) continue;
    out.push({ sha: f[0], short: f[1], author: f[2], time: Number(f[3]) || null, refs: parseRefs(f[4], remotes), subject: f.slice(5).join("\x1f").trim() });
  }
  return out;
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
  if (/does not have any commits yet|unknown revision|bad default revision/i.test(stderr || e)) return { empty: true, text: "No commits yet" };
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
