// Time convert: paste a Unix timestamp (s, ms, µs or ns), an ISO 8601 date, an
// RFC 2822 date or a JavaScript date and see it in local time, UTC, as a Unix
// timestamp, relative to now and in the zones you pick; Copy on every row.
// With nothing pasted it shows now. Zones live in shared `time-convert.zones`.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, theme, props, closeOverlay, settings, appHome, readTextFile } from "woolshed";
import { detect, rows } from "./parse.js";
import { zone, search, allZones } from "./zones.js";

const KEY = "time-convert.zones";
const DEFAULT_ZONES = ["America/Los_Angeles", "Europe/London", "Asia/Tokyo"];
const MAX = 8;
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

function zones() {
  const ids = Array.isArray(shared(KEY)) ? shared(KEY) : DEFAULT_ZONES;
  return ids.map((id) => (typeof id === "string" ? zone(id) : null)).filter(Boolean).slice(0, MAX);
}

export default class TimeConvert extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.text = String(props()?.text ?? "");
    this.copied = null;
    this.adding = false;
    this.query = "";
    this.input = InputState.new({ placeholder: "Paste a time: 1794366000, 2026-11-11T03:00:00Z, Wed, 11 Nov 2026 14:00 +1100", value: this.text });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.search = InputState.new({ placeholder: "City, country or zone" });
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); cx.notify(); });
    this.search.on("submit", (_e, cx) => { const z = this.results()[0]; if (z) this.addZone(z.id); cx.notify(); });
    // With nothing pasted it shows now: keep that current, once a minute.
    cx.timer.every(60000, (cx) => { if (!this.text.trim()) cx.notify(); });
    if (this.overlay) this.input.focus();
    if (!this.text) cx.spawn(async (cx) => { await this.example(); cx.notify(); });
  }

  // An example to show on a first look (the gallery preview writes one): data/time-convert/example.json,
  // { "text": "1794366000000" }, put in the field once each time the file changes.
  async example() {
    const raw = await readTextFile(`${appHome()}/data/time-convert/example.json`).catch(() => null);
    if (!raw || shared("time-convert.example") === hash(raw)) return;
    setShared("time-convert.example", hash(raw));
    let ex;
    try { ex = JSON.parse(raw); } catch { return; }
    if (typeof ex.text !== "string" || this.text) return;
    this.text = ex.text;
    this.input.set_value(ex.text);
  }

  results() {
    const have = new Set(zones().map((z) => z.id));
    return search(this.query, allZones()).filter((z) => !have.has(z.id)).slice(0, 6);
  }
  addZone(id) {
    const ids = zones().map((z) => z.id);
    if (!ids.includes(id)) setShared(KEY, [...ids, id].slice(-MAX));
    this.search.set_value("");
    this.query = "";
    this.adding = false;
  }
  removeZone(id) { setShared(KEY, zones().map((z) => z.id).filter((z) => z !== id)); }

  copy(cx, id, text) {
    cx.write_to_clipboard(text);
    this.copied = id;
    this.clear?.cancel();
    this.clear = cx.timer.after(1500, (cx) => { this.copied = null; cx.notify(); });
  }

  render() {
    const t = theme();
    const now = Date.now();
    const mono = settings()?.font_family ?? "JetBrains Mono";
    const stop = (_e, cx) => cx.stop_propagation();
    const typed = this.text.trim();
    const found = typed ? detect(typed, now) : { at: now, kind: "now", offset: null };
    const list = found.error ? [] : rows(found.at, now, zones());
    const header = h_flex().flex_none().items_center().gap(8)
      .child(svg("mods/time-convert/convert.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("Time convert"))
      .when(Boolean(this.overlay), (el) => el.child(div().id("tc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => closeOverlay(this.overlay)).child("✕")));
    const field = h_flex().flex_none().h(34).px(10).gap(8).items_center().rounded(8).border_1().border_color(found.error ? t.blocked : t.accent).bg(t.background).cursor_text()
      .on_mouse_down("left", stop)
      .child(div().flex_1().min_w(0).h_full().child(Input.new(this.input).w_full().h_full().text_size(12.5).text_color(t.foreground).font_family(mono)))
      .when(Boolean(typed), (el) => el.child(div().id("tc-clear").size(20).flex_none().flex().items_center().justify_center().rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { this.input.set_value(""); this.text = ""; this.input.focus(); cx.notify(); })
        .tooltip("Clear").child("✕")));
    const what = div().flex_none().text_size(11.5)
      .text_color(found.error ? t.blocked : t.dim)
      .child(found.error
        ? `${found.error}. Try 1794366000, 1794366000000, 2026-11-11T14:00:00+11:00 or Wed, 11 Nov 2026 03:00:00 GMT.`
        : found.kind === "now" ? "Showing now: paste a time to convert it"
        : `Read as ${found.kind}${found.offset === null ? ", in this computer's time" : ""}`);
    const row = (r) => h_flex().id(`tc-${r.id}`).flex_none().h(28).px(8).gap(10).items_center().rounded(6)
      .hover((s) => s.bg(t.hover))
      .child(div().w(84).flex_none().truncate().text_size(11.5).text_color(r.zone ? t.muted : t.dim).child(r.label))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_family(mono).text_color(t.foreground).child(r.text))
      .when(Boolean(r.zone), (el) => el.child(div().id(`tc-x-${r.id}`).size(18).flex_none().flex().items_center().justify_center().rounded(5).text_size(10).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.removeZone(r.zone); cx.notify(); })
        .tooltip("Remove this zone").child("✕")))
      .child(div().id(`tc-c-${r.id}`).w(52).h(22).flex_none().flex().items_center().justify_center().rounded(5).text_size(11).cursor_pointer()
        .bg(this.copied === r.id ? t.selected : t.raised).text_color(this.copied === r.id ? t.done : t.foreground)
        .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.copy(cx, r.id, r.copy); cx.notify(); })
        .tooltip(r.copy)
        .child(this.copied === r.id ? "Copied" : "Copy"));
    const zoneAdd = this.adding
      ? v_flex().flex_none().gap(4)
        .child(div().h(28).px(8).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.background).cursor_text().on_mouse_down("left", stop)
          .child(Input.new(this.search).w_full().h_full().text_size(12).text_color(t.foreground)))
        .children(this.results().map((z) => h_flex().id(`tc-r-${z.id}`).h(24).px(8).gap(8).items_center().rounded(6).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.addZone(z.id); cx.notify(); })
          .child(div().flex_none().text_color(t.foreground).child(z.city))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${z.country} · ${z.id}`))))
      : null;
    const body = v_flex().id("time-convert").p(12).pt(10).gap(8).text_size(12.5).bg(this.overlay ? t.popover : t.chrome)
      .child(header).child(field).child(what)
      .when(list.length > 0, (el) => el.child(v_flex().id("tc-rows").flex_none().children(list.map(row))))
      .child(h_flex().flex_none().gap(6).items_center()
        .child(div().flex_1())
        .when(zones().length < MAX, (el) => el.child(div().id("tc-add").h(24).px(8).flex().items_center().rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.adding = !this.adding; if (this.adding) this.search.focus(); cx.notify(); })
          .child(this.adding ? "Done" : "+ Add zone"))))
      .when(Boolean(zoneAdd), (el) => el.child(zoneAdd));
    return this.overlay ? body.w(480) : body.size_full().min_h(0).overflow_y_scrollbar();
  }
}
