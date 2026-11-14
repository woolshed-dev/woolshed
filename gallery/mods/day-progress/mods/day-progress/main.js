// Day progress: how far through the working day, the week, the month and the
// year you are, as thin bars with percentages. The working day's hours are
// yours to set (shared `day-progress.settings`). A window, or a strip in a
// layout block. Redraws once a minute, on the minute.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay, run } from "woolshed";
import { settings, nudge, workday, week, month, year, percent, span, hhmm, STEP } from "./parse.js";

const KEY = "day-progress.settings";
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

export default class DayProgress extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.tick(cx);
  }

  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 40, (cx) => { cx.notify(); this.tick(cx); });
  }

  facts(now, s) {
    const w = workday(now, s);
    const wk = week(now), mo = month(now), yr = year(now);
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayText = w.state === "off" ? "weekend: no working day"
      : w.state === "before" ? `starts in ${span(w.until)}`
      : w.state === "after" ? "done for today"
      : `${span(w.left)} left`;
    return [
      { id: "day", name: "Workday", share: w.share, text: dayText, color: (t) => (w.state === "after" ? t.done : t.working), dim: w.state === "off" || w.state === "before" },
      { id: "week", name: "Week", share: wk.share, text: `${wk.day} · ${span(wk.left)} left`, color: (t) => t.accent },
      { id: "month", name: MONTHS[new Date(now).getMonth()], share: mo.share, text: `day ${mo.day} of ${mo.days}`, color: (t) => alpha(t.foreground, "99") },
      { id: "year", name: String(yr.year), share: yr.share, text: `day ${yr.day} of ${yr.days} · ${yr.days - yr.day} to go`, color: (t) => alpha(t.foreground, "66") },
    ];
  }

  strip(t, rows) {
    return h_flex().id("day-progress").size_full().min_w(0).overflow_hidden().px(10).gap(14).items_center().text_size(11.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("mod.open", { name: "day-progress" }))
      .tooltip(rows.map((r) => `${r.name}: ${percent(r.share)}, ${r.text}`).join("\n"))
      .children(rows.filter((r) => r.id !== "month").map((r) => h_flex().flex_none().gap(6).items_center()
        .child(div().text_color(t.dim).child(r.id === "day" ? "Day" : r.id === "week" ? "Week" : "Year"))
        .child(div().w(44).h(4).rounded(2).bg(alpha(t.foreground, "14"))
          .child(div().h_full().rounded(2).w(`${Math.round(r.share * 1000) / 10}%`).bg(r.color(t))))
        .child(div().font_semibold().text_color(r.dim ? t.dim : t.muted).child(percent(r.share)))));
  }

  card(t, rows, s) {
    const stop = (_e, cx) => cx.stop_propagation();
    const step = (id, label, which, by) => div().id(id).size(20).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim).cursor_pointer()
      .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { setShared(KEY, nudge(s, which, by)); cx.notify(); })
      .child(label);
    const hours = (which, label) => h_flex().flex_none().gap(2).items_center()
      .child(div().text_color(t.dim).mr(2).child(label))
      .child(step(`dp-${which}-down`, "−", which, -STEP))
      .child(div().w(40).flex().justify_center().font_semibold().text_color(t.foreground).child(hhmm(s[which])))
      .child(step(`dp-${which}-up`, "+", which, STEP));
    return v_flex().id("day-progress").w(320).p(16).pt(12).gap(14).bg(t.popover).text_size(12.5)
      .child(h_flex().items_center().gap(8)
        .child(svg("mods/day-progress/progress.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().font_semibold().text_color(t.foreground).child("Day progress"))
        .child(div().id("dp-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .children(rows.map((r) => v_flex().gap(5)
        .child(h_flex().items_end().gap(8)
          .child(div().flex_none().font_semibold().text_color(t.foreground).child(r.name))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(r.text))
          .child(div().flex_none().text_size(r.id === "day" ? 18 : 14).font_semibold().text_color(r.dim ? t.dim : t.foreground).child(percent(r.share))))
        .child(div().w_full().h(r.id === "day" ? 6 : 4).rounded(3).bg(alpha(t.foreground, "14"))
          .child(div().h_full().rounded(3).w(`${Math.round(r.share * 1000) / 10}%`).bg(r.color(t))))))
      .child(h_flex().flex_wrap().gap(10).items_center().text_size(11.5).pt(2).border_t_1().border_color(t.border).pt(10)
        .child(hours("start", "Start"))
        .child(hours("end", "End"))
        .child(div().id("dp-weekends").px(6).py(2).rounded(5).cursor_pointer().text_color(s.weekends ? t.foreground : t.dim)
          .hover((el) => el.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { setShared(KEY, { ...s, weekends: !s.weekends }); cx.notify(); })
          .tooltip("Count Saturday and Sunday as working days")
          .child(s.weekends ? "weekends too" : "weekdays only")));
  }

  render() {
    const t = theme();
    const s = settings(shared(KEY));
    const rows = this.facts(Date.now(), s);
    return this.overlay ? this.card(t, rows, s) : this.strip(t, rows);
  }
}
