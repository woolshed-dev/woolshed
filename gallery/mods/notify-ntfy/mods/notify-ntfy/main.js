// Phone alerts through ntfy (https://ntfy.sh, or a server you run): when an
// agent needs you or finishes, a push goes to a topic you choose. Off until you
// turn it on and give it a topic. What it sends: the agent's program, space
// and tab names, and what happened. Never terminal text, folders or files.
// Anyone who knows the topic can read it: keep it long and random.
// It only watches while a copy runs: keep its window open (it comes back on the
// next start) or give it a block in a layout.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, shared, setShared, window as appWindow, theme, props, closeOverlay, openOverlay } from "woolshed";

const NAME = "notify-ntfy";
const KEY = "notify-ntfy";
const SEEN = "notify-ntfy.seen";
const DEFAULTS = { on: false, server: "https://ntfy.sh", topic: "", blocked: true, done: true, away: true };
// Pushes go out at most this often; what happened meanwhile goes in one message.
const FLUSH_EVERY = 4000;

function settings() { return { ...DEFAULTS, ...(shared(KEY) ?? {}) }; }
const kind = (s) => (s === "blocked" ? "blocked" : s === "done" ? "done" : "other");
const what = (a) => (a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : a.program?.name ?? "agent");

function randomTopic() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 22; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return `woolshed-${s}`;
}

// The ntfy JSON message for what happened (several at once read as one).
export function message(events) {
  const lines = events.slice(0, 6).map((e) => `${e.space} · ${e.what} (${e.kind === "blocked" ? "needs you" : "finished"})`);
  if (events.length > 6) lines.push(`and ${events.length - 6} more`);
  const asks = events.filter((e) => e.kind === "blocked").length;
  if (events.length === 1) {
    const e = events[0];
    return { title: `${e.program} ${e.kind === "blocked" ? "needs you" : "finished"}`, message: `${e.space} · ${e.what}`,
      tags: [e.kind === "blocked" ? "warning" : "white_check_mark"], priority: e.kind === "blocked" ? 4 : 3 };
  }
  const done = events.length - asks;
  const title = asks && done ? `${asks} need${asks === 1 ? "s" : ""} you, ${done} finished` : asks ? `${asks} agents need you` : `${done} agents finished`;
  return { title, message: lines.join("\n"), tags: [asks ? "warning" : "white_check_mark"], priority: asks ? 4 : 3 };
}

