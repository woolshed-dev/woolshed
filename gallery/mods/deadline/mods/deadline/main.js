// Deadline: named dates and how far off they are, in days and hours and in
// working days (Monday to Friday), soonest first; past ones dimmed at the
// bottom. The list lives in shared `deadline.items`. A window, or a panel in a
// layout block. Redraws once a minute.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay, appHome, readTextFile } from "woolshed";
import { make, sorted, label, left, workingDays, urgency, relative, parseWhen } from "./parse.js";

const KEY = "deadline.items";
const MAX = 30;
const items = () => (Array.isArray(shared(KEY)) ? shared(KEY).filter((i) => i && typeof i.name === "string" && typeof i.at === "number") : []);
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// An example list for a first look (the gallery preview writes one): data/deadline/example.json,
// { "items": [{ "name", "when" }] }, taken once each time the file changes.
async function example() {
  const raw = await readTextFile(`${appHome()}/data/deadline/example.json`).catch(() => null);
  if (!raw || shared("deadline.example") === hash(raw)) return;
  setShared("deadline.example", hash(raw));
  let list;
  try { list = JSON.parse(raw).items; } catch { return; }
  if (!Array.isArray(list)) return;
  const now = Date.now();
  const made = list.map((x, i) => (typeof x.daysAgo === "number"
    ? { item: { id: `ex${i}`, name: String(x.name), at: new Date(new Date(now).setHours(24, 0, 0, 0) - x.daysAgo * 86400000).getTime(), timed: false } }
    : make(x.name, x.when, now, `ex${i}`)).item).filter(Boolean);
  if (made.length) setShared(KEY, made.slice(0, MAX));
}

export default class Deadline extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.error = "";
    this.preview = "";
    this.name = InputState.new({ placeholder: "Name: v2 launch, tax return…" });
    this.when = InputState.new({ placeholder: "Date: 2026-12-04, fri, 1 dec" });
    this.name.on("submit", (_e, cx) => { this.when.focus(); cx.notify(); });
    this.when.on("submit", (_e, cx) => { this.add(); cx.notify(); });
    this.when.on("change", (_e, cx) => {
      this.error = "";
      const text = this.when.value().trim();
      const w = text ? parseWhen(text, Date.now(), { endOfDay: true }) : null;
      this.preview = w && !w.error && typeof w.at === "number" ? label({ at: w.at, timed: Boolean(w.timed) }) : "";
      cx.notify();
    });
    cx.spawn(async (cx) => { await example(); cx.notify(); });
    cx.timer.every(60000, (cx) => cx.notify());
  }

  add() {
    const list = items();
    if (list.length >= MAX) { this.error = `Up to ${MAX} deadlines: remove one first`; return; }
    const r = make(this.name.value(), this.when.value(), Date.now());
    if (r.error) { this.error = r.error; return; }
    setShared(KEY, [...list, r.item]);
    this.name.set_value("");
    this.when.set_value("");
    this.error = "";
    this.preview = "";
    this.name.focus();
  }

  row(t, i, now, stop) {
    const u = urgency(i, now);
    const late = u === "late";
    const color = u === "soon" ? t.blocked : u === "near" ? t.working : t.foreground;
    const wd = workingDays(i.at, now);
    return h_flex().id(`dl-${i.id}`).flex_none().gap(10).py(7).px(10).rounded(8).items_center()
      .hover((s) => s.bg(t.hover))
      .child(div().w(3).h(30).rounded(2).flex_none().bg(late ? t.border : u === "far" ? t.done : color))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).font_semibold().text_color(late ? t.dim : t.foreground).child(i.name))
        .child(div().truncate().text_size(11).text_color(t.dim).child(label(i, now))))
      .child(v_flex().flex_none().items_end()
        .child(div().text_size(late ? 12 : 14).font_semibold().text_color(late ? t.dim : color).child(late ? relative(i.at - now) : left(i.at - now)))
        .when(!late, (el) => el.child(div().text_size(11).text_color(t.dim).child(wd === 0 ? "no working days" : `${wd} working day${wd === 1 ? "" : "s"}`))))
      .child(div().id(`dl-x-${i.id}`).size(20).flex_none().flex().items_center().justify_center().rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { setShared(KEY, items().filter((x) => x.id !== i.id)); cx.notify(); })
        .tooltip("Remove").child("✕"));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const list = sorted(items(), now);
    const stop = (_e, cx) => cx.stop_propagation();
    const next = list.find((i) => i.at > now);
    const field = (state, w) => div().h(30).min_w(0).px(8).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.background).cursor_text()
      .on_mouse_down("left", stop)
      .map((el) => (w ? el.w(w).flex_none() : el.flex_1()))
      .child(Input.new(state).w_full().h_full().text_size(12.5).text_color(t.foreground));
    const body = v_flex().id("deadline").p(12).pt(10).gap(8).text_size(12.5).bg(this.overlay ? t.popover : t.chrome)
      .child(h_flex().flex_none().items_center().gap(8)
        .child(svg("mods/deadline/flag.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("Deadlines"))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(next ? `next: ${next.name}, ${left(next.at - now)}` : ""))
        .when(Boolean(this.overlay), (el) => el.child(div().id("dl-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(h_flex().flex_none().gap(6).items_center()
        .child(field(this.name))
        .child(field(this.when, 140))
        .child(div().id("dl-add").h(30).px(12).flex_none().flex().items_center().rounded(7).bg(t.solid).text_color(t.solid_foreground).cursor_pointer()
          .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.add(); cx.notify(); })
          .child("Add")))
      .child(div().flex_none().text_size(11).text_color(this.error ? t.blocked : t.dim)
        .child(this.error || (this.preview ? `→ ${this.preview}` : "2026-12-04 · 4 dec · fri · 4 dec 17:00 (a date alone is the end of that day)")))
      .child(div().flex_none().h(1).bg(t.border))
      .child(list.length
        ? v_flex().id("dl-list").map((el) => (this.overlay ? el.flex_none().max_h(440) : el.flex_1().min_h(0))).overflow_y_scrollbar().children(list.map((i) => this.row(t, i, now, stop)))
        : v_flex().flex_none().py(18).gap(4).items_center()
          .child(div().text_color(t.muted).child("No deadlines yet"))
          .child(div().text_size(11.5).text_color(t.dim).child("Name one and give its date, above.")));
    return this.overlay ? body.w(400).max_h(600) : body.size_full().min_h(0);
  }
}
