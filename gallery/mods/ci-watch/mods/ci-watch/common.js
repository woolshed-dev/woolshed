// Pure helpers shared by the GitHub and GitLab mods: where a repo lives, what a
// tool's failure means, times and durations, and run states as plain words.
// No `woolshed` imports here, so it runs under any JavaScript runtime (tests).

/** Quotes a word for a POSIX shell. */
export const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** Printed before the tool runs, so a login shell's own chatter is left out. */
export const MARK = "@@woolshed-out@@";

/** The tool's output after the marker; `missing` when the shell found no such tool. */
export function afterMarker(stdout) {
  const text = String(stdout ?? "");
  const at = text.indexOf(MARK);
  if (at < 0) return { missing: false, text };
  const rest = text.slice(at + MARK.length);
  if (rest.startsWith("missing")) return { missing: true, text: "" };
  return { missing: false, text: rest.replace(/^\r?\n/, "") };
}

/** JSON from a tool's output, starting at its first `[` or `{` (null when there is none). */
export function json(text) {
  const s = String(text ?? "");
  const i = s.search(/[[{]/);
  if (i < 0) return null;
  return JSON.parse(s.slice(i));
}

/** A remote's address -> { kind: "github" | "gitlab" | null, host, path, owner, name, web }. */
export function parseRemote(url) {
  const m = String(url ?? "").trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const kind = host === "github.com" || host === "ssh.github.com" ? "github" : /(^|\.)gitlab\./.test(host) || host === "gitlab.com" ? "gitlab" : null;
  const path = m[2].replace(/^\/+/, "");
  const parts = path.split("/");
  const web = `https://${host === "ssh.github.com" ? "github.com" : host}/${path}`;
  return { kind, host: host === "ssh.github.com" ? "github.com" : host, path, owner: parts.slice(0, -1).join("/"), name: parts[parts.length - 1], web };
}

const TOOLS = {
  gh: { name: "GitHub", cli: "GitHub CLI", install: "Install gh (brew install gh, or cli.github.com) and run gh auth login.", login: "gh auth login" },
  glab: { name: "GitLab", cli: "GitLab CLI", install: "Install glab (brew install glab, or gitlab.com/gitlab-org/cli) and run glab auth login.", login: "glab auth login" },
};

/** What a tool's failure means, for people: { kind, message, hint }.
 *  kind: "missing" | "auth" | "network" | "notfound" | "forbidden" | "other". */
export function classify(tool, stderr, code = 1) {
  const t = TOOLS[tool] ?? { name: tool, cli: tool, install: `Install ${tool}.`, login: `${tool} auth login` };
  const err = String(stderr ?? "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim();
  const last = err.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "";
  if (code === 127 && !err) return { kind: "missing", message: `${t.cli} isn't installed.`, hint: t.install };
  if (/auth login|not logged in|no oauth token|authentication required|HTTP 401|Bad credentials|401 Unauthorized|not authenticated|token (has )?expired|invalid token|To get started with GitHub CLI|has not been authenticated/i.test(err))
    return { kind: "auth", message: `Not signed in to ${t.name}.`, hint: `Run ${t.login} in a terminal, or connect it in Settings → Accounts.` };
  if (/could not resolve|no such host|network is unreachable|dial tcp|i\/o timeout|connection refused|connection reset|TLS handshake|offline|ETIMEDOUT|ENOTFOUND/i.test(err))
    return { kind: "network", message: `Can't reach ${t.name}.`, hint: "Check the network; it tries again in a minute." };
  if (/rate limit/i.test(err)) return { kind: "forbidden", message: `${t.name}'s rate limit is used up.`, hint: "It tries again in a minute." };
  if (/HTTP 403|Resource not accessible|403 Forbidden|insufficient.?scope|requires? (the )?['"]?\w+['"]? scope/i.test(err))
    return { kind: "forbidden", message: `${t.name} refused: ${last || "not allowed"}`, hint: `Your sign-in may lack a scope: ${tool === "gh" ? "gh auth refresh -s <scope>" : "glab auth login"}.` };
  if (/HTTP 404|Not Found|could not find|no pull requests? found|404/i.test(err)) return { kind: "notfound", message: last || "Not found.", hint: "" };
  return { kind: "other", message: last || `${tool} failed (exit ${code}).`, hint: "" };
}

/** Milliseconds since the epoch from an ISO time (null when empty or the zero time gh uses). */
export function ms(iso) {
  if (!iso) return null;
  const n = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** "just now", "4m ago", "3h ago", "2d ago", "5mo ago". */
export function ago(iso, now = Date.now()) {
  const at = ms(iso);
  if (at === null) return "";
  const m = Math.floor(Math.max(0, now - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

/** "42s", "3m 05s", "1h 12m" between two times (end: now when absent). Empty without a start. */
export function duration(start, end, now = Date.now()) {
  const a = ms(start);
  if (a === null) return "";
  const b = ms(end) ?? now;
  const s = Math.max(0, Math.round((b - a) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** A run's, job's or check's state as one word: pass, fail, running, queued, cancelled, skipped, neutral.
 *  Takes GitHub's status/conclusion (any case), check buckets and GitLab's statuses. */
export function tone(status, conclusion) {
  const c = String(conclusion ?? "").toLowerCase();
  const s = String(status ?? "").toLowerCase();
  if (c) {
    if (["success", "pass"].includes(c)) return "pass";
    if (["failure", "fail", "error", "timed_out", "startup_failure", "action_required", "failed"].includes(c)) return "fail";
    if (["cancelled", "canceled", "cancel", "stale"].includes(c)) return "cancelled";
    if (["skipped", "skipping"].includes(c)) return "skipped";
    if (c === "neutral") return "neutral";
  }
  if (["success", "pass", "passed", "completed"].includes(s)) return s === "completed" ? "neutral" : "pass";
  if (["failure", "fail", "failed", "error"].includes(s)) return "fail";
  if (["cancelled", "canceled", "cancel"].includes(s)) return "cancelled";
  if (["skipped", "skipping", "manual"].includes(s)) return "skipped";
  if (["in_progress", "running", "pending"].includes(s)) return s === "pending" ? "queued" : "running";
  if (["queued", "requested", "waiting", "created", "waiting_for_resource", "preparing", "scheduled", "expected"].includes(s)) return "queued";
  return "neutral";
}

/** Words for a tone. */
export const TONE_WORDS = { pass: "passed", fail: "failed", running: "running", queued: "queued", cancelled: "cancelled", skipped: "skipped", neutral: "done" };

/** A space's folder as ~/… */
export function tidy(path, home) {
  if (!path) return "";
  if (!home) return path;
  return path === home ? "~" : path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

/** Plural: n("run", 2) -> "2 runs". */
export const n = (word, count, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** `git remote -v` -> the remote to use: `want`'s kind first (origin before others), else origin, else the first.
 *  Returns { ...parseRemote, remote: its name } or null when there are no remotes. */
export function pickRemote(text, want = null) {
  const seen = new Map();
  for (const line of String(text ?? "").split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(\S+)(?:\s+\((fetch|push)\))?$/);
    if (!m || seen.has(m[1])) continue;
    const r = parseRemote(m[2]);
    if (r) seen.set(m[1], { ...r, remote: m[1] });
  }
  const all = [...seen.values()];
  if (!all.length) return null;
  const origin = seen.get("origin");
  if (want) {
    if (origin?.kind === want) return origin;
    const match = all.find((r) => r.kind === want);
    if (match) return match;
  }
  return origin ?? all[0];
}
