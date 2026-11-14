// Weather: the forecast for a city, now and for three days, from wttr.in
// (https://wttr.in/<city>?format=j1). It asks when it opens (unless it asked in the last 10
// minutes) and every 30 minutes while it's open; "refresh" asks now. The last answer is kept in
// this mod's localStorage, so offline it shows that one and says how old it is. Nothing is sent
// but the city's name. On first open, data/weather/city.txt under the app folder (a city name),
// if there, sets the city.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { appHome, readTextFile, theme, props, closeOverlay } from "woolshed";
import { summarize, kindOf, dayLabel, localDate, clock, urlFor, rangeBar, tidyCity } from "./parse.js";

const EVERY = 30 * 60000;
const FRESH = 10 * 60000;
const TIMEOUT = 20000;
const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ } },
};
const icon = (kind) => `mods/weather/${kind}.svg`;

export default class Weather extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.city = store.get("weather:city") ?? "";
    this.unit = store.get("weather:unit") ?? "c";
    this.cache = store.get("weather:cache");
    if (this.cache && this.cache.city !== this.city) this.cache = null;
    this.error = null;
    this.offline = false;
    this.busy = false;
    this.editing = !this.city;
    this.input = InputState.new({ placeholder: "City, e.g. Hobart or New York", value: this.city });
    this.input.on("submit", (_e, cx) => this.setCity(this.input.value(), cx));
    cx.timer.every(EVERY, (cx) => this.fetch(cx));
    cx.spawn(async (cx) => {
      if (!this.city) {
        const seed = tidyCity(await readTextFile(`${appHome()}/data/weather/city.txt`).catch(() => null) ?? "");
        if (seed && !this.city) { this.setCity(seed, cx); return; }
      }
      if (this.city && (!this.cache || Date.now() - this.cache.at > FRESH)) this.fetch(cx);
      cx.notify();
    });
  }

  setCity(raw, cx) {
    const city = tidyCity(raw);
    if (!city) return;
    this.editing = false;
    if (city === this.city && this.cache) { cx.notify(); return; }
    this.city = city;
    this.input.set_value(city);
    store.set("weather:city", city);
    this.cache = null;
    this.error = null;
    this.fetch(cx);
    cx.notify();
  }

  fetch(cx) {
    const city = this.city;
    if (!city || this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await Promise.race([fetch(urlFor(city)), cx.sleep(TIMEOUT).then(() => { throw new Error("timeout"); })]);
        if (r.status === 404) throw new Error(`wttr.in doesn't know “${city}”. Try another spelling, or add the country.`);
        if (!r.ok) throw new Error(`wttr.in answered ${r.status}. It'll try again in 30 minutes.`);
        const text = await r.text();
        let json;
        try { json = JSON.parse(text); } catch { throw new Error(/unknown location/i.test(text) ? `wttr.in doesn't know “${city}”.` : "wttr.in sent something unexpected."); }
        const data = summarize(json);
        if (this.city === city) {
          this.cache = { city, at: Date.now(), data };
          store.set("weather:cache", this.cache);
          this.error = null;
          this.offline = false;
        }
      } catch (e) {
        if (this.city === city) {
          const s = String(e.message ?? e);
          const net = /timeout|network|connect|dns|resolve|refused|offline|unreachable|error sending/i.test(s) && !/wttr\.in/.test(s);
          this.offline = net;
          this.error = net ? (s === "timeout" ? "wttr.in didn't answer in 20 seconds." : "Offline: can't reach wttr.in.") : s;
        }
      }
      this.busy = false;
      cx.notify();
    });
  }

  deg(c, f) {
    const v = this.unit === "f" ? f : c;
    return v === null || v === undefined ? "–" : `${Math.round(v)}°`;
  }

  tint(t, kind) {
    return { sun: t.working, partly: t.working, rain: t.accent, storm: t.blocked, snow: t.muted, fog: t.dim, cloud: t.muted }[kind] ?? t.muted;
  }

  render() {
    const t = theme();
    const d = this.cache?.data ?? null;
    const today = localDate(Date.now());
    const lo = d ? Math.min(...d.days.map((x) => (this.unit === "f" ? x.minF : x.minC) ?? Infinity)) : 0;
    const hi = d ? Math.max(...d.days.map((x) => (this.unit === "f" ? x.maxF : x.maxC) ?? -Infinity)) : 1;
    const link = (id, label, action, on = false) => div().id(id).flex_none().px(6).py(2).rounded(5).text_size(11).cursor_pointer()
      .text_color(on ? t.foreground : t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
    let sub;
    if (!this.city) sub = "Pick a city";
    else if (this.busy && !d) sub = "Asking wttr.in…";
    else if (d && this.error) sub = `${this.offline ? "Offline" : "Not updated"} · from ${clock(this.cache.at)}${localDate(this.cache.at) === today ? "" : ` on ${localDate(this.cache.at)}`}`;
    else if (d) sub = `${d.area && d.area.toLowerCase() !== this.city.toLowerCase() ? `near ${d.area} · ` : ""}updated ${clock(this.cache.at)}`;
    else sub = "";

    return v_flex().id("weather").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(360) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(4).items_center()
        .child(v_flex().id("wx-title").flex_1().min_w(0).cursor_pointer().on_mouse_down("left", stop)
          .tooltip("Change the city").on_click((_e, cx) => { this.editing = !this.editing; if (this.editing) this.input.focus(); cx.notify(); })
          .child(div().truncate().font_semibold().text_color(t.foreground).child(this.city ? `Weather · ${this.city}` : "Weather"))
          .child(div().truncate().text_size(11).text_color(d && this.error ? t.working : t.dim).child(sub)))
        .child(link("wx-unit", this.unit === "f" ? "°F" : "°C", (_e, cx) => { this.unit = this.unit === "f" ? "c" : "f"; store.set("weather:unit", this.unit); cx.notify(); }))
        .when(Boolean(this.city), (el) => el.child(link("wx-refresh", this.busy ? "…" : "refresh", (_e, cx) => this.fetch(cx))))
        .when(Boolean(this.overlay), (el) => el.child(div().id("wx-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(this.editing || !this.city, (el) => el.child(h_flex().flex_none().mx(12).mb(8).gap(6).on_mouse_down("left", stop)
        .child(div().flex_1().min_w(0).child(Input.new(this.input).h(30).px(9).rounded(7).border_1().border_color(t.input)
          .bg(t.background).text_size(12.5).text_color(t.foreground)))
        .child(div().id("wx-set").flex_none().h(30).px(12).flex().items_center().rounded(7).font_medium().bg(t.solid).text_color(t.solid_foreground)
          .cursor_pointer().hover((s) => s.opacity(0.9)).on_click((_e, cx) => this.setCity(this.input.value(), cx)).child("Show"))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).pb(6).text_size(11.5).text_color(d ? t.working : t.blocked).child(this.error)))
      .when(!this.city, (el) => el.child(div().px(16).py(4).text_color(t.dim).child("Type a city and press Enter. Only its name is sent, to wttr.in.")))
      .when(Boolean(d), (el) => el
        .child(h_flex().flex_none().mx(12).px(12).py(12).gap(14).items_center().rounded(10).bg(t.background).border_1().border_color(t.border)
          .child(svg(icon(kindOf(d.now.code))).size(44).flex_none().text_color(this.tint(t, kindOf(d.now.code))))
          .child(v_flex().flex_1().min_w(0)
            .child(h_flex().gap(8).items_baseline()
              .child(div().flex_none().text_size(36).font_semibold().text_color(t.foreground).child(this.deg(d.now.c, d.now.f)))
              .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.muted).child(d.now.desc || "")))
            .child(div().truncate().text_size(11).text_color(t.dim).child([
              `feels ${this.deg(d.now.feelsC, d.now.feelsF)}`,
              d.now.humidity !== null ? `humidity ${d.now.humidity}%` : "",
              d.now.kmph !== null ? `wind ${this.unit === "f" ? `${d.now.mph} mph` : `${d.now.kmph} km/h`} ${d.now.dir}` : "",
            ].filter(Boolean).join(" · ")))))
        .child(v_flex().flex_none().mx(12).mt(8).gap(2)
          .children(d.days.map((day, i) => {
            const k = kindOf(day.code);
            const min = this.unit === "f" ? day.minF : day.minC, max = this.unit === "f" ? day.maxF : day.maxC;
            const bar = rangeBar(min, max, lo, hi);
            const wet = day.snow > day.rain ? `snow ${day.snow}%` : day.rain > 0 ? `rain ${day.rain}%` : "";
            return h_flex().id(`day-${i}`).flex_none().h(34).px(10).gap(10).items_center().rounded(7).tooltip(day.desc || day.date)
              .child(div().w(70).flex_none().truncate().font_medium().text_color(t.foreground).child(dayLabel(day.date, today)))
              .child(svg(icon(k)).size(18).flex_none().text_color(this.tint(t, k)))
              .child(div().w(58).flex_none().truncate().text_size(11).text_color(day.rain >= 50 || day.snow >= 50 ? t.accent : t.dim).child(wet))
              .child(div().w(30).flex_none().text_size(12).text_color(t.dim).flex().justify_end().child(this.deg(day.minC, day.minF)))
              .child(div().flex_1().h(5).rounded(3).bg(t.raised).relative()
                .child(div().absolute().top(0).h(5).rounded(3).bg(t.working)
                  .left(`${Math.round(bar.from * 100)}%`).w(`${Math.max(6, Math.round((bar.to - bar.from) * 100))}%`)))
              .child(div().w(30).flex_none().text_size(12).font_medium().text_color(t.foreground).flex().justify_end().child(this.deg(day.maxC, day.maxF)));
          }))))
      .when(Boolean(this.city), (el) => el.child(div().flex_none().px(16).pt(8).text_size(10.5).text_color(t.dim)
        .child("From wttr.in · asks every 30 minutes while open · click the title to change the city")));
  }
}
