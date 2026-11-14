// Reads `gh search prs --review-requested=@me --json …` and writes the review task an agent gets.

import { json, ms } from "./common.js";

export const SEARCH_FIELDS = "number,title,url,repository,author,createdAt,updatedAt,isDraft,labels,commentsCount";

/** gh's search results -> rows, oldest request first. */
export function parseQueue(text, now = Date.now()) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    const since = ms(p.createdAt);
    const days = since === null ? 0 : (now - since) / 864e5;
    return {
      number: p.number, title: p.title ?? "", url: p.url, repo: p.repository?.nameWithOwner ?? p.repository?.name ?? "",
      author: p.author?.login ?? "", bot: Boolean(p.author?.is_bot) || /\[bot\]$/.test(p.author?.login ?? ""),
      created: p.createdAt ?? null, updated: p.updatedAt ?? null, draft: Boolean(p.isDraft),
      labels: (p.labels ?? []).map((l) => l.name).filter(Boolean), comments: p.commentsCount ?? 0,
      days, urgency: days >= 5 ? "late" : days >= 2 ? "due" : "fresh",
    };
  }).sort((a, b) => (ms(a.created) ?? 0) - (ms(b.created) ?? 0));
}

/** "new", "waiting 5h", "waiting 3d", "waiting 4mo". */
export function waiting(row) {
  const h = Math.floor(row.days * 24);
  if (h < 1) return "new";
  if (h < 48) return `waiting ${h}h`;
  if (row.days < 60) return `waiting ${Math.floor(row.days)}d`;
  return `waiting ${Math.floor(row.days / 30)}mo`;
}

/** The first message for the agent. It reads and reports; it never posts. */
export function reviewTask(row) {
  return [
    `Review pull request #${row.number} in ${row.repo}: "${row.title}" by @${row.author} (${row.url}).`,
    `Read it with \`gh pr view ${row.url} --comments\` and \`gh pr diff ${row.url}\`. Don't check anything out or change files unless I ask.`,
    "Look for bugs, missing tests, risky changes and anything unclear, then tell me what you'd say in the review: blocking issues first, then suggestions, each with the file and line.",
    "Don't post a review or comments, approve, request changes or merge: I'll decide what to send.",
  ].join("\n\n");
}

/** The agent to ask: Claude Code when it's installed, else the first installed agent, else Claude Code anyway. */
export function pickAgent(known) {
  const list = Array.isArray(known) ? known : [];
  const claude = list.find((a) => a.key === "claude" && a.installed);
  const any = claude ?? list.find((a) => a.installed && Array.isArray(a.run) && a.run.length);
  return any ? { run: any.run, name: any.name } : { run: ["claude"], name: "Claude Code" };
}
