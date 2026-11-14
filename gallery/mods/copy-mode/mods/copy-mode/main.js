// Copy mode: select and copy a terminal's text from the keyboard, vi style.
// Opening it starts Woolshed's copy mode (`terminal.select`) on the focused
// terminal, at the program's cursor; this bar holds the keyboard while it
// lasts and turns each key into one `terminal.select` step. The selection
// shows in the terminal itself; y copies it and closes. keys.js maps keys.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, props, closeOverlay, run, focused } from "woolshed";
import { spell, step } from "./keys.js";

const HINTS = [["hjkl", "move"], ["w b e", "words"], ["0 $", "line"], ["gg G", "top, end"], ["v", "mark"], ["V", "line"], ["y", "copy"], ["esc", "leave"]];

export default class CopyMode extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.terminal = focused()?.terminal ?? null;
    this.state = { count: "", pending: "", marked: false, block: false };
    this.handle = cx.focus_handle();
    this.ended = false;
    if (this.terminal) run("terminal.select", { terminal: this.terminal });
    cx.timer.after(30, () => this.handle.focus());
  }

  // Closed some other way (a click beside it, Esc handled by the window): leave copy mode too.
  async close() {
    if (!this.ended && this.terminal) run("terminal.select", { terminal: this.terminal, exit: true });
  }

  key(e, cx) {
    cx.stop_propagation();
    const next = step(spell(e), this.state);
    this.state = next.state;
    if (next.select && this.terminal) run("terminal.select", { terminal: this.terminal, ...next.select });
    if (next.close) {
      this.ended = true;
      closeOverlay(this.overlay);
    }
    cx.notify();
  }

  render() {
    const t = theme();
    const s = this.state;
    const mode = !this.terminal ? "No terminal" : s.block ? "BLOCK" : s.marked ? "VISUAL" : "COPY";
    const color = s.marked ? t.accent : t.working;
    return h_flex().id("copy-mode").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .h(40).w_full().px(12).gap(12).items_center().rounded(10).bg(t.popover).border_1().border_color(t.border).text_size(12)
      .child(div().flex_none().px(8).py(2).rounded(6).bg(color).text_color(t.accent_foreground ?? t.background).font_semibold().text_size(11).child(mode))
      .child(div().flex_none().w(34).text_color(t.foreground).font_semibold().child(`${s.count}${s.pending}`))
      .child(h_flex().flex_1().min_w(0).gap(12).overflow_hidden().children(HINTS.map(([k, what]) =>
        h_flex().flex_none().gap(4).child(div().text_color(t.foreground).font_medium().child(k)).child(div().text_color(t.dim).child(what)))));
  }
}
