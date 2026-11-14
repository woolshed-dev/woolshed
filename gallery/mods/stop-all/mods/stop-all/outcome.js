// What `hc interrupt --json` reported, in words. No imports.
// Outcomes: stopped (it left working), exited, still_working (no change in time),
// unknown (it doesn't report status).
export function parseInterrupt(r) {
  let j = null;
  try { j = JSON.parse(r.stdout); } catch {}
  if (r.code !== 0 || !j) {
    const msg = j?.error?.message ?? (r.stderr || r.stdout || `hc interrupt failed (${r.code})`);
    return { state: "error", text: String(msg).trim().split("\n")[0] };
  }
  switch (j.outcome) {
    case "stopped": return { state: "stopped", text: "stopped" };
    case "exited": return { state: "exited", text: "it exited" };
    case "still_working": return { state: "still", text: "still working" };
    default: return { state: "unknown", text: "stop key sent" };
  }
}
