// How a broadcast reaches one agent, and how its answer reads. No imports.

// The hc arguments for sending `text` to agent `a`, or null when it mustn't get it.
// Idle: only while still idle (`--if idle`). Finished ("done": stopped while nobody
// looked): `hc send` refuses one that's asking on its own; `--if idle` would refuse
// it, because the core still calls it done. Working or asking: nothing is typed.
export function sendArgs(a, text) {
  if (a.status === "idle") return ["send", "--if", "idle", "--json", a.address, text];
  if (a.status === "done") return ["send", "--json", a.address, text];
  return null;
}

// A row's result from the agent and hc's answer (null: not sent by us).
export function outcome(a, r) {
  if (!r) return { state: "skipped", text: a.status === "blocked" ? "asking you: not sent" : "still working: not sent" };
  if (r.code === 0) return { state: "sent", text: "sent" };
  let err = null;
  try { err = JSON.parse(r.stdout || r.stderr)?.error ?? null; } catch {}
  if (err?.kind === "status_mismatch") return { state: "skipped", text: "busy again: not sent" };
  if (err?.kind === "blocked") return { state: "skipped", text: "asking you: not sent" };
  const line = (err?.message ?? (r.stderr || r.stdout || `hc send failed (${r.code})`)).trim().split("\n")[0];
  return { state: "error", text: line };
}
