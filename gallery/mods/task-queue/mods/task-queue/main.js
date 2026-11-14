// Task queue: line up prompts for an agent and let them go one at a time.
// Nothing is sent until you press Start queue. Then, every 5 seconds, the
// next prompt goes to that agent with `hc send --if idle` (plain `hc send` when
// it finished while nobody looked), and only once it has taken up the last
// one; never to an agent asking you something. Pause stops it, and so does
// closing the window. The queues live in data/task-queue/queue.json under the
// app folder, so they're still there next time (paused).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { agents, focused, hc, notify, appHome, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay } from "woolshed";
import { parse, dump, add, remove, move, clearSent, next, gate, queueOf } from "./parse.js";

const dir = () => `${appHome()}/data/task-queue`;
const file = () => `${dir()}/queue.json`;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const WORDS = { working: "working", blocked: "asking you", done: "done", idle: "idle" };

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const labelOf = (a) => `${a.space_name} · ${a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : a.program?.name ?? "agent"}`;
const firstLine = (s) => { const l = s.split("\n").find((x) => x.trim()) ?? ""; return l.length < s.trim().length ? `${l} …` : l; };

export default class TaskQueue extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.data = null;
    this.error = null;
    this.note = null;
    this.target = null;
    this.running = new Set();
    this.watch = {};
    this.inflight = new Set();
    this.hover = null;
    this.composer = TextareaState.new({ placeholder: "A prompt for it to do next. Enter adds it to the queue; Shift-Enter for a new line.", rows: 3 });
    this.composer.on("submit", (e, cx) => { if (!e?.shift) this.queue(cx); });
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
      // Edits to the file (by hand or by an agent) show up here.
      for (;;) {
        try { await watchFolder(dir()); await this.load(); cx.notify(); }
        catch { await cx.sleep(15000); }
      }
    });
    cx.timer.every(5000, (cx) => this.tick(cx));
  }

  async load() {
    try {
      const text = await readTextFile(file());
      const data = parse(text);
      this.error = data === null ? "queue.json isn't valid JSON: fix it or delete it" : null;
      this.data = data ?? this.data ?? { queues: [] };
    } catch (e) { this.error = String(e.message ?? e); this.data = this.data ?? { queues: [] }; }
  }

  // Reads the file fresh, changes it, writes it only if nobody else did
  // meanwhile (else reads again, three times). `fn` returns false to change
  // nothing. Resolves true when the change was written.
  async change(fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await readTextFile(file());
        const data = parse(text);
        if (data === null) { this.error = "queue.json isn't valid JSON: fix it or delete it"; return false; }
        if (fn(data) === false) { this.data = data; return false; }
        await writeTextFile(file(), dump(data), text);
        this.data = data;
        this.error = null;
        return true;
      } catch (e) { if (attempt === 2) this.note = { bad: true, text: String(e.message ?? e) }; }
    }
    return false;
  }

  edit(fn, cx) { cx.spawn(async (cx) => { await this.change(fn); cx.notify(); }); }

  queue(cx) {
    const text = this.composer.value().trim();
    const a = this.targetAgent();
    if (!text) return;
    if (!a) { this.note = { bad: true, text: "Pick an agent to queue it for." }; cx.notify(); return; }
    this.composer.set_value("");
    const id = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    this.edit((d) => { add(d, a.address, labelOf(a), text, Date.now(), id); }, cx);
  }

  start(addr, cx) {
    this.running.add(addr);
    this.watch[addr] = {};
    this.note = null;
    this.tick(cx);
    cx.notify();
  }

  pause(addr, why) {
    this.running.delete(addr);
    delete this.watch[addr];
    if (why) this.note = why;
  }

  tick(cx) {
    if (this.ticking || !this.running.size) return;
    this.ticking = true;
    cx.spawn(async (cx) => {
      try { await this.step(); } catch (e) { this.note = { bad: true, text: String(e.message ?? e) }; }
      this.ticking = false;
      cx.notify();
    });
  }

  async step() {
    await this.load();
    const list = agents();
    for (const addr of [...this.running]) {
      const q = queueOf(this.data, addr);
      const st = (this.watch[addr] ??= {});
      const label = q?.label ?? addr;
      // A send this window never finished (it was closed mid-send): ask the person.
      const stuck = q?.items.find((it) => it.state === "sending" && !this.inflight.has(it.id) && Date.now() - (it.sending_at ?? 0) > 60000);
      if (stuck) {
        await this.change((d) => { const it = queueOf(d, addr)?.items.find((x) => x.id === stuck.id); if (!it) return false; it.state = "queued"; delete it.sending_at; it.error = "Not sure this one went: check the agent, then Start again."; });
        this.pause(addr, { bad: true, text: `Paused ${label}: one prompt may not have gone.` });
        continue;
      }
      const item = next(q);
      if (!item) {
        this.pause(addr, { bad: false, text: `Queue done for ${label}.` });
        notify({ title: "Queue done", body: label, level: "success", timeout: 8000 });
        continue;
      }
      const a = list.find((x) => x.address === addr);
      if (!a) { this.pause(addr, { bad: true, text: `Paused: ${label} isn't running.` }); continue; }
      if (a.status === "working") { st.sawWorking = true; st.why = "working"; continue; }
      if (a.status === "blocked") { st.why = "asking you"; continue; }
      // Idle or done here: ask the core, which also knows its turns.
      let info = null;
      try { info = JSON.parse((await hc(["get", addr, "--json"])).stdout); } catch {}
      if (!info || info.error || info.state !== "live") { this.pause(addr, { bad: true, text: `Paused: ${label} has ended.` }); continue; }
      const word = info.status?.state;
      const g = gate({ status: word, sentAt: st.sentAt, sawWorking: st.sawWorking, turnAtSend: st.turnAtSend, turn: Number(info.turn), now: Date.now() });
      if (!g.ok) { st.why = g.why; continue; }
      await this.send(addr, item, word, Number(info.turn), st, label);
    }
  }

  async send(addr, item, word, turn, st, label) {
    // Claim it in the file first, so two open copies never send it twice.
    const claimed = await this.change((d) => {
      const it = queueOf(d, addr)?.items.find((x) => x.id === item.id);
      if (!it || it.state !== "queued") return false;
      it.state = "sending";
      it.sending_at = Date.now();
      delete it.error;
    });
    if (!claimed) return;
    this.inflight.add(item.id);
    let ok = false, why = null;
    try {
      // `--if idle` refuses if it started working or hit a question since the look above.
      const r = await hc(["send", "--json", ...(word === "idle" ? ["--if", "idle"] : []), addr, item.text]);
      ok = r.code === 0;
      if (!ok) {
        let msg = null;
        try { msg = JSON.parse(r.stdout || r.stderr)?.error?.message; } catch {}
        why = msg ?? (r.stderr || r.stdout || "hc send failed").trim().split("\n")[0];
      }
    } catch (e) { why = String(e.message ?? e); }
    const now = Date.now();
    await this.change((d) => {
      const it = queueOf(d, addr)?.items.find((x) => x.id === item.id);
      if (!it) return false;
      delete it.sending_at;
      if (ok) { it.state = "sent"; it.sent_at = now; delete it.error; }
      else { it.state = "queued"; it.error = why; }
    });
    this.inflight.delete(item.id);
    if (ok) Object.assign(st, { sentAt: now, sawWorking: false, turnAtSend: turn, fails: 0, why: "sent" });
    else {
      st.fails = (st.fails ?? 0) + 1;
      if (st.fails >= 3) this.pause(addr, { bad: true, text: `Paused ${label}: ${why}` });
    }
  }

  targetAgent() {
    const list = agents();
    if (this.target) { const a = list.find((x) => x.address === this.target); if (a) return a; }
    const f = focused();
    return list.find((x) => x.address === (f?.agent ?? f?.terminal)) ?? list[0] ?? null;
  }

  small(t, id, label, tip, action) {
    return div().id(id).size(20).flex_none().flex().items_center().justify_center().rounded(5).text_size(11.5).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action).tooltip(tip).child(label);
  }

  item(t, q, it, n, running) {
    const key = `${q.terminal}:${it.id}`;
    const hover = this.hover === key;
    const id = `tq-${q.terminal.replace(/[^A-Za-z0-9]/g, "_")}-${it.id}`;
    const nextUp = it.state === "queued" && next(q)?.id === it.id;
    const state = it.state === "sent" ? div().flex_none().text_size(11).text_color(t.done).child(`sent ${clock(it.sent_at ?? it.at)}`)
      : it.state === "sending" ? div().flex_none().text_size(11).text_color(t.working).child("sending…")
      : nextUp && running ? div().flex_none().text_size(11).text_color(t.accent).child("next") : null;
    return v_flex().id(id).flex_none().px(8).py(5).gap(2).rounded(6).hover((s) => s.bg(t.hover)).tooltip(it.text)
      .on_hover((h, cx) => { if (h || hover) { this.hover = h ? key : null; cx.notify(); } })
      .child(h_flex().gap(8).items_center()
        .child(div().w(16).flex_none().text_size(11).text_color(t.dim).child(`${n}.`))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(it.state === "sent" ? t.dim : t.foreground).child(firstLine(it.text)))
        .when(Boolean(state) && !(hover && it.state === "queued"), (el) => el.child(state))
        .when(hover && it.state === "queued", (el) => el
          .child(this.small(t, `${id}-up`, "↑", "Move up", (_e, cx) => this.edit((d) => { move(d, q.terminal, it.id, -1); }, cx)))
          .child(this.small(t, `${id}-down`, "↓", "Move down", (_e, cx) => this.edit((d) => { move(d, q.terminal, it.id, 1); }, cx)))
          .child(this.small(t, `${id}-del`, "✕", "Remove", (_e, cx) => this.edit((d) => { remove(d, q.terminal, it.id); }, cx)))))
      .when(Boolean(it.error), (el) => el.child(div().pl(24).text_size(11).text_color(t.blocked).child(it.error)));
  }

  card(t, q, a) {
    const stop = (_e, cx) => cx.stop_propagation();
    const running = this.running.has(q.terminal);
    const queued = q.items.filter((it) => it.state === "queued").length;
    const sent = q.items.filter((it) => it.state === "sent").length;
    const why = this.watch[q.terminal]?.why;
    const status = a?.status;
    const line = !a ? "Not running"
      : running ? (why === "asking you" ? "Waiting: it's asking you something" : why === "working" || why === "taking the last one" ? "Sends the next one when it's done" : "Sends the next one now")
      : queued ? `${queued} queued · paused` : "Nothing queued";
    const canStart = Boolean(a) && queued > 0;
    const sid = q.terminal.replace(/[^A-Za-z0-9]/g, "_");
    return v_flex().flex_none().mx(10).p(8).gap(4).rounded(9).border_1().border_color(running ? alpha(t.accent, "88") : t.border).bg(t.background)
      .child(h_flex().gap(8).items_center().px(2)
        .child(icon(a?.program, 15, t.foreground))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().truncate().font_semibold().text_color(a ? t.foreground : t.dim).child(q.label))
            .when(Boolean(status), (el) => el.child(div().flex_none().text_size(11).text_color(t[status] ?? t.dim).child(WORDS[status] ?? status))))
          .child(div().truncate().text_size(11).text_color(running ? t.accent : t.dim).child(line)))
        .when(sent > 0 && !running, (el) => el.child(div().id(`tq-clear-${sid}`).px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.edit((d) => { clearSent(d, q.terminal); }, cx)).child(`Clear sent (${sent})`)))
        .child(div().id(`tq-go-${sid}`).flex_none().h(26).px(12).flex().items_center().rounded(6).text_size(12)
          .map((el) => (running ? el.bg(t.raised).text_color(t.foreground) : canStart ? el.bg(t.solid).text_color(t.solid_foreground) : el.bg(t.raised).text_color(t.dim)))
          .when(running || canStart, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { if (running) { this.pause(q.terminal); cx.notify(); } else if (canStart) this.start(q.terminal, cx); })
          .child(running ? "Pause" : "Start queue")))
      .children(q.items.map((it, i) => this.item(t, q, it, i + 1, running)));
  }

  render(cx) {
    const t = theme();
    const list = agents();
    const target = this.targetAgent();
    const stop = (_e, cx) => cx.stop_propagation();
    const queues = (this.data?.queues ?? []).filter((q) => q.items.length);
    const live = (q) => list.find((a) => a.address === q.terminal) ?? null;
    const order = (q) => { const i = list.findIndex((a) => a.address === q.terminal); return i < 0 ? 1e6 : i; };
    queues.sort((a, b) => order(a) - order(b));
    const chip = (a) => div().id(`tq-to-${a.address.replace(/[^A-Za-z0-9]/g, "_")}`).flex_none().h(24).px(8).flex().items_center().gap(5).rounded(6).cursor_pointer().text_size(11.5)
      .map((el) => (target?.address === a.address ? el.bg(t.selected).text_color(t.foreground) : el.text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.target = a.address; cx.notify(); })
      .tooltip(`${labelOf(a)}: ${WORDS[a.status] ?? a.status}`)
      .child(div().size(6).flex_none().rounded(3).bg(t[a.status] ?? t.dim))
      .child(div().max_w(150).truncate().child(labelOf(a)));
    return v_flex().id("task-queue").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(430) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Task queue"))
        .when(this.running.size > 0, (el) => el.child(div().text_size(11).text_color(t.accent).child(`${this.running.size} running`)))
        .when(Boolean(this.overlay), (el) => el.child(div().id("tq-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(v_flex().flex_none().px(12).pb(10).gap(6).on_mouse_down("left", stop)
        .when(!list.length, (el) => el.child(div().px(4).text_color(t.dim).child("No agents running. Start one, then queue prompts for it here.")))
        .when(list.length > 0, (el) => el
          .child(h_flex().gap(4).items_center().flex_wrap()
            .child(div().flex_none().pr(2).text_size(11.5).text_color(t.dim).child("For"))
            .children(list.map(chip)))
          .child(Textarea.new(this.composer).w_full().h(64).px(10).py(7).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5))
          .child(h_flex().gap(6).items_center()
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(target?.status === "blocked" ? t.blocked : t.dim)
              .child(target ? (target.status === "blocked" ? `${labelOf(target)} is asking you something: answer it first.` : `Queues for ${labelOf(target)}`) : ""))
            .child(div().id("tq-add").flex_none().h(26).px(12).flex().items_center().rounded(6).text_size(12).cursor_pointer()
              .bg(t.raised).text_color(t.foreground).hover((s) => s.opacity(0.85))
              .on_click((_e, cx) => this.queue(cx)).child("Add to queue")))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).pb(6).text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("tq-queues").pb(10).gap(8).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(400) : el.flex_1().min_h(0)))
        .when(this.data === null, (el) => el.child(div().px(16).text_color(t.dim).child("Loading…")))
        .when(this.data !== null && !queues.length && list.length > 0, (el) => el.child(div().px(16).text_size(12).text_color(t.dim)
          .child("Nothing queued. Write a prompt above and add it; Start queue sends them one by one as the agent finishes each.")))
        .children(queues.map((q) => this.card(t, q, live(q)))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : t.dim)
        .child(this.note?.text ?? "Nothing is sent until you press Start queue, and never to an agent asking you something."));
  }
}
