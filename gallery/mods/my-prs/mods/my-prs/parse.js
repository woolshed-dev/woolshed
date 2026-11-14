// Reads `gh pr list --author @me --json …` into rows, and plans a worktree checkout.

import { json } from "./common.js";

export const PR_FIELDS = "number,title,url,headRefName,baseRefName,isDraft,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,updatedAt,isCrossRepository,headRepositoryOwner,additions,deletions,reviewRequests,latestReviews";

/** A pull request's checks rolled up: { pass, fail, wait, total, tone }. */
export function rollup(list) {
  let pass = 0, fail = 0, wait = 0;
  for (const c of list ?? []) {
    const s = String(c.conclusion || c.state || c.status || "").toUpperCase();
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(s)) pass++;
    else if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(s)) fail++;
    else wait++;
  }
  const total = pass + fail + wait;
  return { pass, fail, wait, total, tone: !total ? "neutral" : fail ? "fail" : wait ? "running" : "pass" };
}

/** Where the review stands: { word, tone, who }. tone: pass | fail | wait | draft. */
export function review(p) {
  const asked = (p.reviewRequests ?? []).map((r) => r.login || r.name || r.slug).filter(Boolean);
  if (p.isDraft) return { word: "draft", tone: "draft", who: asked };
  switch (p.reviewDecision) {
    case "APPROVED": return { word: "approved", tone: "pass", who: asked };
    case "CHANGES_REQUESTED": {
      const by = (p.latestReviews ?? []).filter((r) => r.state === "CHANGES_REQUESTED").map((r) => r.author?.login).filter(Boolean);
      return { word: "changes requested", tone: "fail", who: by };
    }
    case "REVIEW_REQUIRED": return { word: asked.length ? "waiting for review" : "needs a reviewer", tone: "wait", who: asked };
    default: {
      const approved = (p.latestReviews ?? []).some((r) => r.state === "APPROVED");
      return { word: approved ? "approved" : asked.length ? "waiting for review" : "no review yet", tone: approved ? "pass" : "wait", who: asked };
    }
  }
}

/** Whether it can merge: { word, tone } (tone: pass | fail | wait | ""). */
export function mergeState(p) {
  if (p.mergeable === "CONFLICTING" || p.mergeStateStatus === "DIRTY") return { word: "conflicts", tone: "fail" };
  switch (p.mergeStateStatus) {
    case "CLEAN": return { word: "ready to merge", tone: "pass" };
    case "HAS_HOOKS": return { word: "ready to merge", tone: "pass" };
    case "BEHIND": return { word: "behind base", tone: "wait" };
    case "UNSTABLE": return { word: "checks failing", tone: "fail" };
    case "BLOCKED": return { word: "blocked", tone: "wait" };
    case "DRAFT": return { word: "", tone: "" };
    default: return { word: "", tone: "" };
  }
}

/** gh's list -> rows, most recently updated first. */
export function parseMine(text) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    number: p.number, title: p.title ?? "", url: p.url, branch: p.headRefName ?? "", base: p.baseRefName ?? "",
    draft: Boolean(p.isDraft), cross: Boolean(p.isCrossRepository), owner: p.headRepositoryOwner?.login ?? "",
    adds: p.additions ?? 0, dels: p.deletions ?? 0, updated: p.updatedAt ?? null,
    review: review(p), checks: rollup(p.statusCheckRollup), merge: mergeState(p),
  })).sort((a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? "")));
}

/** A branch as a folder name. */
export const slug = (branch) => String(branch).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "branch";

/** `git worktree list --porcelain` -> [{ path, branch }]. */
export function worktrees(text) {
  const out = [];
  let cur = null;
  for (const line of String(text ?? "").split("\n")) {
    if (line.startsWith("worktree ")) { cur = { path: line.slice(9).trim(), branch: null }; out.push(cur); }
    else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
  }
  return out;
}

/** How to check a pull request out in its own worktree.
 *  -> { open: path } when a worktree already has the branch, else { path, branch, steps: [git args…] }. */
export function plan({ pr, remote, root, repoName, home, listed, hasBranch }) {
  const local = pr.cross ? `pr-${pr.number}` : pr.branch;
  const have = worktrees(listed).find((w) => w.branch === local);
  if (have) return { open: have.path, branch: local };
  const path = `${home}/.woolshed/worktrees/${repoName}/${slug(local)}`;
  const steps = [];
  if (pr.cross) {
    steps.push(["-C", root, "fetch", remote, `pull/${pr.number}/head`]);
    steps.push(hasBranch ? ["-C", root, "worktree", "add", path, local] : ["-C", root, "worktree", "add", "-b", local, path, "FETCH_HEAD"]);
  } else {
    steps.push(["-C", root, "fetch", remote, pr.branch]);
    steps.push(hasBranch ? ["-C", root, "worktree", "add", path, local] : ["-C", root, "worktree", "add", "--track", "-b", local, path, `${remote}/${pr.branch}`]);
  }
  return { path, branch: local, steps };
}
