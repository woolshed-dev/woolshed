// Readers for what git-stash asks git for. Pure: no woolshed imports, so bun can test them.

// One record per stash: fields split by 0x1f, records by 0x1e.
export const STASH_FORMAT = "%gd%x1f%H%x1f%ct%x1f%gs%x1e";

/** A stash's reflog subject: "On main: message" or "WIP on main: a1b2c3d subject". */
export function parseSubject(gs) {
  const s = (gs ?? "").trim();
  let m = /^On ([^:]+): (.*)$/s.exec(s);
  if (m) return { branch: m[1], message: m[2].trim(), wip: false };
  m = /^WIP on ([^:]+): (?:[0-9a-f]{7,40} )?(.*)$/s.exec(s);
  if (m) return { branch: m[1], message: m[2].trim(), wip: true };
  return { branch: null, message: s, wip: false };
}

/** `git stash list --format=STASH_FORMAT` → [{ ref, index, sha, time, branch, message, wip }]. */
export function parseStashes(text) {
  const out = [];
  for (const rec of (text ?? "").split("\x1e")) {
    const f = rec.replace(/^\n+/, "").split("\x1f");
    if (f.length < 4) continue;
    const m = /^stash@\{(\d+)\}$/.exec(f[0]);
    if (!m) continue;
    out.push({ ref: f[0], index: Number(m[1]), sha: f[1], time: Number(f[2]) || null, ...parseSubject(f.slice(3).join(" ")) });
  }
  return out;
}

/** `git stash show --name-status -z` → [{ status: "M" | "A" | "D" | "R" | ..., path, from }]. */
export function parseNameStatus(text) {
  const out = [];
  const f = (text ?? "").split("\0");
  for (let i = 0; i < f.length; i++) {
    const code = f[i];
    if (!/^[ACDMRTUX]\d*$/.test(code)) continue;
    const letter = code[0];
    if ((letter === "R" || letter === "C") && i + 2 < f.length) { out.push({ status: letter, from: f[i + 1], path: f[i + 2] }); i += 2; }
    else if (i + 1 < f.length) { out.push({ status: letter, from: null, path: f[i + 1] }); i += 1; }
  }
  return out;
}

/** The stash's ref now (indexes move when another is dropped), by its commit. */
export function refFor(stashes, sha) {
  return stashes.find((s) => s.sha === sha)?.ref ?? null;
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
  if (/CONFLICT/.test(stderr || e)) return { text: "Applied with conflicts: fix them in the files, then git add. The stash was kept." };
  const lines = (stderr || e).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.pop() ?? "git failed";
  return { text: line.replace(/^(fatal|error): /, "") };
}
