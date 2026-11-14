// World clock: big clocks for the places you choose, each with its date, its
// offset from here and a 24-hour strip shaded for night. Add a place by city,
// country or IANA zone name ("Asia/Tokyo"). The choice lives in shared
// `world-clock.zones` (and `world-clock.h12`), so it's there next time.
// Redraws once a minute, on the minute.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay } from "woolshed";
import { zone, search, allZones, here, utcLabel } from "./zones.js";
import { card, zonesOf, format, isDay, MAX } from "./parse.js";

const KEY = "world-clock.zones";
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const CARD = 164;

export default class WorldClock extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.adding = false;
    this.query = "";
    this.width = 0;
    this.input = InputState.new({ placeholder: "City, country or zone: Lisbon, Japan, America/Denver" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => { const first = this.results()[0]; if (first) this.add(first.id); cx.notify(); });
    this.tick(cx);
  }

  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 40, (cx) => { cx.notify(); this.tick(cx); });
  }

  zones() { return zonesOf(shared(KEY)); }
  add(id) {
    const list = this.zones();
    if (!list.includes(id)) setShared(KEY, [...list, id].slice(-MAX));
    this.input.set_value("");
    this.query = "";
    this.adding = false;
  }
  remove(id) { setShared(KEY, this.zones().filter((z) => z !== id)); }

  results() {
    const chosen = new Set(this.zones());
    return search(this.query, allZones()).filter((z) => !chosen.has(z.id)).slice(0, 8);
  }

  // 24 hour cells, night shaded, the current hour marked.
  dayStrip(t, hours) {
    return h_flex().w_full().h(6).gap(1).children([...Array(24)].map((_, h) => div().flex_1().h_full()
      .rounded(1)
      .bg(h === hours ? t.foreground : isDay(h) ? alpha(t.working, "66") : alpha(t.foreground, "1a"))));
  }

  clock(t, c, removable, stop) {
    const night = !c.daytime;
    return v_flex().id(`wc-${c.id}`).w(CARD).flex_none().p(10).pt(8).gap(3).rounded(10).border_1().border_color(t.border)
      .bg(night ? t.raised : t.background)
      .child(h_flex().gap(6).items_center()
        .child(svg(night ? "mods/world-clock/moon.svg" : "mods/world-clock/sun.svg").size(12).flex_none().text_color(night ? t.dim : t.working))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_semibold().text_color(t.foreground).child(c.city))
        .when(removable, (el) => el.child(div().id(`wc-x-${c.id}`).size(16).flex_none().flex().items_center().justify_center().rounded(4).text_size(10).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.remove(c.id); cx.notify(); })
          .tooltip("Remove").child("✕"))))
      .child(div().text_size(28).font_semibold().text_color(night ? t.muted : t.foreground).child(c.time))
      .child(div().truncate().text_size(11).text_color(t.dim).child(`${c.date} · ${c.day}`))
      .child(h_flex().gap(6).text_size(11)
        .child(div().flex_none().text_color(t.muted).child(c.diff))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(c.utc)))
      .child(div().pt(4).child(this.dayStrip(t, c.hours)));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const h12 = Boolean(shared("world-clock.h12"));
    const stop = (_e, cx) => cx.stop_propagation();
    const me = here(now);
    const mine = { id: "here", city: "Here", country: "", time: format(me.hours, me.minutes, h12), date: "", day: "", utc: utcLabel(me.offset), diff: "this computer", hours: me.hours, daytime: isDay(me.hours) };
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    mine.date = `${DAYS[me.weekday]} ${me.day} ${MONTHS[me.month]}`;
    mine.day = "today";
    const cards = this.zones().map((id) => card(zone(id), now, h12));
    const small = (id, label, action, tip) => div().id(id).h(24).px(8).flex().flex_none().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { action(cx); cx.notify(); }).tooltip(tip).child(label);
    const header = h_flex().flex_none().items_center().gap(6)
      .child(svg("mods/world-clock/globe.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("World clock"))
      .child(small("wc-h12", h12 ? "12 h" : "24 h", () => setShared("world-clock.h12", !h12), "Switch between 24-hour and 12-hour clocks"))
      .when(cards.length < MAX, (el) => el.child(small("wc-add", this.adding ? "Done" : "+ Add place", (cx) => {
        this.adding = !this.adding;
        if (this.adding) this.input.focus();
      }, "Add a place by city, country or zone")))
      .when(Boolean(this.overlay), (el) => el.child(div().id("wc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => closeOverlay(this.overlay)).child("✕")));
    const picker = this.adding && v_flex().flex_none().gap(4)
      .child(div().h(30).px(8).flex().items_center().rounded(7).border_1().border_color(t.accent).bg(t.background).cursor_text()
        .on_mouse_down("left", stop)
        .child(Input.new(this.input).w_full().h_full().text_size(12.5).text_color(t.foreground)))
      .child(v_flex().children(this.results().map((z) => {
        const c = card(z, now, h12);
        return h_flex().id(`wc-r-${z.id}`).h(26).px(8).gap(8).items_center().rounded(6).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.add(z.id); cx.notify(); })
          .child(div().flex_none().text_color(t.foreground).child(z.city))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${z.country} · ${z.id}`))
          .child(div().flex_none().text_size(11.5).text_color(t.muted).child(`${c.time}  ${c.diff}`));
      })))
      .when(this.results().length === 0, (el) => el.child(div().px(8).py(4).text_size(11.5).text_color(t.dim)
        .child(this.query.trim() ? `No place matches “${this.query.trim()}”` : "All places are already shown")));
    const grid = h_flex().flex_wrap().gap(8).items_start()
      .child(this.clock(t, mine, false, stop))
      .children(cards.map((c) => this.clock(t, c, true, stop)));
    const body = v_flex().id("world-clock").p(12).pt(10).gap(10).text_size(12.5)
      .bg(this.overlay ? t.popover : t.chrome)
      .child(header)
      .when(Boolean(picker), (el) => el.child(picker))
      .child(cards.length ? grid : v_flex().gap(8).child(grid).child(div().text_size(11.5).text_color(t.dim).child("Add the places you work with: + Add place.")));
    if (this.overlay) return body.w(CARD * 3 + 8 * 2 + 24);
    return body.size_full().min_h(0).overflow_y_scrollbar();
  }
}
