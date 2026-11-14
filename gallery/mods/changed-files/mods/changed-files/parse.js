// Readers for what changed-files asks git for. Pure: no woolshed imports, so bun can test them.

// Where a branch usually leaves from, best first. origin/HEAD (the remote's default) goes first.
const BASES = ["origin/main", "origin/master", "main", "master", "origin/develop", "develop", "origin/trunk", "trunk"];

/** The bases to compare against, best first: the remote's default, then main, master, develop,
 *  trunk (remote before local), those that exist, never the current branch itself. */
export function baseCandidates(originHead, existing, current) {
  const have = new Set(existing ?? []);
  const out = [];
  const add = (b) => { if (b && have.has(b) && b !== current && !out.includes(b)) out.push(b); };
  if (originHead && originHead !== "origin/HEAD") { have.add(originHead); add(originHead); }
  for (const b of BASES) add(b);
  return out;
}

/** `git diff --name-status -z` → [{ status, path, from }]. */
export function parseNameStatus(text) {
  const out = [];
  const f = (text ?? "").split("\0");
  for (let i = 0; i < f.length; i++) {
    const code = f[i].replace(/^\n+/, "");
    if (!/^[ACDMRTUX]\d*$/.test(code)) continue;
    const letter = code[0];
    if ((letter === "R" || letter === "C") && i + 2 < f.length) { out.push({ status: letter, from: f[i + 1], path: f[i + 2] }); i += 2; }
    else if (i + 1 < f.length) { out.push({ status: letter, from: null, path: f[i + 1] }); i += 1; }
  }
  return out;
}

/** `git diff --numstat -z` → Map path → { added, removed, binary }. */
export function parseNumstat(text) {
  const out = new Map();
  const f = (text ?? "").split("\0");
  for (let i = 0; i < f.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(f[i].replace(/^\n+/, ""));
    if (!m) continue;
    let path = m[3];
    if (path === "" && i + 2 < f.length) { path = f[i + 2]; i += 2; }
    const binary = m[1] === "-";
    out.set(path, { added: binary ? 0 : Number(m[1]), removed: binary ? 0 : Number(m[2]), binary });
  }
  return out;
}

/** The changed files: name-status with their line counts, then new files ("?"), by path. */
export function changedFiles(nameStatus, numstat, untracked) {
  const files = nameStatus.map((f) => ({ ...f, ...(numstat.get(f.path) ?? { added: 0, removed: 0, binary: false }) }));
  const seen = new Set(files.map((f) => f.path));
  for (const p of untracked ?? []) if (!seen.has(p)) files.push({ status: "?", path: p, from: null, added: 0, removed: 0, binary: false });
  return files.sort((a, b) => a.path.localeCompare(b.path));
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
