// Calendar: this month as a grid with ISO week numbers and today marked.
// ‹ and › move a month, Today comes back. Click a day to copy its date as
// YYYY-MM-DD, or a week number to copy it as 2026-W46. Monday or Sunday
// first: shared `calendar.start`. Redraws at midnight.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay } from "woolshed";
import { grid, today, same, shift, isoWeek, weekLabel, dayOfYear, longDate, untilMidnight, MONTHS, WEEKDAYS } from "./parse.js";

const CELL = 34;

export default class Calendar extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    const t = today();
    this.shown = { y: t.y, m: t.m };
    this.copied = null;
    this.midnight(cx);
  }

  midnight(cx) {
    cx.timer.after(untilMidnight(), (cx) => { cx.notify(); this.midnight(cx); });
  }

  copy(cx, text, what) {
    cx.write_to_clipboard(text);
    this.copied = { text, what };
    this.clear?.cancel();
    this.clear = cx.timer.after(2500, (cx) => { this.copied = null; cx.notify(); });
  }

  render() {
    const t = theme();
    const now = today();
    const sunday = shared("calendar.start") === "sun";
    const rows = grid(this.shown, { sunday });
    const stop = (_e, cx) => cx.stop_propagation();
    const heads = sunday ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
    const here = this.shown.y === now.y && this.shown.m === now.m;
    const nav = (id, label, n, tip) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_size(15).text_color(t.muted).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.shown = shift(this.shown, n); cx.notify(); }).tooltip(tip).child(label);
    const cell = (day) => {
      const isToday = same(day, now);
      const weekend = day.weekday === 0 || day.weekday === 6;
      const picked = this.copied?.text === day.iso;
      return div().id(`cal-${day.iso}`).w(CELL).h(30).flex_none().flex().items_center().justify_center().rounded(15).text_size(12.5).cursor_pointer()
        .when(isToday, (el) => el.bg(t.accent).text_color(t.accent_foreground).font_semibold())
        .when(!isToday && picked, (el) => el.bg(t.selected).text_color(t.foreground))
        .when(!isToday && !picked, (el) => el.text_color(day.outside ? t.dim : weekend ? t.muted : t.foreground).hover((s) => s.bg(t.hover)))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.copy(cx, day.iso, "date"); cx.notify(); })
        .tooltip(`${longDate(day)} · copy ${day.iso}`)
        .child(String(day.d));
    };
    const week = (w) => div().id(`cal-w-${weekLabel(w)}`).w(28).h(30).flex_none().flex().items_center().justify_center().rounded(6).text_size(10.5).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.copy(cx, weekLabel(w), "week"); cx.notify(); })
      .tooltip(`Copy ${weekLabel(w)}`)
      .child(String(w.week));
    const doy = dayOfYear(now);
    const foot = this.copied ? `Copied ${this.copied.text}` : `Today: week ${isoWeek(now).week} · day ${doy.day} of ${doy.of}`;
    const body = v_flex().id("calendar").p(12).pt(10).gap(6).text_size(12.5).bg(this.overlay ? t.popover : t.chrome)
      .child(h_flex().flex_none().items_center().gap(4)
        .child(svg("mods/calendar/calendar.svg").size(14).flex_none().mr(4).text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(`${MONTHS[this.shown.m]} ${this.shown.y}`))
        .when(!here, (el) => el.child(div().id("cal-today").h(24).px(8).flex().items_center().rounded(6).text_size(11.5).text_color(t.accent).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.shown = { y: now.y, m: now.m }; cx.notify(); }).child("Today")))
        .child(nav("cal-prev", "‹", -1, "Previous month"))
        .child(nav("cal-next", "›", 1, "Next month"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("cal-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(h_flex().flex_none().pt(4)
        .child(div().w(28).flex_none().text_size(10).text_color(t.dim).flex().justify_center().child("wk"))
        .children(heads.map((d) => div().w(CELL).flex_none().flex().justify_center().text_size(10.5)
          .text_color(d === 0 || d === 6 ? t.dim : t.muted).child(WEEKDAYS[d].slice(0, 2)))))
      .children(rows.map((r) => h_flex().flex_none().child(week(r.week)).children(r.days.map(cell))))
      .child(h_flex().flex_none().pt(4).items_center().gap(6).text_size(11)
        .child(div().flex_1().min_w(0).truncate().text_color(this.copied ? t.done : t.dim).child(foot))
        .child(div().id("cal-start").px(6).py(2).flex_none().rounded(5).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { setShared("calendar.start", sunday ? "mon" : "sun"); cx.notify(); })
          .tooltip("Which day starts the week")
          .child(sunday ? "Sunday first" : "Monday first")));
    return this.overlay ? body : body.size_full().min_h(0);
  }
}
