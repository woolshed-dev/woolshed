// Presenter: a bar for sharing your screen. The space and the tab in large
// type, what the agent here is doing in words people can read from the back
// of the room, and a text-size control. It names no folders and no other
// spaces: other agents waiting on you show only as a count.
// Props: {} the bar, { role: "foot" } the spacer below the stage.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, panes, focused, run, theme, props, settings, window as appWindow } from "woolshed";

const SPIN = "mods/presenter/spinner.svg";
const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
const SAY = { blocked: "needs you", working: "is working", done: "is done", idle: "is waiting for a prompt" };

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")} min`;
}

export default class Presenter extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "bar";
    this.since = {};
    if (this.role === "bar") this.tick(cx);
  }

  // The clock moves on the minute; nothing else redraws on a timer.
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 40, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    const t = theme();
    if (this.role === "foot") return div().size_full();
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();
    const now = Date.now();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const f = focused();
    const list = agents();
    for (const a of list) if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };
    const here = list.filter((a) => a.tab === tab?.id)
      .sort((x, y) => Number(y.address === f?.terminal) - Number(x.address === f?.terminal) || RANK[x.status] - RANK[y.status]);
    const lead = here[0];
    const waiting = list.filter((a) => a.tab !== tab?.id && a.status === "blocked").length;
    const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
    const tabName = tab ? (tab.named ? tab.name : clean(pane?.title) || pane?.program?.name || `Tab ${tab.name}`) : "";
    const count = space?.tabs.length ?? 0;
    const zoom = Math.round(Number(settings()?.zoom ?? 1) * 100);
    const d = new Date();
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    const button = (id, label, action, tip) => div().id(id).h(34).min_w(34).px(10).flex_none().flex().items_center().justify_center().rounded(9)
      .text_size(15).text_color(t.muted).bg(t.raised).border(1).border_color(t.border).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action)
      .when(Boolean(tip), (el) => el.tooltip(tip)).child(label);
    const winButton = (id, label, command) => div().id(id).size(30).flex_none().flex().items_center().justify_center().rounded(8).text_size(15).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);

    const started = lead?.status === "working" ? tab?.working_since ?? this.since[lead.address]?.at : null;
    const pill = lead && h_flex().flex_none().h(36).px(14).gap(10).items_center().rounded(18).text_size(16)
      .bg(lead.status === "blocked" ? alpha(t.blocked, "22") : t.raised)
      .border(1).border_color(lead.status === "blocked" ? alpha(t.blocked, "66") : t.border)
      .child(lead.status === "working" ? svg(SPIN).size(16).flex_none().text_color(t.working).spin(1200)
        : lead.status === "idle" ? div().size(10).flex_none().rounded(5).border(2).border_color(t.dim)
          : div().size(10).flex_none().rounded(5).bg(t[lead.status] ?? t.dim))
      .child(div().text_color(lead.status === "blocked" ? t.blocked : t.foreground)
        .child(`${lead.program?.name ?? "The agent"} ${SAY[lead.status] ?? lead.status}`))
      .when(Boolean(started), (el) => el.child(div().text_color(t.dim).child(span(now - started))));

    // Narrow windows drop the clock, then the text size control, then the pill.
    const width = this.width ?? 1280;
    return h_flex().id("presenter-bar").size_full().min_w(0).pl(mac ? 96 : 24).pr(14).gap(18).items_center()
      .on_size_change((size, cx) => { if (Math.abs((this.width ?? 0) - size.width) > 4) { this.width = size.width; cx.notify(); } })
      .child(h_flex().flex_1().min_w(0).gap(14).items_center()
        .child(div().flex_none().max_w(420).truncate().text_size(26).font_semibold().text_color(t.foreground)
          .child(space ? space.name : "Woolshed"))
        .when(Boolean(tab), (el) => el
          .child(div().flex_none().text_size(24).text_color(t.dim).child("/"))
          .child(div().min_w(0).truncate().text_size(24).text_color(t.muted).child(tabName)))
        .when(count > 1, (el) => el.child(h_flex().flex_none().gap(6).items_center()
          .child(button("pr-prev", "‹", () => run("tab.prev"), "Previous tab"))
          .child(div().text_size(14).text_color(t.dim).child(`${tab?.index ?? 1} of ${count}`))
          .child(button("pr-next", "›", () => run("tab.next"), "Next tab"))))
        .when(!space, (el) => el.child(div().text_size(16).text_color(t.dim).child("Start an agent to begin"))))
      .when(Boolean(pill) && width >= 720, (el) => el.child(pill))
      .when(waiting > 0, (el) => el.child(h_flex().flex_none().gap(7).items_center().text_size(14).text_color(t.muted)
        .tooltip(`${waiting} other agent${waiting === 1 ? "" : "s"} waiting on you`)
        .child(div().size(9).rounded(5).bg(t.blocked)).child(String(waiting))))
      .when(width >= 900, (el) => el.child(h_flex().flex_none().gap(4).items_center()
        .child(button("pr-smaller", "A−", () => run("app.zoom_out"), "Smaller text"))
        .child(div().id("pr-zoom").w(52).flex().justify_center().text_size(14).text_color(t.dim).cursor_pointer()
          .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run("app.zoom_reset"))
          .tooltip("Back to 100%").child(`${zoom}%`))
        .child(button("pr-larger", "A+", () => run("app.zoom_in"), "Larger text"))))
      .when(width >= 1040, (el) => el.child(div().flex_none().text_size(16).text_color(t.muted).child(clock)))
      .when(Boolean(w?.buttons), (el) => el.child(h_flex().flex_none().gap(2)
        .child(winButton("pr-min", "–", "window.minimize"))
        .child(winButton("pr-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("pr-close", "✕", "window.close"))));
  }
}
