// Standup timer: a timeboxed round. Each person on the list gets the same box
// (90 seconds by default); Next hands over, the bar turns the `blocked` color
// when someone runs over, and the total runs against everyone's boxes. The
// round and the names live in shared `standup-timer.state`, so they're there
// next time and a strip shows the same round. Commands: standup-timer.next,
// .start, .pause, .toggle, .reset.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay, nextCommand, appHome, readTextFile } from "woolshed";
import * as S from "./parse.js";

const KEY = "standup-timer.state";
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const state = () => S.clean(shared(KEY));
const save = (st) => setShared(KEY, st);
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// An example round for a first look (the gallery preview writes one):
// data/standup-timer/example.json, { "names", "seconds", "spent": [s, ...] (those done),
// "turn": seconds into the current one }, running; taken once each time the file changes.
async function example() {
  const raw = await readTextFile(`${appHome()}/data/standup-timer/example.json`).catch(() => null);
  if (!raw || shared("standup-timer.example") === hash(raw)) return;
  setShared("standup-timer.example", hash(raw));
  let ex;
  try { ex = JSON.parse(raw); } catch { return; }
  const st = S.clean({ names: ex.names, seconds: ex.seconds });
  if (!st.names.length) return;
  const spent = (Array.isArray(ex.spent) ? ex.spent : []).slice(0, st.names.length - 1).map((s) => (Number(s) || 0) * 1000);
  save({ ...st, phase: "running", at: spent.length, spent, since: Date.now() - (Number(ex.turn) || 0) * 1000, base: 0 });
}

