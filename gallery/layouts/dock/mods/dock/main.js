// Dock: every running terminal as a chip along the bottom, grouped by space,
// in space, tab and pane order: agents, test runs, servers, shells, and the
// helpers agents started themselves. A click shows that terminal (its tab
// opens and it gets the keyboard); a helper with no pane of its own opens as a
// peek. What's in the tab on screen is lit; the one you're typing in is ringed.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, terminals, agents, focused, run, theme, home } from "woolshed";
import { chips } from "./chips.js";

const SPIN = "mods/dock/spinner.svg";
const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function glyph(t, status) {
  if (status === "working") return svg(SPIN).size(10).flex_none().text_color(t.working).spin(900);
  if (status === "idle") return div().size(6).flex_none().rounded(3).border(1).border_color(t.idle ?? t.dim);
  return div().size(6).flex_none().rounded(3).bg(t[status] ?? t.dim);
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class Dock extends View {
  render() {
    const t = theme();
    const f = focused();
    const groups = chips(spaces(), panes(), terminals(), agents());
    const count = groups.reduce((n, g) => n + g.chips.length, 0);
    const chip = (c) => {
      const lit = c.tab === f?.tab;
      const on = c.address === f?.terminal;
      const st = c.status;
      return h_flex().id(`dk-${c.address}`).h(36).pl(9).pr(11).gap(8).flex_none().items_center().rounded(9)
        .bg(st === "blocked" ? alpha(t.blocked, "1f") : lit ? t.raised : t.chrome)
        .border(1).border_color(on ? t.accent : st === "blocked" ? alpha(t.blocked, "55") : lit ? t.border : alpha(t.border, "00"))
        .cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click(() => (c.pane ? run("pane.focus", { pane: c.pane }) : run("terminal.peek", { terminal: c.address })))
        .tooltip(`${c.name} · ${c.where}${c.cwd ? ` · ${tidy(c.cwd)}` : ""}${c.pane ? "" : " (click to peek)"}`)
        .when(c.helper, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("↳")))
        .child(icon(c.program, 15, t.foreground))
        .child(v_flex().min_w(0).max_w(150)
          .child(div().truncate().text_size(12).text_color(lit ? t.foreground : t.muted).child(c.name))
          .child(div().truncate().text_size(10.5).text_color(st === "blocked" ? t.blocked : t.dim)
            .child(st ? `${WORDS[st] ?? st} · ${c.tabName}` : c.tabName)))
        .when(Boolean(st), (el) => el.child(glyph(t, st)));
    };
    const group = (g) => h_flex().id(`dk-space-${g.space}`).flex_none().h(44).pl(10).pr(4).gap(4).items_center().rounded(11)
      .bg(alpha(t.canvas, "ff")).border(1).border_color(g.active ? t.border : alpha(t.border, "00"))
      .child(div().id(`dk-space-name-${g.space}`).flex_none().max_w(110).pr(4).truncate().text_size(11).font_semibold()
        .text_color(g.active ? t.foreground : t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click(() => run("space.select", { id: g.space })).child(g.name))
      .children(g.chips.map(chip));
    return h_flex().id("dock").size_full().min_w(0).px(10).gap(8).items_center().bg(t.chrome).border_t(1).border_color(t.border)
      .child(v_flex().flex_none().w(58).items_center()
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child(String(count)))
        .child(div().text_size(10).text_color(t.dim).child(count === 1 ? "terminal" : "terminals")))
      .child(h_flex().id("dk-row").flex_1().min_w(0).h_full().gap(8).items_center().overflow_x_scrollbar()
        .children(groups.map(group))
        .when(count === 0, (el) => el.child(div().text_size(12).text_color(t.dim).child("Nothing running. New terminals and agents show up here as you start them."))));
  }
}
