// Countdown: named countdowns ("standup", "deploy freeze") to a time today, a
// day, a date, or a time every day. A toast when one ends. The list lives in
// shared `countdown.items`, so a window and a strip show the same ones and they
// survive restarts. In a layout block it's a strip of the soonest ones.
// The first copy to see an end marks it, so the toast comes once.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, notify, playSound, theme, props, closeOverlay, run, appHome, readTextFile } from "woolshed";
import { make, where, due, mark, sorted, label, left, relative, parseWhen } from "./parse.js";

const KEY = "countdown.items";
const MAX = 20;
const HOUR = 3600000;

const items = () => (Array.isArray(shared(KEY)) ? shared(KEY).filter((i) => i && typeof i.name === "string" && (typeof i.at === "number" || typeof i.daily === "number")) : []);
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// An example list for a first look (the gallery preview writes one): data/countdown/example.json,
// { "items": [{ "name", "when" }] }, taken once each time the file changes.
async function example(now) {
  const text = await readTextFile(`${appHome()}/data/countdown/example.json`).catch(() => null);
  if (!text || shared("countdown.example") === hash(text)) return;
  setShared("countdown.example", hash(text));
  let list;
  try { list = JSON.parse(text).items; } catch { return; }
  if (!Array.isArray(list)) return;
  const made = list.map((x, i) => make(x.name, x.when, now, `ex${i}`).item).filter(Boolean);
  if (made.length) setShared(KEY, made.slice(0, MAX));
}

