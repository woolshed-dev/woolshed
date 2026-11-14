// Stopwatch: start, stop, laps. The watch lives in shared `stopwatch.state`, so a
// window and a strip show the same one and it keeps counting across restarts
// (it counts from when it started, not from ticks). Commands for keys:
// stopwatch.toggle, .start, .stop, .lap, .reset.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay, keys, nextCommand, appHome, readTextFile } from "woolshed";
import { clean, elapsed, start, stop, toggle, reset, lap, clock, rows, text, untilNextSecond } from "./parse.js";

const KEY = "stopwatch.state";
const state = () => clean(shared(KEY));
const save = (st) => setShared(KEY, st);
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// An example watch for a first look (the gallery preview writes one): data/stopwatch/example.json,
// { "elapsed": ms, "running": true, "laps": [ms, ...] } (laps: each lap's own length),
// taken once each time the file changes.
async function example() {
  const raw = await readTextFile(`${appHome()}/data/stopwatch/example.json`).catch(() => null);
  if (!raw || shared("stopwatch.example") === hash(raw)) return;
  setShared("stopwatch.example", hash(raw));
  let ex;
  try { ex = JSON.parse(raw); } catch { return; }
  const now = Date.now();
  let sum = 0;
  const laps = (Array.isArray(ex.laps) ? ex.laps : []).map((n) => (sum += Number(n) || 0));
  const total = Math.max(sum, Number(ex.elapsed) || 0);
  save(clean(ex.running ? { running: true, startedAt: now - total, base: 0, laps } : { running: false, base: total, laps }));
}

export default class Stopwatch extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.copied = false;
    cx.spawn(async (cx) => { await example(); cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        // A window and a strip both get a key's command: the first one acts on it.
        const last = shared("stopwatch.command");
        if (last && last.c === c && Math.abs(Date.now() - last.at) < 250) continue;
        setShared("stopwatch.command", { c, at: Date.now() });
        const st = state();
        if (c === "toggle") save(toggle(st));
        else if (c === "start") save(start(st));
        else if (c === "stop") save(stop(st));
        else if (c === "lap") save(lap(st));
        else if (c === "reset") save(reset());
        cx.notify();
      }
    });
    this.tick(cx);
  }

  // Redraws as the shown second changes, only while running; stopped, it checks once a second.
  tick(cx) {
    const st = state();
    cx.timer.after(st.running ? untilNextSecond(st) : 1000, (cx) => {
      if (state().running) cx.notify();
      this.tick(cx);
    });
  }

  button(t, id, label, action, primary = false, enabled = true) {
    return div().id(id).h(30).px(14).flex().flex_1().items_center().justify_center().rounded(7).text_size(12.5)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : enabled ? t.foreground : t.dim)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { if (enabled) { action(cx); cx.notify(); } })
      .child(label);
  }

  strip(t, st, ms) {
    return h_flex().id("stopwatch").size_full().min_w(0).overflow_hidden().px(10).gap(8).items_center().text_size(12.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { save(toggle(state())); cx.notify(); })
      .tooltip(st.running ? "Stop" : "Start")
      .child(svg("mods/stopwatch/stopwatch.svg").size(13).flex_none().text_color(st.running ? t.working : t.dim))
      .child(div().flex_none().font_semibold().text_color(st.running ? t.foreground : t.muted).child(clock(ms, !st.running)))
      .when(st.laps.length > 0, (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`lap ${st.laps.length}`)));
  }

  card(t, st, ms) {
    const stop_ = (_e, cx) => cx.stop_propagation();
    const list = rows(st);
    const current = st.running || ms > 0 ? ms - (st.laps.at(-1) ?? 0) : 0;
    return v_flex().id("stopwatch").w(300).max_h(560).p(16).pt(12).gap(10).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().items_center().gap(8)
        .child(svg("mods/stopwatch/stopwatch.svg").size(14).flex_none().text_color(st.running ? t.working : t.muted))
        .child(div().flex_1().text_color(t.muted).child(st.running ? "Running" : ms > 0 ? "Stopped" : "Stopwatch"))
        .when(list.length > 0, (el) => el.child(div().id("sw-copy").px(6).py(2).rounded(5).text_size(11).cursor_pointer().text_color(this.copied ? t.done : t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop_)
          .on_click((_e, cx) => { cx.write_to_clipboard(text(state())); this.copied = true; cx.timer.after(1500, (cx) => { this.copied = false; cx.notify(); }); cx.notify(); })
          .tooltip("Copy the laps as text")
          .child(this.copied ? "copied" : "copy laps")))
        .child(div().id("sw-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop_)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .child(h_flex().flex_none().items_end().gap(2)
        .child(div().text_size(44).font_semibold().text_color(st.running ? t.foreground : ms > 0 ? t.foreground : t.muted).child(clock(ms)))
        .child(div().pb(8).text_size(20).font_semibold().text_color(t.dim).child(st.running ? "" : `.${Math.floor(ms / 100) % 10}`)))
      .when(st.laps.length > 0, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(`Lap ${st.laps.length + 1}: ${clock(current)}`)))
      .child(h_flex().flex_none().gap(6)
        .child(this.button(t, "sw-go", st.running ? "Stop" : ms > 0 ? "Resume" : "Start", () => save(toggle(state())), true))
        .child(st.running
          ? this.button(t, "sw-lap", "Lap", () => save(lap(state())))
          : this.button(t, "sw-reset", "Reset", () => save(reset()), false, ms > 0 || st.laps.length > 0)))
      .when(list.length > 0, (el) => el
        .child(h_flex().flex_none().px(4).pt(4).gap(8).text_size(10.5).text_color(t.dim)
          .child(div().w(48).child("LAP")).child(div().flex_1().child("TIME")).child(div().w(80).text_right().child("TOTAL")))
        .child(v_flex().id("sw-laps").flex_1().min_h(0).overflow_y_scrollbar().children(list.map((r) =>
          h_flex().id(`sw-l-${r.n}`).flex_none().h(26).px(4).gap(8).items_center().border_t_1().border_color(t.border)
            .child(div().w(48).text_color(t.dim).child(`${r.n}`))
            .child(h_flex().flex_1().gap(6).items_center()
              .child(div().font_semibold().text_color(r.best ? t.done : r.worst ? t.blocked : t.foreground).child(clock(r.lap, true)))
              .when(r.best || r.worst, (el) => el.child(div().text_size(10.5).text_color(r.best ? t.done : t.blocked).child(r.best ? "best" : "slowest"))))
            .child(div().w(80).text_right().text_color(t.muted).child(clock(r.split, true)))))))
      .when(!list.length, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim)
        .child(keysHint())));
  }

  render() {
    const t = theme();
    const st = state();
    const ms = elapsed(st);
    return this.overlay ? this.card(t, st, ms) : this.strip(t, st, ms);
  }
}

// The keys bound to the watch's commands: "ctrl-alt-w start/stop · ctrl-alt-e lap".
function keysHint() {
  const bound = (action) => keys().find((b) => b.action === action)?.keys;
  const parts = [["stopwatch.toggle", "start/stop"], ["stopwatch.lap", "lap"]].map(([a, what]) => bound(a) && `${bound(a)} ${what}`).filter(Boolean);
  return parts.length ? `Laps show here, newest first · ${parts.join(" · ")}` : "Laps show here, newest first.";
}
