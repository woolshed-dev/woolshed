// Small pieces every view here draws the same way.

import { div, svg, image } from "gpui-kit";
import { alpha } from "./words.js";

const stop = (_e, cx) => cx.stop_propagation();

// The program's icon: a one-color glyph tinted, else the picture itself.
export function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// A status mark: a spinner while working, a dot when it needs you or is done, a ring when idle.
export function mark(t, status, spinner, size = 12) {
  if (status === "working") return svg(spinner).size(size).flex_none().text_color(t.working).spin(900);
  const dot = div().size(size - 4).mx(2).flex_none().rounded(size);
  if (status === "blocked") return dot.bg(t.blocked);
  if (status === "done") return dot.bg(t.done);
  return dot.border(1.5).border_color(t.idle ?? t.dim);
}

// A window's ✕.
export function closeButton(t, id, onClick) {
  return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_mouse_down("left", stop).on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); }).child("✕");
}

// A 26 px button: solid for the main action, raised otherwise, dim when off.
export function button(t, id, label, onClick, { primary = false, off = false, color = null, tip = null } = {}) {
  const bg = off ? t.raised : primary ? (color ?? t.solid) : t.raised;
  const fg = off ? t.dim : primary ? (color ? t.background : t.solid_foreground) : (color ?? t.foreground);
  return div().id(id).h(26).px(11).flex_none().flex().items_center().justify_center().rounded(6).text_size(12)
    .bg(bg).text_color(fg)
    .when(!off, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .on_mouse_down("left", stop)
    .on_click((e, cx) => { cx.stop_propagation(); if (!off) onClick(e, cx); })
    .child(label);
}

// A small text link, for settings and secondary actions.
export function link(t, id, label, onClick, { color = null, tip = null } = {}) {
  return div().id(id).px(6).py(2).flex_none().rounded(5).cursor_pointer().text_color(color ?? t.muted)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .on_mouse_down("left", stop).on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); }).child(label);
}

export { stop };
