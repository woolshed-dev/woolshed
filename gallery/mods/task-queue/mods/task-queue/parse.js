// The task queue file and the rule for when the next prompt may go. Pure
// functions: the data is { queues: [{ terminal, label, items: [{ id, text,
// state: "queued" | "sending" | "sent", at, sending_at?, sent_at?, error? }] }] }.

export function parse(text) {
  if (text === null || text === undefined || !String(text).trim()) return { queues: [] };
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.queues;
    if (!Array.isArray(list)) return null;
    return {
      queues: list.filter((q) => q && typeof q.terminal === "string").map((q) => ({
        terminal: q.terminal,
        label: String(q.label ?? q.terminal),
        items: (Array.isArray(q.items) ? q.items : []).filter((it) => it && typeof it.text === "string").map((it, i) => ({
          id: String(it.id ?? `q${i + 1}`),
          text: it.text,
          state: it.state === "sent" || it.state === "sending" ? it.state : "queued",
          at: Number(it.at) || 0,
          ...(it.sent_at ? { sent_at: Number(it.sent_at) } : {}),
          ...(it.sending_at ? { sending_at: Number(it.sending_at) } : {}),
          ...(it.error ? { error: String(it.error) } : {}),
        })),
      })),
    };
  } catch { return null; }
}

export const dump = (data) => JSON.stringify({ queues: data.queues.filter((q) => q.items.length) }, null, 2) + "\n";

export function queueOf(data, terminal) {
  return data.queues.find((q) => q.terminal === terminal) ?? null;
}

export function add(data, terminal, label, text, now, id) {
  const value = String(text ?? "").trim();
  if (!value) return data;
  let q = queueOf(data, terminal);
  if (!q) { q = { terminal, label, items: [] }; data.queues.push(q); }
  if (label) q.label = label;
  q.items.push({ id, text: value, state: "queued", at: now });
  return data;
}

export function remove(data, terminal, id) {
  const q = queueOf(data, terminal);
  if (q) q.items = q.items.filter((it) => it.id !== id || it.state === "sending");
  return data;
}

// Moves a queued prompt past the next queued one up or down.
export function move(data, terminal, id, dir) {
  const q = queueOf(data, terminal);
  if (!q) return data;
  const queued = q.items.filter((it) => it.state === "queued");
  const k = queued.findIndex((it) => it.id === id);
  const other = queued[k + (dir < 0 ? -1 : 1)];
  if (k < 0 || !other) return data;
  const a = q.items.indexOf(queued[k]);
  const b = q.items.indexOf(other);
  [q.items[a], q.items[b]] = [q.items[b], q.items[a]];
  return data;
}

export function clearSent(data, terminal) {
  const q = queueOf(data, terminal);
  if (q) q.items = q.items.filter((it) => it.state !== "sent");
  return data;
}

export function next(q) {
  return q?.items.find((it) => it.state === "queued") ?? null;
}

// Whether the next prompt may go now. Only to an agent that is idle (or done:
// finished while nobody looked), never one asking a question, and after a send
// only once the agent has visibly taken it up (worked, or a new turn started) or a
// long while has passed with nothing happening. `turn` is the core's count of
// the agent's turns (`hc get --json`).
export function gate({ status, sentAt, sawWorking, turnAtSend, turn, now, patience = 120000 }) {
  if (status === "blocked") return { ok: false, why: "asking you" };
  if (status === "working") return { ok: false, why: "working" };
  if (status !== "idle" && status !== "done") return { ok: false, why: "no status yet" };
  if (!sentAt) return { ok: true };
  if (sawWorking || (Number.isFinite(turnAtSend) && Number.isFinite(turn) && turn > turnAtSend) || now - sentAt >= patience) return { ok: true };
  return { ok: false, why: "taking the last one" };
}
