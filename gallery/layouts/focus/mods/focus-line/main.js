// Focus: one terminal and as little else as possible. A quiet title on top and
// a quiet line along the bottom: what you're in, the branch, the time, and
// (only when it's so) how many other agents wait on you, one click away.
// Props: { role: "top" } the title, { role: "line" } the status line.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, panes, focused, run, theme, props, window as appWindow } from "woolshed";

const SPIN = "mods/focus-line/spinner.svg";

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d`;
}

function here() {
  const f = focused();
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs.find((t) => t.active);
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  return { f, space, tab, pane };
}

export default class FocusLine extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "line";
    // When each agent entered its state, while this copy runs.
    this.since = {};
    if (this.role === "line") this.tick(cx);
  }

  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 40, (cx) => { cx.notify(); this.tick(cx); });
  }

  top(t) {
    const { space, tab, pane } = here();
    const w = appWindow();
    const stop = (_e, cx) => cx.stop_propagation();
    const name = tab ? (tab.named ? tab.name : clean(pane?.title) || pane?.program?.name || tab.name) : "";
    const title = space ? `${space.name}${name ? `  —  ${name}` : ""}` : "Woolshed";
    const winButton = (id, label, command) => div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(5).text_size(12).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    return h_flex().id("focus-top").size_full().relative().items_center().justify_center().text_size(12).text_color(t.dim)
      .child(div().max_w(560).truncate().child(title))
      .when(Boolean(w?.buttons), (el) => el.child(h_flex().absolute().top(5).right(8).gap(2)
        .child(winButton("focus-min", "–", "window.minimize"))
        .child(winButton("focus-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("focus-close", "✕", "window.close"))));
  }

  line(t) {
    const { f, tab, pane } = here();
    const list = agents();
    const now = Date.now();
    for (const a of list) if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };
    const mine = list.find((a) => a.address === f?.terminal);
    const others = list.filter((a) => a.address !== f?.terminal);
    const waiting = others.filter((a) => a.status === "blocked").sort((x, y) => (this.since[x.address]?.at ?? 0) - (this.since[y.address]?.at ?? 0));
    const working = others.filter((a) => a.status === "working").length;
    const d = new Date();
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const quiet = (text) => div().flex_none().text_color(t.dim).child(text);
    const started = mine?.status === "working" ? tab?.working_since ?? this.since[mine.address]?.at : this.since[mine?.address]?.at;
    return h_flex().id("focus-line").size_full().min_w(0).px(16).gap(14).items_center().text_size(11.5)
      .when(Boolean(mine), (el) => el.child(h_flex().flex_none().gap(6).items_center()
        .when(mine.status === "working", (el) => el.child(svg(SPIN).size(10).text_color(t.working).spin(1200)))
        .when(mine.status !== "working", (el) => el.child(div().size(6).rounded(3)
          .map((d) => (mine.status === "idle" ? d.border(1).border_color(t.dim) : d.bg(t[mine.status] ?? t.dim)))))
        .child(div().text_color(mine.status === "blocked" ? t.blocked : t.muted)
          .child(`${mine.program?.name ?? "agent"} ${mine.status === "blocked" ? "needs you" : mine.status}${started ? ` ${span(now - started)}` : ""}`))))
      .when(!mine && Boolean(pane), (el) => el.child(quiet(pane.program?.name ?? "terminal")))
      .when(Boolean(pane?.branch), (el) => el.child(quiet(`⎇ ${pane.branch}`)))
      .when((tab?.panes ?? 1) > 1, (el) => el.child(div().id("focus-zoom").flex_none().px(5).rounded(4).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => run("pane.zoom"))
        .child(tab.zoomed ? `${tab.panes} panes · unzoom` : `${tab.panes} panes · zoom`)))
      .child(div().flex_1())
      .when(waiting.length > 0, (el) => el.child(h_flex().id("focus-waiting").flex_none().gap(6).px(6).h(18).items_center().rounded(5).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click(() => run("pane.focus", { pane: waiting[0].pane }))
        .tooltip(`Go to ${waiting[0].space_name}`)
        .child(div().size(6).rounded(3).bg(t.blocked))
        .child(div().text_color(t.muted).child(`${waiting.length} waiting`))))
      .when(working > 0, (el) => el.child(quiet(`${working} working`)))
      .child(div().flex_none().text_color(t.muted).child(clock));
  }

  render() {
    const t = theme();
    return this.role === "top" ? this.top(t) : this.line(t);
  }
}
