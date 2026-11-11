// Night Shift: the usual workspace in low, warm light for long sessions. The
// dimmer on the bottom line moves the whole look between Dusk, Night and Deep
// (it rewrites this layout's own colors); the line also says what needs you
// and how long you've been on, and after 90 minutes suggests a stretch.
// Props: { role: "brand" } top of the sidebar, { role: "line" } the bottom line.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, layout, run, shared, setShared, theme, props, window as appWindow } from "woolshed";

const LEVEL = "night-shift.level";
const STRETCH = 90 * 60000;

// The Night palette: backgrounds stay put, the dimmer scales everything you read.
const BASE = {
  background: "#13110f", surface: "#13110f", canvas: "#0e0c0b", chrome: "#0b0a09", popover: "#1b1815", raised: "#201c18",
  hover: "#f5e6d00d", selected: "#f5e6d016", border: "#2b2621", input: "#3a332c", selection: "#3c3127",
  accent_foreground: "#13110f", solid_foreground: "#13110f",
};
const INK = {
  foreground: "#cbbfae", terminal_foreground: "#b5a893", muted: "#8e8373", dim: "#645b4f", accent: "#c39563", solid: "#cbbfae",
  cursor: "#c39563", ring: "#8e8373", working: "#b8964f", blocked: "#c2735d", done: "#8399a6", idle: "#5d554a", unknown: "#5d554a",
  ansi0: "#2a2520", ansi1: "#b8735f", ansi2: "#909b6a", ansi3: "#b8964f", ansi4: "#7f96a4", ansi5: "#a5849a", ansi6: "#7e9d95", ansi7: "#b5a893",
  ansi8: "#5f564b", ansi9: "#c98670", ansi10: "#a2ad7a", ansi11: "#caa862", ansi12: "#92a8b6", ansi13: "#b796ab", ansi14: "#90aea6", ansi15: "#d3c6b1",
};
const LEVELS = [
  { id: "dusk", label: "Dusk", scale: 1.14 },
  { id: "night", label: "Night", scale: 1 },
  { id: "deep", label: "Deep", scale: 0.78 },
];

function scaled(hex, k) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

/** The layout colors for a dimmer level. */
export function colorsFor(id) {
  const k = LEVELS.find((l) => l.id === id)?.scale ?? 1;
  return { ...BASE, ...Object.fromEntries(Object.entries(INK).map(([name, c]) => [name, scaled(c, k)])) };
}

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export default class NightShift extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "line";
    this.start = Date.now();
    if (this.role === "line") this.tick(cx);
  }

  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 40, (cx) => { cx.notify(); this.tick(cx); });
  }

  dim(id) {
    const l = layout();
    if (!l || typeof l !== "object") return;
    const next = JSON.parse(JSON.stringify(l));
    next.colors = { ...(next.colors ?? {}), ...colorsFor(id) };
    setShared(LEVEL, id);
    run("layout.set", { layout: next });
  }

  // To the rail and back, like the Woolshed layout's own sidebar button.
  toggleSidebar() {
    const width = find(layout(), "sidebar")?.size?.px;
    if (!narrow()) setShared("sidebar.width", width);
    setShared("sidebar.collapsed", !narrow());
    run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 252) : appWindow()?.platform === "macos" ? 76 : 44 });
  }

  brand(t) {
    const w = appWindow();
    const rail = narrow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    return h_flex().id("night-brand").size_full().pl(rail ? 6 : mac ? 80 : 14).pr(10).gap(8).items_center().bg(t.chrome).text_size(13.5)
      .when(!rail, (el) => el.child(h_flex().flex_1().gap(8).items_center()
        .child(svg("mods/night-shift/moon.svg").size(16).text_color(t.accent))
        .child(div().font_semibold().text_color(t.foreground).child("Night Shift"))))
      .when(!(rail && mac), (el) => el.child(div().id("night-rail").size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => this.toggleSidebar())
        .tooltip(rail ? "Open the sidebar" : "Fold the sidebar")
        .child(rail ? "»" : "«")));
  }

  line(t) {
    const list = agents();
    const level = shared(LEVEL) ?? "night";
    const waiting = list.filter((a) => a.status === "blocked");
    const working = list.filter((a) => a.status === "working").length;
    const on = Date.now() - this.start;
    const d = new Date();
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const stop = (_e, cx) => cx.stop_propagation();
    return h_flex().id("night-line").size_full().min_w(0).px(12).gap(14).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5)
      .child(h_flex().flex_none().gap(2).items_center()
        .child(svg("mods/night-shift/moon.svg").size(12).mr(4).text_color(t.dim))
        .children(LEVELS.map((l) => div().id(`dim-${l.id}`).px(7).h(18).flex().items_center().rounded(5).cursor_pointer()
          .bg(l.id === level ? t.raised : t.chrome).text_color(l.id === level ? t.foreground : t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { if (l.id !== level) this.dim(l.id); cx.notify(); })
          .child(l.label))))
      .when(waiting.length > 0, (el) => el.child(h_flex().id("night-waiting").flex_none().gap(6).px(6).h(18).items_center().rounded(5).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_click(() => run("pane.focus", { pane: waiting[0].pane }))
        .child(div().size(6).rounded(3).bg(t.blocked))
        .child(div().text_color(t.muted).child(`${waiting.length} need${waiting.length === 1 ? "s" : ""} you`))))
      .when(working > 0, (el) => el.child(div().flex_none().text_color(t.dim).child(`${working} working`)))
      .child(div().flex_1())
      .child(div().flex_none().text_color(t.dim).child(`on shift ${span(on)}`))
      .when(on >= STRETCH, (el) => el.child(div().id("night-stretch").flex_none().px(6).h(18).flex().items_center().rounded(5).cursor_pointer()
        .text_color(t.accent).hover((s) => s.bg(t.hover))
        .tooltip("Took a break? Click to start the count again")
        .on_click((_e, cx) => { this.start = Date.now(); cx.notify(); })
        .child("time to stretch")))
      .child(div().flex_none().text_color(t.muted).child(clock));
  }

  render() {
    const t = theme();
    return this.role === "brand" ? this.brand(t) : this.line(t);
  }
}
