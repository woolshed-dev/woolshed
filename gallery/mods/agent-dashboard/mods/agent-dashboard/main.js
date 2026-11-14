// Agent dashboard: four big counts (working, needs you, done, idle) as tiles in
// the status colors, and below them every agent with its space, tab, program
// and how long it has been in that state. Click a tile to show only those;
// click an agent to go to it. A window (mod.open agent-dashboard), or a panel
// in a layout block.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, run, theme, props, closeOverlay, setAgentOrder } from "woolshed";
import { WORDS, ORDER, alpha, what, span, stamp, plural } from "./words.js";
import { icon, mark, closeButton, stop } from "./ui.js";

const SPIN = "mods/agent-dashboard/spinner.svg";
const TILES = [
  { s: "working", label: "Working" },
  { s: "blocked", label: "Needs you" },
  { s: "done", label: "Done" },
  { s: "idle", label: "Idle" },
];

export default class AgentDashboard extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.filter = null;
    this.width = this.overlay ? 560 : 400;
    try { this.since = JSON.parse(localStorage.getItem("since") ?? "{}"); } catch { this.since = {}; }
    // Times show minutes: redraw twice a minute, not more.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  track(list, now) {
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t]));
    if (stamp(this.since, list, now, (a) => tabs.get(a.tab)?.working_since)) {
      try { localStorage.setItem("since", JSON.stringify(this.since)); } catch {}
    }
  }

  tile(t, s, label, n, narrow) {
    const color = t[s];
    const on = this.filter === s;
    return v_flex().id(`ad-tile-${s}`).flex_1().min_w(narrow ? 120 : 0).h(narrow ? 62 : 78).px(14).justify_center().gap(2)
      .rounded(10).border(1).cursor_pointer()
      .bg(alpha(color, on ? "2e" : n ? "17" : "08"))
      .border_color(alpha(color, on ? "cc" : n ? "40" : "1c"))
      .hover((el) => el.bg(alpha(color, "26")))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.filter = on ? null : s; cx.notify(); })
      .tooltip(on ? "Show every agent" : `Show only ${label.toLowerCase()}`)
      .child(div().text_size(narrow ? 24 : 30).font_semibold().text_color(n ? color : alpha(color, "66")).child(String(n)))
      .child(div().text_size(12).text_color(n ? t.foreground : t.dim).child(label));
  }

  row(t, a, now) {
    const at = this.since[a.address]?.at ?? now;
    const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
    const color = a.status === "idle" ? t.muted : t[a.status];
    return h_flex().id(`ad-${a.address}`).flex_none().mx(8).px(10).h(36).gap(10).items_center().rounded(8).cursor_pointer()
      .when(a.focused, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .tooltip(`${a.space_name} · ${what(a)} · ${a.program?.name ?? "agent"}`)
      .child(mark(t, a.status, SPIN))
      .child(icon(a.program, 15, t.foreground))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().flex_none().max_w(170).truncate().font_medium().text_color(a.status === "idle" ? t.muted : t.foreground).child(a.space_name || "space"))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${what(a)}`))
        .when(Boolean(machine), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(machine))))
      .when(this.width >= 380, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(a.program?.name ?? "")))
      .child(h_flex().flex_none().w(this.width >= 380 ? 112 : 84).justify_end().gap(5).text_size(12)
        .child(div().text_color(color).child(WORDS[a.status]))
        .child(div().font_semibold().text_color(a.status === "blocked" ? t.blocked : t.foreground).child(span(now - at))));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const list = agents();
    this.track(list, now);
    const count = { working: 0, blocked: 0, done: 0, idle: 0 };
    for (const a of list) count[a.status] = (count[a.status] ?? 0) + 1;
    const at = (a) => this.since[a.address]?.at ?? now;
    // Needs you first, then working, done, idle; the longest in a state first, pinned on top.
    const sorted = [...list].sort((x, y) => (y.pinned - x.pinned) || (ORDER[x.status] - ORDER[y.status]) || (at(x) - at(y)));
    setAgentOrder(sorted.map((a) => a.address));
    const shown = this.filter ? sorted.filter((a) => a.status === this.filter) : sorted;
    const narrow = this.width < 440;
    const summary = list.length ? plural(list.length, "agent") + (this.filter ? ` · showing ${WORDS[this.filter]}` : "") : "";
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 4) { this.width = size.width; cx.notify(); } })
      .map((el) => (this.overlay ? el.w(560) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(8).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Agents"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(summary))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "ad-close", () => closeOverlay(this.overlay)))))
      .child(h_flex().flex_none().px(14).pb(12).gap(8).when(narrow, (el) => el.flex_wrap())
        .children(TILES.map(({ s, label }) => this.tile(t, s, label, count[s], narrow))))
      .child(div().flex_none().h(1).bg(t.border))
      .child(v_flex().id("ad-rows").py(6).gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(400) : el.flex_1().min_h(0)))
        .when(!list.length, (el) => el.child(v_flex().px(16).py(14).gap(4)
          .child(div().text_color(t.foreground).child("No agents yet"))
          .child(div().text_size(12).text_color(t.dim).child("Start one from the + in the tab bar; it shows up here as soon as it reports."))))
        .when(list.length > 0 && !shown.length, (el) => el.child(div().px(16).py(12).text_color(t.dim)
          .child(`No agent is ${WORDS[this.filter]} right now. Click the tile again to see all.`)))
        .children(shown.map((a) => this.row(t, a, now))));
  }
}
