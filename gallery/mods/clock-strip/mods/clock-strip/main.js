// Clock strip: this computer's time and date, with the clocks of the places
// you work with. Hours when a place is likely asleep (22:00 to 07:00) are
// drawn dimmer. Click your own time for 12/24 hours; + picks places (up to 6).
// A strip in a layout block, or a window (mod.open clock-strip).

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, theme, props, openOverlay, closeOverlay } from "woolshed";
import { ZONES, wall, here, format, utcLabel } from "./zones.js";

const KEY = "clock-strip";
const MAX = 6;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prefs() {
  const p = shared(KEY);
  const zones = Array.isArray(p?.zones) ? p.zones.filter((id) => ZONES.some((z) => z.id === id)) : ["utc", "new-york", "tokyo"];
  return { zones, h12: Boolean(p?.h12) };
}
const asleep = (hours) => hours >= 22 || hours < 7;

export default class ClockStrip extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.pick = Boolean(props()?.pick);
    if (!this.pick) this.tick(cx);
  }

  // Redraws on each new minute, never more often.
  tick(cx) {
    const wait = 60000 - (Date.now() % 60000) + 40;
    cx.timer.after(wait, (cx) => { cx.notify(); this.tick(cx); });
  }

  // Each place's time, and the day against this computer's (+1, −1).
  clocks(p, now, mine) {
    return p.zones.map((id) => ZONES.find((z) => z.id === id)).filter(Boolean).map((z) => {
      const w = wall(z, now);
      const shift = w.day - mine.day;
      return { z, text: format(w.hours, w.minutes, p.h12), shift: shift > 0 ? `+${shift}` : shift < 0 ? `−${-shift}` : "", asleep: asleep(w.hours) };
    });
  }

  toggle(id) {
    const p = prefs();
    const zones = p.zones.includes(id) ? p.zones.filter((z) => z !== id) : [...p.zones, id].slice(-MAX);
    setShared(KEY, { ...p, zones });
  }

  picker(t) {
    const p = prefs();
    return v_flex().id("clock-pick").w_full().min_h(0).p(6).bg(t.popover).text_size(12.5)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child(`Places to show (up to ${MAX})`))
      .child(v_flex().id("clock-pick-list").flex_none().max_h(360).overflow_y_scrollbar().children(ZONES.map((z) => {
        const on = p.zones.includes(z.id);
        const w = wall(z);
        return h_flex().id(`cz-${z.id}`).h(28).px(8).gap(8).items_center().rounded(6).flex_none().cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.toggle(z.id); cx.notify(); })
          .child(div().w(14).flex_none().text_color(on ? t.accent : t.dim).child(on ? "✓" : ""))
          .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(z.name))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(format(w.hours, w.minutes, p.h12)));
      })));
  }

  render() {
    const t = theme();
    if (this.pick) return this.picker(t);
    const p = prefs();
    const now = Date.now();
    const mine = here(now);
    const d = new Date(now);
    const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const clocks = this.clocks(p, now, mine);
    const stop = (_e, cx) => cx.stop_propagation();
    const own = div().id("clock-own").flex_none().font_semibold().text_color(t.foreground).cursor_pointer()
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { setShared(KEY, { ...p, h12: !p.h12 }); cx.notify(); })
      .tooltip(p.h12 ? "Show 24 hours" : "Show 12 hours")
      .child(format(mine.hours, mine.minutes, p.h12));
    const add = div().id("clock-add").size(20).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click(() => openOverlay({ mod: "clock-strip", kind: "popup", width: 240, height: 400, props: { pick: true } }))
      .tooltip("Choose places")
      .child("+");
    if (this.overlay) {
      return v_flex().id("clock-strip").w(260).p(14).pt(10).gap(8).bg(t.popover).text_size(12.5)
        .child(h_flex().items_center().gap(6)
          .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child(date))
          .child(add)
          .child(div().id("clock-close").size(20).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
            .on_click(() => closeOverlay(this.overlay)).child("✕")))
        .child(h_flex().items_end().gap(8).child(own.text_size(30)).child(div().pb(5).text_size(11).text_color(t.dim).child(utcLabel(mine.offset))))
        .children(clocks.map((c) => h_flex().h(22).gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().text_color(c.asleep ? t.dim : t.muted).child(c.z.name))
          .child(div().flex_none().text_size(10.5).text_color(t.dim).child(c.shift))
          .child(div().flex_none().w(64).text_right().text_color(c.asleep ? t.dim : t.foreground).child(c.text))));
    }
    return h_flex().id("clock-strip").size_full().min_w(0).px(12).gap(14).items_center().bg(t.chrome).text_size(12)
      .child(div().flex_none().text_color(t.dim).child(date))
      .child(own)
      .children(clocks.map((c) => h_flex().flex_none().gap(5).items_center()
        .child(div().text_color(t.dim).child(c.z.name))
        .child(div().text_color(c.asleep ? t.dim : t.muted).child(c.text))
        .when(Boolean(c.shift), (el) => el.child(div().text_size(10).text_color(t.dim).child(c.shift)))))
      .child(div().flex_1())
      .child(add);
  }
}