export default class StandupTimer extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.error = "";
    if (this.overlay) {
      this.input = InputState.new({ placeholder: "Add a name" });
      this.input.on("submit", (_e, cx) => { this.add(); cx.notify(); });
      this.input.on("change", (_e, cx) => { if (this.error) { this.error = ""; cx.notify(); } });
    }
    cx.spawn(async (cx) => { await example(); cx.notify(); });
    cx.timer.every(1000, (cx) => { if (state().phase === "running") cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const last = shared("standup-timer.command");
        if (last && last.c === c && Math.abs(Date.now() - last.at) < 250) continue;
        setShared("standup-timer.command", { c, at: Date.now() });
        const st = state();
        if (c === "next") save(S.next(st));
        else if (c === "start") save(S.start(st));
        else if (c === "pause") save(S.pause(st));
        else if (c === "toggle") save(st.phase === "running" ? S.pause(st) : S.start(st));
        else if (c === "reset") save(S.reset(st));
        cx.notify();
      }
    });
  }

  add() {
    const r = S.add(state(), this.input.value());
    if (r.error) { this.error = r.error; return; }
    save(r.st);
    this.input.set_value("");
    this.error = "";
  }

  button(t, id, label, action, primary = false) {
    return div().id(id).h(30).px(12).flex().flex_1().items_center().justify_center().rounded(7).text_size(12.5).cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(label);
  }

  strip(t, st, now) {
    const live = st.phase === "running" || st.phase === "paused";
    const ms = S.turn(st, now);
    const over = live && S.isOver(ms, st);
    return h_flex().id("standup-timer").size_full().min_w(0).overflow_hidden().px(10).gap(8).items_center().text_size(12.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { save(S.next(state())); cx.notify(); })
      .tooltip(live ? "Next person" : "Start the standup")
      .child(svg("mods/standup-timer/people.svg").size(13).flex_none().text_color(live ? (over ? t.blocked : t.working) : t.dim))
      .child(div().flex_none().truncate().text_color(live ? t.foreground : t.muted)
        .child(live ? st.names[st.at] : st.phase === "done" ? `Done in ${S.clock(S.total(st, now))}` : st.names.length ? `Standup · ${st.names.length} people` : "Standup · no names yet"))
      .when(live, (el) => el
        .child(div().flex_none().font_semibold().text_color(over ? t.blocked : t.foreground).child(S.clock(ms)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`${st.at + 1} of ${st.names.length}`)));
  }

  card(t, st, now) {
    const stop = (_e, cx) => cx.stop_propagation();
    const live = st.phase === "running" || st.phase === "paused";
    const ms = S.turn(st, now);
    const box = st.seconds * 1000;
    const over = live && ms > box;
    const sum = S.total(st, now);
    const budget = S.budget(st);
    const editable = st.phase === "ready" || st.phase === "done";
    const header = h_flex().items_center().gap(8)
      .child(svg("mods/standup-timer/people.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().font_semibold().text_color(t.foreground).child("Standup"))
      .child(div().text_size(11.5).text_color(sum > budget && budget ? t.blocked : t.dim)
        .child(st.names.length ? `${S.clock(sum)} of ${S.clock(budget)}` : ""))
      .child(div().id("st-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
        .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => closeOverlay(this.overlay)).child("✕"));
    const speaker = live
      ? v_flex().gap(6)
        .child(h_flex().items_end().gap(10)
          .child(div().flex_1().min_w(0).truncate().text_size(20).font_semibold().text_color(t.foreground).child(st.names[st.at]))
          .child(div().flex_none().text_size(30).font_semibold().text_color(over ? t.blocked : st.phase === "paused" ? t.muted : t.foreground).child(S.clock(ms))))
        .child(div().w_full().h(5).rounded(3).bg(alpha(t.foreground, "14"))
          .child(div().h_full().rounded(3).w(`${Math.round(Math.min(1, ms / box) * 1000) / 10}%`).bg(over ? t.blocked : t.working)))
        .child(div().text_size(11.5).text_color(over ? t.blocked : t.dim)
          .child(st.phase === "paused" ? "Paused" : over ? `${S.clock(ms - box)} over` : `${S.clock(box - ms)} left of ${S.secondsLabel(st.seconds)}`))
      : st.phase === "done"
        ? v_flex().gap(2)
          .child(div().text_size(20).font_semibold().text_color(t.foreground).child(`Done in ${S.clock(sum)}`))
          .child(div().text_size(11.5).text_color(S.overCount(st) ? t.blocked : t.done)
            .child(S.overCount(st) ? `${S.overCount(st)} went over · ${S.clock(Math.abs(budget - sum))} ${sum > budget ? "over" : "under"} the box` : "Everyone kept to time"))
        : div().text_size(12).text_color(t.muted).child(st.names.length ? `${st.names.length} people, ${S.secondsLabel(st.seconds)} each` : "Add the people who speak, then Start.");
    const rows = st.names.map((name, i) => {
      const done = i < st.spent.length;
      const now_ = live && i === st.at;
      const spent = done ? st.spent[i] : now_ ? ms : 0;
      const late = (done || now_) && spent > box;
      return h_flex().id(`st-n-${i}`).flex_none().h(26).px(8).gap(8).items_center().rounded(6)
        .when(now_, (el) => el.bg(t.selected))
        .when(editable, (el) => el.hover((s) => s.bg(t.hover)))
        .child(div().size(7).rounded(4).flex_none()
          .when(done, (el) => el.bg(late ? t.blocked : t.done))
          .when(now_, (el) => el.bg(over ? t.blocked : t.working))
          .when(!done && !now_, (el) => el.border(1.5).border_color(t.dim)))
        .child(div().flex_1().min_w(0).truncate().text_color(done ? t.muted : now_ ? t.foreground : t.muted).child(name))
        .child(div().flex_none().text_size(11.5).text_color(late ? t.blocked : t.dim).child(done || now_ ? S.clock(spent) : ""))
        .when(editable, (el) => el.child(div().id(`st-x-${i}`).size(18).flex_none().flex().items_center().justify_center().rounded(5).text_size(10.5).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { save(S.remove(state(), i)); cx.notify(); })
          .tooltip("Remove").child("✕")));
    });
    const controls = live
      ? h_flex().gap(6)
        .child(this.button(t, "st-next", st.at + 1 >= st.names.length ? "Finish" : `Next: ${st.names[st.at + 1]}`, () => save(S.next(state())), true))
        .child(this.button(t, "st-pause", st.phase === "paused" ? "Resume" : "Pause", () => { const s = state(); save(s.phase === "paused" ? S.start(s) : S.pause(s)); }).flex_none().w(76))
        .child(this.button(t, "st-reset", "Reset", () => save(S.reset(state()))).flex_none().w(64))
      : h_flex().gap(6)
        .child(this.button(t, "st-start", st.phase === "done" ? "Again" : "Start", () => save(S.start(state())), true))
        .child(this.button(t, "st-shuffle", "Shuffle", () => save(S.shuffle(state()))).flex_none().w(76))
        .child(this.button(t, "st-secs", S.secondsLabel(st.seconds), () => save(S.cycleSeconds(S.reset(state())))).flex_none().w(76).tooltip("Each person's time: click to change"));
    return v_flex().id("standup-timer").w(320).max_h(600).p(14).pt(10).gap(10).bg(t.popover).text_size(12.5)
      .child(header)
      .child(speaker)
      .when(st.names.length > 0, (el) => el.child(v_flex().id("st-names").flex_1().min_h(0).overflow_y_scrollbar().children(rows)))
      .when(editable, (el) => el.child(v_flex().gap(4)
        .child(div().h(30).px(8).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.background).cursor_text()
          .on_mouse_down("left", stop)
          .child(Input.new(this.input).w_full().h_full().text_size(12.5).text_color(t.foreground)))
        .when(Boolean(this.error), (el) => el.child(div().text_size(11).text_color(t.blocked).child(this.error)))))
      .when(st.names.length > 0, (el) => el.child(controls));
  }

  render() {
    const t = theme();
    const st = state();
    const now = Date.now();
    return this.overlay ? this.card(t, st, now) : this.strip(t, st, now);
  }
}
