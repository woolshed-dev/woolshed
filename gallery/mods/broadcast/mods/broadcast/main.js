// Broadcast: write one message and send it to the agents you tick. Every
// idle (or finished) agent is ticked to start with; an agent asking you
// something can't be ticked, and nothing is typed until you press Send.
// Sending uses `hc send --if idle` (a finished agent: `hc send`, which still
// refuses one that's asking), and each agent's row says how it went.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { agents, hc, theme, props, closeOverlay, readTextFile, appHome } from "woolshed";
import { WORDS, alpha, what, plural } from "./words.js";
import { icon, mark, closeButton, button, link, stop } from "./ui.js";
import { sendArgs, outcome } from "./send.js";

const SPIN = "mods/broadcast/spinner.svg";
const CHECK = "mods/broadcast/check.svg";
const ready = (a) => a.status === "idle" || a.status === "done";

export default class Broadcast extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    // Ticks someone changed by hand: { address: true | false }. Untouched agents follow the default.
    this.picked = {};
    this.results = {};
    this.sending = false;
    this.text = TextareaState.new({ placeholder: "What to tell them, e.g. \"Run the tests and commit if they pass.\"", rows: 4 });
    // A new message starts a new round: the last results go.
    this.text.on("change", (_e, cx) => { if (!this.sending) this.results = {}; cx.notify(); });
    cx.timer.after(150, () => this.text.focus());
    // An optional example message (see RECIPE.md, Watch out): data/broadcast/example.json.
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${appHome()}/data/broadcast/example.json`);
        const draft = text ? JSON.parse(text)?.text : null;
        if (typeof draft === "string" && !this.text.value()) { this.text.set_value(draft); cx.notify(); }
      } catch {}
    });
  }

  ticked(a) {
    if (a.status === "blocked") return false;
    return this.picked[a.address] ?? ready(a);
  }

  toggle(a) {
    this.picked[a.address] = !this.ticked(a);
    delete this.results[a.address];
  }

  send(cx, to) {
    const text = this.text.value().trim();
    if (!text || !to.length || this.sending) return;
    this.sending = true;
    for (const a of to) this.results[a.address] = { state: "sending" };
    cx.spawn(async (cx) => {
      await Promise.all(to.map(async (a) => {
        // Read the status again at the moment of sending: it may have changed since the tick.
        const now = agents().find((x) => x.address === a.address) ?? a;
        const args = sendArgs(now, text);
        if (!args) { this.results[a.address] = outcome(now, null); return; }
        try {
          const r = await hc(args);
          this.results[a.address] = outcome(now, r);
        } catch (e) {
          this.results[a.address] = { state: "error", text: String(e.message ?? e).split("\n")[0] };
        }
        cx.notify();
      }));
      this.sending = false;
      cx.notify();
    });
    cx.notify();
  }

  row(t, a) {
    const on = this.ticked(a);
    const can = a.status !== "blocked";
    const r = this.results[a.address];
    const note = r
      ? r.state === "sending" ? div().text_color(t.dim).child("sending…")
        : div().max_w(170).truncate().text_color(r.state === "sent" ? t.done : r.state === "skipped" ? t.muted : t.blocked).child(r.text)
      : a.status === "blocked" ? div().text_color(t.blocked).child("asking you: answer it first")
        : a.status === "working" ? div().text_color(t.working).child("working: sent only if it has stopped")
          : div().text_color(t.dim).child(WORDS[a.status]);
    const box = div().size(16).flex_none().flex().items_center().justify_center().rounded(4).border(1.5)
      .border_color(on ? t.accent : can ? t.input ?? t.border : alpha(t.border, "66"))
      .when(on, (el) => el.bg(t.accent).child(svg(CHECK).size(11).text_color(t.accent_foreground)));
    return h_flex().id(`bc-${a.address}`).flex_none().mx(8).px(8).h(32).gap(9).items_center().rounded(7)
      .when(can, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (can && !this.sending) { this.toggle(a); cx.notify(); } })
      .child(box)
      .child(mark(t, a.status, SPIN, 11))
      .child(icon(a.program, 14, t.foreground))
      .child(h_flex().flex_1().min_w(0).gap(5)
        .child(div().flex_none().max_w(130).truncate().text_color(can ? t.foreground : t.dim).child(a.space_name || "space"))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${what(a)}`)))
      .child(div().flex_none().text_size(11.5).child(note));
  }

  render() {
    const t = theme();
    // Ready agents first, then working ones, then those asking you something.
    const rank = (a) => (ready(a) ? 0 : a.status === "working" ? 1 : 2);
    const list = [...agents()].sort((x, y) => rank(x) - rank(y));
    const to = list.filter((a) => this.ticked(a));
    const text = this.text.value().trim();
    const names = to.map((a) => a.space_name || "space");
    const preview = !list.length ? "No agents to send to."
      : !to.length ? "Tick the agents that should get it."
        : `Goes to ${plural(to.length, "agent")}: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` and ${names.length - 4} more` : ""}.`;
    const done = Object.values(this.results).filter((r) => r.state === "sent").length;
    const tried = Object.values(this.results).filter((r) => r.state !== "sending").length;
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(460) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(8).items_center()
        .child(div().flex_1().text_size(13).font_semibold().text_color(t.foreground).child("Broadcast"))
        .when(list.length > 1, (el) => el
          .child(link(t, "bc-all", "all ready", (_e, cx) => { this.picked = {}; for (const a of list) if (a.status !== "blocked") this.picked[a.address] = ready(a); cx.notify(); }, { tip: "Tick every idle or finished agent" }))
          .child(link(t, "bc-none", "none", (_e, cx) => { for (const a of list) this.picked[a.address] = false; cx.notify(); })))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "bc-close", () => closeOverlay(this.overlay)))))
      .child(div().flex_none().px(14).pb(8).on_mouse_down("left", stop)
        .child(Textarea.new(this.text).w_full().h(92).px(10).py(8).rounded(8).border(1).border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5)))
      .child(div().flex_none().px(16).pb(4).text_size(11).font_medium().text_color(t.dim).child("To"))
      .child(v_flex().id("bc-rows").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(300) : el.flex_1().min_h(0)))
        .when(!list.length, (el) => el.child(div().px(16).py(8).text_color(t.dim).child("No agents running. Start some, then broadcast to them here.")))
        .children(list.map((a) => this.row(t, a))))
      .child(h_flex().flex_none().mt(6).px(14).py(10).gap(10).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.dim)
          .child(this.sending ? "Sending…" : tried ? `Sent to ${done} of ${plural(tried, "agent")}.` : preview))
        .child(button(t, "bc-send", to.length ? `Send to ${to.length}` : "Send", (_e, cx) => this.send(cx, to), {
          primary: true, off: !text || !to.length || this.sending,
          tip: !text ? "Write a message first" : !to.length ? "Tick at least one agent" : "Pastes the message into each ticked agent and presses Enter",
        })));
  }
}
