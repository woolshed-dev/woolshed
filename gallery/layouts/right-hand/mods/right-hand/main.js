// Right-hand: the head of the sidebar when it sits on the right. Woolshed's own
// head leaves room on its left for the macOS window buttons, which here sit
// over the tab bar instead, so this one starts at the edge: the app's name,
// search, another screen, and a button that puts the sidebar away
// (ctrl-shift-b, cmd-b on macOS, brings it back: see keys.json).

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, keys, openOverlay } from "woolshed";

// The key bound to bring the sidebar back, as the person has it, for the tooltip.
function toggleKey() {
  const k = keys().find((b) => b.section === "layout:right-hand" && b.action === "layout.toggle:side")
    ?? keys().find((b) => b.action === "layout.toggle:side");
  return k ? k.keys : null;
}

export default class RightHand extends View {
  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, icon, action, tip) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(action).tooltip(tip).child(svg(icon).size(15));
    const key = toggleKey();
    return h_flex().id("rh-brand").size_full().min_w(0).pl(14).pr(8).gap(4).items_center().bg(t.chrome)
      .border_b(1).border_color(t.border).text_size(13.5)
      .child(h_flex().flex_1().min_w(0).gap(8).items_center()
        .child(image("frame/welcome/woolshed.png").size(20).rounded(5).flex_none())
        .child(div().truncate().font_semibold().text_color(t.foreground).child("Woolshed")))
      .child(button("rh-search", "mods/workspace-chrome/search.svg", () => run("mod.open", { name: "picker" }), "Find a space, tab or agent"))
      .child(button("rh-screens", "mods/workspace-chrome/monitor.svg", () => run("window.new"), "Open on another screen (right-click: more)")
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 240, height: 260, props: { tab: "screens" } }); }))
      .child(button("rh-hide", "mods/workspace-chrome/panel-right.svg", () => run("layout.hide", { id: "side" }),
        key ? `Put the sidebar away (${key} brings it back)` : "Put the sidebar away"));
  }
}
