// Pomodoro: focus for a while, then a break, in rounds. The timer lives in
// shared state, so every copy (a window, a strip) shows the same one and it
// keeps going across restarts. A break starts by itself when a focus ends; the
// next focus waits for Start. Commands: pomodoro.start, .pause, .toggle,
// .reset, .skip (keys.json, or a toast's button).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, shared, setShared, notify, playSound, theme, props, closeOverlay, nextCommand } from "woolshed";

const KEY = "pomodoro.state";
const SETTINGS = "pomodoro.settings";
const DEFAULTS = { focus: 25, short: 5, long: 15, rounds: 4, sound: false };
const CHOICES = { focus: [15, 20, 25, 30, 45, 50, 60], short: [3, 5, 10], long: [10, 15, 20, 30], rounds: [2, 3, 4, 6] };
const NAMES = { focus: "Focus", short: "Short break", long: "Long break" };

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function settings() { return { ...DEFAULTS, ...(shared(SETTINGS) ?? {}) }; }
function lengthOf(phase, s = settings()) { return (s[phase] ?? 25) * 60000; }
function state() {
  const st = shared(KEY);
  if (st && typeof st === "object" && NAMES[st.phase]) return st;
  return { phase: "focus", running: false, endsAt: null, left: lengthOf("focus"), round: 1, done: 0, day: today() };
}
function left(st, now = Date.now()) { return st.running ? Math.max(0, st.endsAt - now) : st.left ?? lengthOf(st.phase); }
function clock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default class Pomodoro extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    // One tick a second, and it only redraws while the timer runs.
    cx.timer.every(1000, (cx) => this.step(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const st = state();
        if (c === "start" || (c === "toggle" && !st.running)) this.start();
        else if (c === "pause" || c === "toggle") this.pause();
        else if (c === "reset") this.reset();
        else if (c === "skip") this.advance(st, false);
        cx.notify();
      }
    });
  }

  save(st) { setShared(KEY, { ...st, day: st.day ?? today() }); }

  start() {
    const st = state();
    if (st.running) return;
    this.save({ ...st, running: true, endsAt: Date.now() + left(st), left: null });
  }

  pause() {
    const st = state();
    if (!st.running) return;
    this.save({ ...st, running: false, left: left(st), endsAt: null });
  }

  reset() {
    const st = state();
    this.save({ ...st, running: false, endsAt: null, left: lengthOf(st.phase) });
  }

  // The next phase: a break after a focus (long after the last round), a focus
  // after a break. `natural`: the time ran out (count it, tell the person).
  advance(st, natural) {
    const s = settings();
    const fresh = st.day === today();
    let done = fresh ? st.done ?? 0 : 0;
    let next, round = st.round ?? 1;
    if (st.phase === "focus") {
      if (natural) done += 1;
      next = round >= s.rounds ? "long" : "short";
    } else {
      next = "focus";
      round = st.phase === "long" ? 1 : round + 1;
    }
    const running = natural && next !== "focus";
    const now = Date.now();
    this.save({ phase: next, running, endsAt: running ? now + lengthOf(next, s) : null, left: running ? null : lengthOf(next, s), round, done, day: today() });
    if (!natural) return;
    const waiting = agents().filter((a) => a.status === "blocked").length;
    const body = waiting ? `${waiting} agent${waiting === 1 ? "" : "s"} waiting on you` : undefined;
    if (next === "focus") notify({ title: "Break over. Ready to focus?", body, level: "info", timeout: 15000, action: { name: "pomodoro.start" } });
    else notify({ title: `Focus done: ${s[next]} min ${next === "long" ? "long break" : "break"}`, body, level: "success", timeout: 10000 });
    if (s.sound) playSound("done");
  }

  step(cx) {
    const st = state();
    if (!st.running) return;
    // Every copy ticks; the first to see the end moves the shared state on,
    // so the others find a running timer again and stay quiet.
    if (Date.now() >= st.endsAt) this.advance(st, true);
    cx.notify();
  }

  cycle(key) {
    const s = settings();
    const list = CHOICES[key];
    const next = list[(list.indexOf(s[key]) + 1) % list.length] ?? list[0];
    setShared(SETTINGS, { ...s, [key]: next });
    const st = state();
    if (!st.running && key === st.phase) this.save({ ...st, left: lengthOf(st.phase, { ...s, [key]: next }) });
  }

  button(t, id, label, action, primary = false) {
    return div().id(id).h(28).px(12).flex().items_center().justify_center().rounded(7).text_size(12.5).cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(label);
  }

  dots(t, st, s) {
    return h_flex().gap(4).items_center().children([...Array(s.rounds)].map((_, i) => {
      const r = i + 1;
      const full = r < st.round || (r === st.round && st.phase !== "focus");
      const now = r === st.round && st.phase === "focus";
      return div().size(7).rounded(4).flex_none()
        .when(full, (el) => el.bg(t.done))
        .when(now, (el) => el.bg(alpha(t.working, "cc")))
        .when(!full && !now, (el) => el.border(1.5).border_color(t.dim));
    }));
  }

  strip(t, st, ms) {
    const color = st.phase === "focus" ? t.working : t.done;
    return h_flex().id("pomodoro").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { st.running ? this.pause() : this.start(); cx.notify(); })
      .tooltip(st.running ? "Pause" : "Start")
      .child(svg(st.running ? "mods/pomodoro/pause.svg" : "mods/pomodoro/play.svg").size(12).flex_none().text_color(color))
      .child(div().flex_none().font_semibold().text_color(st.running ? t.foreground : t.muted).child(clock(ms)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(NAMES[st.phase]));
  }

  card(t, st, s, ms) {
    const total = lengthOf(st.phase, s);
    const share = Math.max(0, Math.min(1, 1 - ms / total));
    const color = st.phase === "focus" ? t.working : t.done;
    const choice = (key, label) => div().id(`pm-${key}`).px(6).py(2).rounded(5).cursor_pointer().text_color(t.muted)
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { this.cycle(key); cx.notify(); })
      .tooltip("Click to change")
      .child(label);
    const stop = (_e, cx) => cx.stop_propagation();
    const sessions = st.day === today() ? st.done ?? 0 : 0;
    return v_flex().id("pomodoro").w(300).p(16).pt(12).gap(12).bg(t.popover).text_size(12.5)
      .child(h_flex().items_center().gap(8)
        .child(this.dots(t, st, s))
        .child(div().flex_1().text_color(t.muted).child(st.phase === "focus" ? `Focus · ${st.round} of ${s.rounds}` : NAMES[st.phase]))
        .child(div().id("pm-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .child(div().text_size(44).font_semibold().text_color(st.running ? t.foreground : t.muted).child(clock(ms)))
      .child(div().w_full().h(4).rounded(2).bg(alpha(t.foreground, "14"))
        .child(div().h_full().rounded(2).w(`${Math.round(share * 1000) / 10}%`).bg(color)))
      .child(h_flex().gap(6)
        .child(this.button(t, "pm-go", st.running ? "Pause" : ms < total ? "Resume" : "Start", () => (st.running ? this.pause() : this.start()), true))
        .child(this.button(t, "pm-reset", "Reset", () => this.reset()))
        .child(this.button(t, "pm-skip", "Skip", () => this.advance(state(), false))))
      .child(h_flex().gap(2).items_center().text_size(11.5).on_mouse_down("left", stop)
        .child(choice("focus", `${s.focus} min`)).child(div().text_color(t.dim).child("·"))
        .child(choice("short", `${s.short} break`)).child(div().text_color(t.dim).child("·"))
        .child(choice("long", `${s.long} long`)).child(div().text_color(t.dim).child("·"))
        .child(choice("rounds", `${s.rounds} rounds`)))
      .child(h_flex().items_center().text_size(11.5).on_mouse_down("left", stop)
        .child(div().flex_1().text_color(t.dim).child(`Today: ${sessions} focus session${sessions === 1 ? "" : "s"}`))
        .child(div().id("pm-sound").px(6).py(2).rounded(5).cursor_pointer().text_color(s.sound ? t.foreground : t.dim)
          .hover((el) => el.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { setShared(SETTINGS, { ...s, sound: !s.sound }); cx.notify(); })
          .tooltip("Play the done sound when a phase ends")
          .child(s.sound ? "sound on" : "sound off")));
  }

  render() {
    const t = theme();
    const st = state();
    const s = settings();
    const ms = left(st);
    return this.overlay ? this.card(t, st, s, ms) : this.strip(t, st, ms);
  }
}
