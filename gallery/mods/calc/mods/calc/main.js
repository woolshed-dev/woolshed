// Calc: a calculator line with a history. It reads its own small expression language (never
// eval): + - * / % ^ and ( ), hex, binary and octal (0xff, 0b1010, 0o17), byte sizes (KB MB GB
// in 1000s, KiB MiB GiB in 1024s), sqrt, round, min, max and friends, `ans` for the last answer,
// and "in MB", "in hex" at the end to convert. The answer shows as you type; Enter keeps it in
// the history (the last 50, in this mod's localStorage). Click an answer to copy it.
// On first open, data/calc/example.txt under the app folder (one expression a line), if there,
// fills the history.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { appHome, readTextFile, settings, theme, props, closeOverlay } from "woolshed";
import { calc } from "./parse.js";

const KEEP = 50;
const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get() { try { const v = JSON.parse(localStorage.getItem("calc:history") ?? "null"); return Array.isArray(v) ? v : null; } catch { return null; } },
  set(v) { try { localStorage.setItem("calc:history", JSON.stringify(v)); } catch { /* not kept */ } },
};

export default class Calc extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.history = store.get() ?? [];
    this.note = null;
    this.live = null;
    this.input = InputState.new({ placeholder: "2 GB / 4,  0xff + 1,  3 GiB in MB" });
    this.input.on("change", (_e, cx) => { this.live = this.input.value().trim() ? calc(this.input.value(), this.ans()) : null; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.enter(cx));
    if (!store.get()) {
      cx.spawn(async (cx) => {
        const text = await readTextFile(`${appHome()}/data/calc/example.txt`).catch(() => null);
        if (!text || this.history.length) return;
        for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) this.keep(line);
        cx.notify();
      });
    }
  }

  ans() { return this.history[0]?.result ?? null; }

  keep(expr) {
    const r = calc(expr, this.ans());
    if (!r.ok) return r;
    this.history = [{ expr, main: r.main, also: r.also, copy: r.copy, result: r.result }, ...this.history].slice(0, KEEP);
    store.set(this.history);
    return r;
  }

  enter(cx) {
    const expr = this.input.value().trim();
    if (!expr) return;
    const r = this.keep(expr);
    if (r.ok) { this.input.set_value(""); this.live = null; }
    else this.live = r;
    cx.notify();
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(1800, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const live = this.live;
    return v_flex().id("calc").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(380) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("Calc"))
        .when(this.history.length > 0, (el) => el.child(div().id("calc-clear").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.history = []; store.set([]); cx.notify(); }).child("clear")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("calc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().flex_none().mx(12).on_mouse_down("left", stop)
        .child(Input.new(this.input).h(38).px(12).rounded(8).border_1().border_color(live && !live.ok ? t.blocked : t.accent)
          .bg(t.background).font_family(mono).text_size(15).text_color(t.foreground)))
      .child(h_flex().id("calc-live").flex_none().mx(12).mt(6).h(44).px(12).gap(8).items_center().rounded(8).bg(t.raised)
        .when(Boolean(live?.ok), (el) => el.cursor_pointer().hover((s) => s.opacity(0.9)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.write_to_clipboard(live.copy); this.flash(`Copied ${live.copy}`, cx); }))
        .child(div().flex_none().font_family(mono).text_size(14).text_color(t.dim).child("="))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_family(mono).text_size(live?.ok ? 17 : 12)
            .text_color(!live ? t.dim : live.ok ? t.foreground : t.blocked).when(Boolean(live?.ok), (el) => el.font_semibold())
            .child(!live ? "Type a sum; Enter keeps it" : live.ok ? live.main : live.error))
          .when(Boolean(live?.ok && live.also), (el) => el.child(div().truncate().font_family(mono).text_size(11).text_color(t.dim).child(live.also)))))
      .when(this.history.length > 0, (el) => el
        .child(div().flex_none().mx(16).mt(10).mb(2).text_size(11).text_color(t.dim).child("History · click an answer to copy it, a sum to edit it"))
        .child(v_flex().id("calc-history").flex_none().mx(6).gap(1).overflow_y_scrollbar()
          .map((el) => (this.overlay ? el.max_h(300) : el.flex_1().min_h(0)))
          .children(this.history.map((h, i) => h_flex().id(`h-${i}`).flex_none().min_h(34).px(10).py(3).gap(10).items_center().rounded(7)
            .hover((s) => s.bg(t.hover))
            .child(div().id(`h-expr-${i}`).flex_1().min_w(0).truncate().font_family(mono).text_size(12).text_color(t.muted).cursor_pointer()
              .hover((s) => s.text_color(t.foreground)).tooltip("Edit this sum").on_mouse_down("left", stop)
              .on_click((_e, cx) => { this.input.set_value(h.expr); this.input.focus(); cx.notify(); }).child(h.expr))
            .child(v_flex().id(`h-res-${i}`).flex_none().max_w(200).items_end().cursor_pointer().on_mouse_down("left", stop)
              .tooltip(`Copy ${h.copy}`).on_click((_e, cx) => { cx.write_to_clipboard(h.copy); this.flash(`Copied ${h.copy}`, cx); })
              .child(div().truncate().font_family(mono).text_size(13).font_medium().text_color(t.foreground).child(h.main))
              .when(Boolean(h.also), (el) => el.child(div().truncate().font_family(mono).text_size(10.5).text_color(t.dim).child(h.also))))))))
      .child(div().flex_none().px(16).pt(8).text_size(10.5).text_color(this.note ? t.foreground : t.dim)
        .child(this.note ?? "KB MB GB are 1000s, KiB MiB GiB 1024s · end with “in MB” or “in hex” · ans is the last answer"));
  }
}
