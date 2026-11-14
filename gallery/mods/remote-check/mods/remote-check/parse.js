// Readers for what remote-check asks git for. Pure: no woolshed imports, so bun can test them.

/** `git rev-list --left-right --count @{upstream}...HEAD` → { behind, ahead }, else null. */
export function parseCounts(text) {
  const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(text ?? "");
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null;
}

/** `stat` output (seconds since the epoch) → a number, else null. */
export function parseMtime(text) {
  const m = /^\s*(\d{9,})\s*$/.exec(text ?? "");
  return m ? Number(m[1]) : null;
}

/** Where `git rev-parse --git-path FETCH_HEAD` points, made absolute against the repo's root. */
export function absolute(path, root) {
  const p = (path ?? "").trim();
  if (!p) return null;
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) return p;
  return `${root.replace(/[\\/]+$/, "")}/${p}`;
}

/** "fetched 3m ago", "fetched 2d ago", "never fetched". */
export function fetchedLabel(seconds, now = Date.now()) {
  if (!seconds) return "never fetched";
  const m = Math.floor(Math.max(0, now / 1000 - seconds) / 60);
  if (m < 1) return "fetched just now";
  if (m < 60) return `fetched ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `fetched ${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 60 ? `fetched ${d}d ago` : `fetched ${Math.floor(d / 30)}mo ago`;
}

/** Spaces that share a repository are one row: Map key → { key, names, ...first }. */
export function byRepo(rows) {
  const out = new Map();
  for (const r of rows) {
    const was = out.get(r.key);
    if (was) was.names.push(r.name);
    else out.set(r.key, { ...r, names: [r.name] });
  }
  return [...out.values()];
}

/** What a failed exec or git run means for a person. */
export function explain(error, stderr = "") {
  const e = String(error?.message ?? error ?? "");
  if (/cannot start git|program not found|ENOENT/i.test(e)) return { missing: true, text: "git isn't installed on this machine. Install it (git-scm.com, or your package manager) and look again." };
  if (/not a git repository/i.test(stderr || e)) return { notRepo: true, text: "not a git repository" };
  if (/timed? ?out/i.test(e)) return { text: "fetch took over a minute" };
  if (/could not read from remote|permission denied|authentication failed|terminal prompts disabled/i.test(stderr || e)) return { text: "the remote wouldn't let it in (sign in once from a terminal)" };
  if (/could not resolve host|unable to access|network is unreachable/i.test(stderr || e)) return { text: "can't reach the remote" };
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
