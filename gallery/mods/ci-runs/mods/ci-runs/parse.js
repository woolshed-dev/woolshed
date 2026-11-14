// Reads `gh run list --json …` into rows the window draws.

import { json, tone, duration } from "./common.js";

export const RUN_FIELDS = "databaseId,number,attempt,workflowName,displayTitle,headBranch,event,status,conclusion,createdAt,startedAt,updatedAt,url";

const EVENTS = { push: "push", pull_request: "pull request", pull_request_target: "pull request", workflow_dispatch: "manual", schedule: "scheduled", release: "release", merge_group: "merge queue", workflow_run: "after a workflow", issue_comment: "comment", repository_dispatch: "dispatch" };

/** gh's runs -> { id, number, attempt, workflow, title, branch, event, tone, url, started, ended, took }. */
export function parseRuns(text, now = Date.now()) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((r) => {
    const tn = tone(r.status, r.status === "completed" ? r.conclusion : "");
    const started = r.startedAt || r.createdAt || null;
    const ended = r.status === "completed" ? r.updatedAt || null : null;
    return {
      id: r.databaseId, number: r.number, attempt: r.attempt ?? 1,
      workflow: r.workflowName || r.name || "workflow", title: r.displayTitle ?? "",
      branch: r.headBranch ?? "", event: EVENTS[r.event] ?? String(r.event ?? "").replace(/_/g, " "),
      tone: tn, url: r.url, started, ended,
      took: tn === "queued" ? "" : duration(started, ended, now),
    };
  });
}

/** "15 runs · 2 failed · 1 running". */
export function summary(runs) {
  const failed = runs.filter((r) => r.tone === "fail").length;
  const running = runs.filter((r) => r.tone === "running" || r.tone === "queued").length;
  const parts = [`${runs.length} run${runs.length === 1 ? "" : "s"}`];
  if (failed) parts.push(`${failed} failed`);
  if (running) parts.push(`${running} running`);
  return parts.join(" · ");
}