export default class NotifyNtfy extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.queue = [];
    this.last = null;
    this.error = null;
    this.sending = false;
    const s = settings();
    this.server = InputState.new({ value: s.server, placeholder: "https://ntfy.sh" });
    this.topic = InputState.new({ value: s.topic, placeholder: "a long, random topic name" });
    for (const [field, input] of [["server", this.server], ["topic", this.topic]]) {
      input.on("change", (_e, cx) => this.later(field, input.value().trim(), cx));
      input.on("blur", (_e, cx) => this.keep(field, input.value().trim()));
    }
    cx.timer.every(FLUSH_EVERY, (cx) => this.flush(cx));
  }

  set(patch) { setShared(KEY, { ...settings(), ...patch }); }
  keep(field, value) { if (settings()[field] !== value) this.set({ [field]: value }); }
  // Typing saves after a pause, not on every key (a shared write redraws every mod).
  later(field, value, cx) {
    this.pending?.cancel();
    this.pending = cx.timer.after(700, () => this.keep(field, value));
  }

  // Compares each agent with what was last seen (shared, so two copies send once).
  watch(s) {
    const list = agents();
    const seen = shared(SEEN);
    const now = Object.fromEntries(list.map((a) => [a.address, kind(a.status)]));
    if (!seen || typeof seen !== "object") { setShared(SEEN, now); return; }
    const events = [];
    let changed = Object.keys(seen).some((k) => !(k in now));
    for (const a of list) {
      const was = seen[a.address];
      const is = now[a.address];
      if (was === is) continue;
      changed = true;
      // An agent seen for the first time in a state was in it before we looked.
      if (was === undefined) continue;
      if ((is === "blocked" && s.blocked) || (is === "done" && s.done)) {
        events.push({ kind: is, program: a.program?.name ?? "Agent", space: a.space_name || "space", what: what(a) });
      }
    }
    if (changed) setShared(SEEN, now);
    const away = !s.away || appWindow()?.active === false;
    if (s.on && s.topic && away) this.queue.push(...events);
  }

  flush(cx, test = false) {
    const s = settings();
    if (this.sending || (!test && !this.queue.length)) return;
    if (!s.topic) { this.error = "Set a topic first."; this.queue = []; cx.notify(); return; }
    const events = test ? [] : this.queue.splice(0);
    const body = test
      ? { title: "Woolshed test", message: "Alerts from Woolshed will look like this.", tags: ["bell"], priority: 3 }
      : message(events);
    const server = (s.server || DEFAULTS.server).replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s/]+/.test(server)) { this.error = "The server must start with https://"; cx.notify(); return; }
    this.sending = true;
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(server, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: s.topic, ...body }) });
        if (r.ok) { this.last = { at: Date.now(), title: body.title }; this.error = null; }
        else this.error = `${server} answered ${r.status}`;
      } catch (e) { this.error = String(e.message ?? e); }
      this.sending = false;
      cx.notify();
    });
  }

  toggle(t, id, on, label, action) {
    return h_flex().id(id).gap(8).items_center().cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(div().w(30).h(17).flex_none().rounded(9).p(2).bg(on ? t.accent : t.raised).border_1().border_color(on ? t.accent : t.input)
        .child(div().size(11).rounded(6).bg(on ? t.accent_foreground : t.muted).when(on, (el) => el.ml(13))))
      .child(div().text_color(on ? t.foreground : t.muted).child(label));
  }

  panel(t, s) {
    const stop = (_e, cx) => cx.stop_propagation();
    const field = (el) => el.w_full().h(30).px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5);
    const label = (text) => div().text_size(11.5).text_color(t.dim).child(text);
    const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    return v_flex().gap(10).on_mouse_down("left", stop)
      .child(this.toggle(t, "nt-on", s.on, s.on ? "Sending alerts" : "Alerts are off", () => this.set({ on: !s.on })))
      .child(v_flex().gap(5).child(label("Server")).child(field(Input.new(this.server))))
      .child(v_flex().gap(5)
        .child(h_flex().items_center().child(div().flex_1().child(label("Topic: anyone who knows it can read your alerts")))
          .child(div().id("nt-random").px(6).py(1).rounded(5).text_size(11).text_color(t.muted).cursor_pointer()
            .hover((el) => el.bg(t.hover).text_color(t.foreground))
            .on_click(() => { const topic = randomTopic(); this.topic.set_value(topic); this.set({ topic }); })
            .child("random")))
        .child(field(Input.new(this.topic))))
      .child(v_flex().gap(7)
        .child(this.toggle(t, "nt-blocked", s.blocked, "When an agent needs you", () => this.set({ blocked: !s.blocked })))
        .child(this.toggle(t, "nt-done", s.done, "When an agent finishes", () => this.set({ done: !s.done })))
        .child(this.toggle(t, "nt-away", s.away, "Only while Woolshed isn't the active window", () => this.set({ away: !s.away }))))
      .child(div().text_size(11.5).text_color(t.dim).child("Sends the program, space and tab names and what happened. Never terminal text, folders or files."))
      .child(h_flex().gap(8).items_center()
        .child(div().id("nt-test").h(26).px(12).flex().items_center().rounded(6).bg(t.raised).text_color(t.foreground).cursor_pointer()
          .hover((el) => el.opacity(0.85)).on_click((_e, cx) => this.flush(cx, true)).child(this.sending ? "Sending…" : "Send a test"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(this.error ? t.blocked : t.dim)
          .child(this.error ?? (this.last ? `Last sent ${clock(this.last.at)}: ${this.last.title}` : s.topic ? "Nothing sent yet" : "Pick a topic, then subscribe to it in the ntfy app"))));
  }

  render() {
    const t = theme();
    const s = settings();
    this.watch(s);
    const stop = (_e, cx) => cx.stop_propagation();
    if (this.overlay) {
      return v_flex().id("notify-ntfy").w(360).p(16).pt(10).gap(12).bg(t.popover).text_size(12.5)
        .child(h_flex().items_center()
          .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Phone alerts (ntfy)"))
          .child(div().id("nt-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
            .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
            .on_click(() => closeOverlay(this.overlay)).child("✕")))
        .child(this.panel(t, s));
    }
    // In a block: the whole panel when there's room, else a chip that opens it.
    return div().id("notify-ntfy").size_full().min_w(0).bg(t.chrome).text_size(12.5)
      .on_size_change((size, cx) => { const roomy = size.height > 300; if (roomy !== this.roomy) { this.roomy = roomy; cx.notify(); } })
      .when(this.roomy, (el) => el.p(14).child(this.panel(t, s)))
      .when(!this.roomy, (el) => el.px(10).flex().items_center().gap(7).cursor_pointer().hover((st) => st.bg(t.hover))
        .on_click(() => openOverlay({ mod: NAME, kind: "window", key: NAME, keep: true }))
        .child(div().size(7).flex_none().rounded(4).bg(s.on && s.topic ? t.done : t.dim))
        .child(div().truncate().text_color(s.on && s.topic ? t.muted : t.dim).child(s.on && s.topic ? `Phone alerts on · ${s.topic}` : "Phone alerts off")));
  }
}
