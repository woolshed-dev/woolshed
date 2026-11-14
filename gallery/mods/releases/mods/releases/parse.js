// Reads `gh release list --json …`, the commits since the latest release (local git log,
// or GitHub's compare), and drafts notes as a markdown list.

import { json } from "./common.js";

export const RELEASE_FIELDS = "tagName,name,isLatest,isDraft,isPrerelease,publishedAt,createdAt";
export const LOG_FORMAT = "--format=%h%x1f%s%x1f%an%x1f%cI";

/** gh's releases -> rows, newest first, and which is the latest. */
export function parseReleases(text) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return { rows: [], latest: null };
  const rows = list.map((r) => ({ tag: r.tagName, name: r.name && r.name !== r.tagName ? r.name : "", latest: Boolean(r.isLatest),
    draft: Boolean(r.isDraft), pre: Boolean(r.isPrerelease), at: r.publishedAt || r.createdAt || null }));
  const latest = rows.find((r) => r.latest) ?? rows.find((r) => !r.draft && !r.pre) ?? null;
  return { rows, latest };
}

/** `git log <tag>..HEAD --format=%h%x1f%s%x1f%an%x1f%cI` -> [{ sha, subject, author, at }]. */
export function parseLog(text) {
  return String(text ?? "").split("\n").filter((l) => l.includes("\x1f")).map((l) => {
    const [sha, subject, author, at] = l.split("\x1f");
    return { sha, subject: subject ?? "", author: author ?? "", at: at ?? null };
  });
}

/** GitHub's compare (`gh api repos/{o}/{r}/compare/<tag>...<branch>`) -> the same shape, newest first. */
export function parseCompare(text) {
  const c = json(text);
  const list = Array.isArray(c?.commits) ? c.commits : [];
  return list.map((x) => ({ sha: String(x.sha ?? "").slice(0, 7), subject: String(x.commit?.message ?? "").split("\n")[0],
    author: x.author?.login ?? x.commit?.author?.name ?? "", at: x.commit?.committer?.date ?? x.commit?.author?.date ?? null })).reverse();
}

const NOISE = /^(Merge (branch|pull request|remote-tracking)|chore\(release\)|release:|Release v?\d|bump version|v?\d+\.\d+\.\d+$)/i;

/** One commit as a line for people: the conventional prefix gone, the first letter capital. */
export function sentence(subject) {
  const m = String(subject).match(/^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/);
  const text = m ? m[4] : String(subject);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The kind of a commit by its conventional prefix: new, fixed or other. */
export function kindOf(subject) {
  const m = String(subject).match(/^(\w+)(\([^)]*\))?!?:/);
  const k = m?.[1]?.toLowerCase();
  if (["feat", "feature", "add"].includes(k)) return "new";
  if (["fix", "bugfix", "hotfix", "perf"].includes(k)) return "fixed";
  return "other";
}

/** Markdown for release notes: "## Since v1.4.0", then New, Fixed and Other lists. Merges and release commits are left out. */
export function draftNotes(tag, commits) {
  const groups = { new: [], fixed: [], other: [] };
  for (const c of commits) {
    if (NOISE.test(c.subject.trim())) continue;
    groups[kindOf(c.subject)].push(`- ${sentence(c.subject)} (${c.sha})`);
  }
  const out = [tag ? `## Since ${tag}` : "## Changes"];
  for (const [key, title] of [["new", "New"], ["fixed", "Fixed"], ["other", "Other"]]) {
    if (groups[key].length) out.push("", `### ${title}`, ...groups[key]);
  }
  if (out.length === 1) out.push("", "- Nothing yet.");
  return out.join("\n") + "\n";
}