export default class Countdown extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.count = Math.max(1, Math.min(6, Number(props()?.count) || 3));
    this.error = "";
    this.preview = "";
    this.minute = -1;
    if (this.overlay) {
      this.name = InputState.new({ placeholder: "Name: standup, deploy freeze…" });
      this.when = InputState.new({ placeholder: "When: 10:00, fri 17:00, in 45m" });
      this.name.on("submit", (_e, cx) => { this.when.focus(); cx.notify(); });
      this.when.on("submit", (_e, cx) => { this.add(); cx.notify(); });
      this.when.on("change", (_e, cx) => { this.error = ""; this.hint(); cx.notify(); });
    }
    cx.spawn(async (cx) => { await example(Date.now()); cx.notify(); });
    // A tick a second checks for ends; it redraws each second only while one is under an hour
    // away, else once a minute.
    cx.timer.every(1000, (cx) => this.step(cx));
  }

  step(cx) {
    const now = Date.now();
    const list = items();
    let changed = false;
    const next = list.map((i) => {
      if (!due(i, now)) return i;
      changed = true;
      notify({ title: `${i.name}: time's up`, body: label(i, now), level: "success", timeout: 30000 });
      if (shared("countdown.sound")) playSound("done");
      return { ...i, fired: mark(i, where(i, now).last) };
    });
    if (changed) setShared(KEY, next);
    const soon = list.some((i) => { const w = where(i, now); return !w.ended && w.target - now < HOUR; });
    const minute = Math.floor(now / 60000);
    if (changed || soon || minute !== this.minute) { this.minute = minute; cx.notify(); }
  }

  hint() {
    const text = this.when.value().trim();
    if (!text) { this.preview = ""; return; }
    const w = parseWhen(text, Date.now());
    this.preview = w.error ? "" : typeof w.daily === "number" ? label({ daily: w.daily }) : label({ at: w.at, timed: w.timed !== false });
  }

  add() {
    const list = items();
    if (list.length >= MAX) { this.error = `Up to ${MAX} countdowns: remove one first`; return; }
    const r = make(this.name.value(), this.when.value(), Date.now());
    if (r.error) { this.error = r.error; return; }
    setShared(KEY, [...list, r.item]);
    this.name.set_value("");
    this.when.set_value("");
    this.error = "";
    this.preview = "";
    this.name.focus();
  }

  remove(id) { setShared(KEY, items().filter((i) => i.id !== id)); }

  color(t, ms) { return ms < 5 * 60000 ? t.blocked : ms < HOUR ? t.working : t.foreground; }

  strip(t, now) {
    const list = sorted(items(), now).filter((i) => !where(i, now).ended).slice(0, this.count);
    const open = () => run("mod.open", { name: "countdown" });
    return h_flex().id("countdown").size_full().min_w(0).overflow_hidden().px(10).gap(12).items_center().text_size(12).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(open)
      .tooltip("Countdowns")
      .child(svg("mods/countdown/hourglass.svg").size(13).flex_none().text_color(t.dim))
      .when(!list.length, (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child("No countdowns · click to add")))
      .children(list.map((i, n) => {
        const ms = where(i, now).target - now;
        return h_flex().flex_none().gap(5).items_center().when(n > 0, (el) => el.min_w(0))
          .child(div().truncate().text_color(t.dim).child(i.name))
          .child(div().flex_none().font_semibold().text_color(this.color(t, ms)).child(left(ms)));
      }));
  }

  row(t, i, now) {
    const w = where(i, now);
    const ms = w.target - now;
    const stop = (_e, cx) => cx.stop_propagation();
    const share = !w.ended && ms < HOUR ? 1 - ms / HOUR : 0;
    return v_flex().id(`cd-${i.id}`).flex_none().gap(4).py(7).px(10).rounded(8)
      .hover((s) => s.bg(t.hover))
      .child(h_flex().gap(10).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(13).font_semibold().text_color(w.ended ? t.dim : t.foreground).child(i.name))
          .child(div().truncate().text_size(11).text_color(t.dim).child(label(i, now))))
        .child(div().flex_none().text_size(w.ended ? 12 : 18).font_semibold()
          .text_color(w.ended ? t.dim : this.color(t, ms))
          .child(w.ended ? `ended ${relative(w.target - now)}` : left(ms)))
        .child(div().id(`cd-x-${i.id}`).size(20).flex_none().flex().items_center().justify_center().rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.raised).text_color(t.foreground))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.remove(i.id); cx.notify(); })
          .tooltip("Remove")
          .child("✕")))
      .when(share > 0, (el) => el.child(div().w_full().h(3).rounded(2).bg(alpha(t.foreground, "14"))
        .child(div().h_full().rounded(2).w(`${Math.round(share * 1000) / 10}%`).bg(this.color(t, ms)))));
  }

  window(t, now) {
    const list = sorted(items(), now);
    const stop = (_e, cx) => cx.stop_propagation();
    const field = (state, w) => div().h(30).min_w(0).px(8).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.background).cursor_text()
      .on_mouse_down("left", stop)
      .map((el) => (w ? el.w(w).flex_none() : el.flex_1()))
      .child(Input.new(state).w_full().h_full().text_size(12.5).text_color(t.foreground));
    const sound = Boolean(shared("countdown.sound"));
    return v_flex().id("countdown").w(360).max_h(560).p(12).pt(10).gap(8).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().items_center().gap(8)
        .child(svg("mods/countdown/hourglass.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().font_semibold().text_color(t.foreground).child("Countdowns"))
        .child(div().id("cd-sound").px(6).py(2).rounded(5).text_size(11).cursor_pointer().text_color(sound ? t.foreground : t.dim)
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { setShared("countdown.sound", !sound); cx.notify(); })
          .tooltip("Play the done sound when one ends")
          .child(sound ? "sound on" : "sound off"))
        .child(div().id("cd-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .child(h_flex().flex_none().gap(6).items_center()
        .child(field(this.name))
        .child(field(this.when, 136))
        .child(div().id("cd-add").h(30).px(12).flex_none().flex().items_center().rounded(7).bg(t.solid).text_color(t.solid_foreground).cursor_pointer()
          .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.add(); cx.notify(); })
          .child("Add")))
      .child(div().flex_none().text_size(11).text_color(this.error ? t.blocked : t.dim)
        .child(this.error || (this.preview ? `→ ${this.preview}` : "10:00 · fri 17:00 · 2026-12-01 · 1 dec 9am · in 45m · daily 9:30")))
      .child(div().flex_none().h(1).bg(t.border))
      .child(list.length
        ? v_flex().id("cd-list").flex_none().max_h(420).overflow_y_scrollbar().children(list.map((i) => this.row(t, i, now)))
        : v_flex().flex_none().py(18).gap(4).items_center()
          .child(div().text_color(t.muted).child("No countdowns yet"))
          .child(div().text_size(11.5).text_color(t.dim).child("Name one and say when, above.")));
  }

  render() {
    const t = theme();
    const now = Date.now();
    return this.overlay ? this.window(t, now) : this.strip(t, now);
  }
}
