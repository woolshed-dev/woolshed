// Review: for going through what agents did. The tab's panes (an agent and a
// shell beside it) on the left, the shipped Changes panel on the right, and
// this bar on top: the space and its branch, its tabs, "Next finished" to step
// through every agent that finished, and "Shell beside" for a second pane.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, panes, focused, run, theme, window as appWindow } from "woolshed";

const SPIN = "mods/review-bar/spinner.svg";

export default class ReviewBar extends View {
  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const list = agents();
    const finished = list.filter((a) => a.status === "done");
    const f = focused();
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action, strong = false, tip = "") => div().id(id).h(28).px(11).flex().flex_none().items_center().gap(6).rounded(7).text_size(12.5)
      .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.foreground).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).when(Boolean(tip), (el) => el.tooltip(tip)).child(label);
    const winButton = (id, label, command) => div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    const glyph = (st) => st === "working" ? svg(SPIN).size(11).flex_none().text_color(t.working).spin(900)
      : st ? div().size(7).flex_none().rounded(4).map((d) => (st === "idle" ? d.border(1.5).border_color(t.dim) : d.bg(t[st] ?? t.dim)))
      : null;
    const pill = (c) => {
      const name = c.named ? c.name : panes().find((p) => p.tab === c.id && p.program?.agent)?.program?.name ?? `Tab ${c.name}`;
      const g = glyph(c.status);
      return h_flex().id(`rv-tab-${c.id}`).h(28).px(10).gap(7).flex_none().items_center().rounded(7).text_size(12.5).cursor_pointer()
        .bg(c.active ? t.raised : t.chrome).border_1().border_color(c.active ? t.border : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(() => run("tab.select", { id: c.id }))
        .when(Boolean(g), (el) => el.child(g))
        .child(div().max_w(160).truncate().child(name));
    };
    // Looking at a finished agent makes it idle, so the next one is first again;
    // one you're already on is skipped.
    const next = () => {
      const a = finished.find((x) => x.address !== f?.terminal) ?? finished[0];
      if (a) run("pane.focus", { pane: a.pane });
    };
    return h_flex().id("review-bar").size_full().min_w(0).pl(mac ? 84 : 16).pr(10).gap(12).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(12.5)
      .child(h_flex().flex_none().gap(8).items_center()
        .child(div().font_semibold().text_size(14).text_color(t.foreground).child("Review"))
        .when(Boolean(space), (el) => el.child(div().max_w(180).truncate().text_color(t.muted).child(space.name)))
        .when(Boolean(space?.branch), (el) => el.child(h_flex().gap(5).items_center().text_color(t.dim)
          .child(svg("mods/review-bar/branch.svg").size(12)).child(div().max_w(180).truncate().child(space.branch)))))
      .child(div().w(1).h(18).flex_none().bg(t.border))
      .child(h_flex().id("rv-tabs").flex_1().min_w(0).gap(4).items_center().overflow_x_scroll().children((space?.tabs ?? []).map(pill)))
      .child(button("rv-next", finished.length ? `Next finished · ${finished.length}` : "Nothing finished", next, false,
        "Go to the next agent that finished while you were elsewhere"))
      .when((tab?.panes ?? 0) === 1 && Boolean(f?.pane), (el) => el.child(button("rv-shell", "+ Shell beside", () => run("pane.split", { direction: "right", pane: f.pane }), true,
        "Open a shell to the right of this pane, in its folder")))
      .when(Boolean(w?.buttons), (el) => el
        .child(winButton("rv-min", "–", "window.minimize"))
        .child(winButton("rv-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("rv-close", "✕", "window.close")));
  }
}
