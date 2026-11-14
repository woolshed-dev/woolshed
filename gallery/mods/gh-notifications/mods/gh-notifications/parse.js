// Reads `gh api notifications` (GitHub's REST notifications) into groups by repository.

import { json } from "./common.js";

const KINDS = { PullRequest: "PR", Issue: "Issue", Release: "Release", Discussion: "Discussion", CheckSuite: "CI", Commit: "Commit", RepositoryVulnerabilityAlert: "Alert", RepositoryDependabotAlertsThread: "Alert", WorkflowRun: "CI" };
const REASONS = { review_requested: "review requested", mention: "mentioned you", team_mention: "mentioned your team", assign: "assigned to you", author: "you opened it", comment: "you commented", state_change: "state changed", ci_activity: "CI activity", subscribed: "watching", manual: "subscribed", security_alert: "security alert", approval_requested: "approval requested", invitation: "invitation", member_feature_requested: "feature request" };

/** The page for a notification's subject: its API address turned into github.com's. */
export function pageOf(subject, repo) {
  const base = repo?.html_url ?? (repo?.full_name ? `https://github.com/${repo.full_name}` : "https://github.com/notifications");
  const url = subject?.url ?? "";
  const m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues|commits|releases)\/([^/?#]+)/);
  if (m) {
    const [, path, what, id] = m;
    if (what === "pulls") return `https://github.com/${path}/pull/${id}`;
    if (what === "issues") return `https://github.com/${path}/issues/${id}`;
    if (what === "commits") return `https://github.com/${path}/commit/${id}`;
    return `https://github.com/${path}/releases`;
  }
  if (subject?.type === "Discussion") return `${base}/discussions`;
  if (subject?.type === "CheckSuite" || subject?.type === "WorkflowRun") return `${base}/actions`;
  return base;
}

/** -> [{ repo, rows: [{ id, kind, title, reason, important, unread, updated, url }] }], newest group first. */
export function parseNotifications(text) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  const groups = new Map();
  for (const n of list) {
    const repo = n.repository?.full_name ?? "elsewhere";
    const row = {
      id: String(n.id), kind: KINDS[n.subject?.type] ?? n.subject?.type ?? "", title: n.subject?.title ?? "",
      reason: REASONS[n.reason] ?? String(n.reason ?? "").replace(/_/g, " "),
      important: ["review_requested", "mention", "team_mention", "assign", "security_alert", "approval_requested"].includes(n.reason),
      unread: n.unread !== false, updated: n.updated_at ?? null, url: pageOf(n.subject, n.repository),
    };
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo).push(row);
  }
  const by = (a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? ""));
  return [...groups.entries()].map(([repo, rows]) => ({ repo, rows: rows.sort(by) }))
    .sort((a, b) => by(a.rows[0], b.rows[0]));
}

/** Leaves one notification out (after it's marked read). */
export const without = (groups, id) => groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.id !== id) })).filter((g) => g.rows.length);
