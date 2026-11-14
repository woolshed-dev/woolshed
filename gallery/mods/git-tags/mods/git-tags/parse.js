// Readers for what git-tags asks git for, and the changelog it writes. Pure: no woolshed
// imports, so bun can test them.

// One record per tag / commit: fields split by 0x1f, records by 0x1e.
export const TAG_FORMAT = "%(refname:short)%1f%(creatordate:unix)%1f%(objecttype)%1f%(objectname)%1f%(*objectname)%1f%(contents:subject)%1e";
export const COMMIT_FORMAT = "%H%x1f%h%x1f%an%x1f%ct%x1f%s%x1e";

/** `git for-each-ref --format=TAG_FORMAT refs/tags` → [{ name, time, annotated, commit, subject }]. */
export function parseTags(text) {
  const out = [];
  for (const rec of (text ?? "").split("\x1e")) {
    const f = rec.replace(/^\n+/, "").split("\x1f");
    if (f.length < 6 || !f[0]) continue;
    const annotated = f[2] === "tag";
    out.push({ name: f[0], time: Number(f[1]) || null, annotated, commit: (annotated ? f[4] : f[3]) || f[3], subject: annotated ? f.slice(5).join(" ").trim() : "" });
  }
  return out;
}

/** `git log --format=COMMIT_FORMAT` → [{ sha, short, author, time, subject }]. */
export function parseCommits(text) {
  const out = [];
  for (const rec of (text ?? "").split("\x1e")) {
    const f = rec.replace(/^\n+/, "").split("\x1f");
    if (f.length < 5 || !/^[0-9a-f]{7,64}$/.test(f[0])) continue;
    out.push({ sha: f[0], short: f[1], author: f[2], time: Number(f[3]) || null, subject: f.slice(4).join(" ").trim() });
  }
  return out;
}

// Conventional commit types and the changelog section each goes in.
const SECTIONS = [["New", ["feat", "feature"]], ["Fixed", ["fix", "bugfix", "hotfix"]], ["Faster", ["perf"]]];

/** "feat(voice)!: push to talk" → { type: "feat", scope: "voice", breaking: true, text: "Push to talk" }. */
export function conventional(subject) {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(subject ?? "");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!m) return { type: null, scope: null, breaking: false, text: cap((subject ?? "").trim()) };
  return { type: m[1].toLowerCase(), scope: m[2] || null, breaking: Boolean(m[3]), text: cap(m[4].trim()) };
}

/** The commits in changelog sections: [{ title, items: [{ ...commit, c: conventional }] }]. */
export function sections(commits) {
  const any = commits.some((c) => conventional(c.subject).type);
  if (!any) return commits.length ? [{ title: "Changes", items: commits.map((c) => ({ ...c, c: conventional(c.subject) })) }] : [];
  const out = SECTIONS.map(([title]) => ({ title, items: [] }));
  const other = { title: "Other", items: [] };
  for (const commit of commits) {
    const c = conventional(commit.subject);
    const i = SECTIONS.findIndex(([, types]) => types.includes(c.type));
    (i >= 0 ? out[i] : other).items.push({ ...commit, c });
  }
  return [...out, other].filter((s) => s.items.length);
}

/** Markdown for the commits since `tag` (null: since the start). */
export function changelog(commits, tag) {
  const head = tag ? `## Since ${tag}` : "## Changes";
  if (!commits.length) return `${head}\n\nNothing yet.\n`;
  const lines = [head, ""];
  for (const s of sections(commits)) {
    lines.push(`### ${s.title}`, "");
    for (const x of s.items) lines.push(`- ${x.c.breaking ? "**Breaking:** " : ""}${x.c.scope ? `**${x.c.scope}:** ` : ""}${x.c.text} (${x.short})`);
    lines.push("");
  }
  return lines.join("\n");
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

/** "12 Oct 2026" for a unix time in seconds. */
export function day(seconds) {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getFullYear()}`;
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
