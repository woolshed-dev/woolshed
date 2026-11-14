// Reads `kubectl get pods -o json` into rows the way `kubectl get pods`
// shows them (status, ready, restarts, age), and sorts out why kubectl failed. Pure.

/** → [{ name, status, tone, ready, total, restarts, age, node, containers }]. `now`: ms since the epoch. */
export function parsePods(text, now = Date.now()) {
  let doc;
  try { doc = JSON.parse(text ?? ""); } catch { return null; }
  const items = Array.isArray(doc?.items) ? doc.items : [];
  return items.map((p) => row(p, now)).sort((a, b) => rank(a.tone) - rank(b.tone) || a.name.localeCompare(b.name));
}

function row(p, now) {
  const st = p.status ?? {};
  const cs = st.containerStatuses ?? [];
  const total = (p.spec?.containers ?? []).length || cs.length;
  const ready = cs.filter((c) => c.ready).length;
  const restarts = cs.reduce((n, c) => n + (c.restartCount ?? 0), 0);
  const status = statusOf(p);
  return {
    name: p.metadata?.name ?? "?",
    status, tone: toneOf(status, ready, total),
    ready, total, restarts,
    age: p.metadata?.creationTimestamp ? age(now - Date.parse(p.metadata.creationTimestamp)) : "",
    node: p.spec?.nodeName ?? null,
    containers: (p.spec?.containers ?? []).map((c) => c.name),
  };
}

/** The STATUS column of `kubectl get pods`, close enough: a waiting or failed
 *  container's reason wins over the pod's phase; a pod being deleted is Terminating. */
export function statusOf(p) {
  const st = p.status ?? {};
  if (p.metadata?.deletionTimestamp) return "Terminating";
  let reason = st.reason || st.phase || "Unknown";
  for (const c of st.initContainerStatuses ?? []) {
    if (c.state?.terminated?.exitCode === 0) continue;
    if (c.state?.waiting?.reason && c.state.waiting.reason !== "PodInitializing") return `Init:${c.state.waiting.reason}`;
    if (c.state?.terminated) return `Init:${c.state.terminated.reason || "Error"}`;
    if (c.state?.running || c.state?.waiting) return "Init";
  }
  for (const c of st.containerStatuses ?? []) {
    if (c.state?.waiting?.reason) reason = c.state.waiting.reason;
    else if (c.state?.terminated && reason !== "Completed") reason = c.state.terminated.reason || (c.state.terminated.signal ? `Signal:${c.state.terminated.signal}` : `ExitCode:${c.state.terminated.exitCode}`);
  }
  return reason;
}

const BAD = /BackOff|Err|Error|OOMKilled|Failed|Evicted|Invalid|ExitCode|Signal|Unknown/;
const WAIT = /Pending|Creating|Init|Terminating|NotReady|Unschedulable/;

/** "ok" | "wait" | "bad" | "done". */
export function toneOf(status, ready, total) {
  if (status === "Completed" || status === "Succeeded") return "done";
  if (BAD.test(status)) return "bad";
  if (WAIT.test(status)) return "wait";
  if (status === "Running") return ready < total ? "wait" : "ok";
  return "wait";
}
const rank = (tone) => ({ bad: 0, wait: 1, ok: 2, done: 3 })[tone] ?? 4;

/** ms → "3d", "5h", "12m", "40s", as kubectl does. */
export function age(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 120) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 120) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Why kubectl didn't answer: "missing" | "nocontext" | "unreachable" | "forbidden" | null. */
export function failure(error, stderr) {
  if (/ENOENT|not found|No such file|cannot find/i.test(String(error ?? ""))) return "missing";
  const text = String(stderr ?? "");
  if (/current-context is not set|no context|context was not found|no configuration has been provided|invalid configuration/i.test(text)) return "nocontext";
  if (/forbidden|Unauthorized|You must be logged in/i.test(text)) return "forbidden";
  if (/Unable to connect|connection refused|i\/o timeout|no such host|dial tcp|context deadline exceeded|Client.Timeout|TLS handshake|was refused/i.test(text)) return "unreachable";
  return null;
}
