// Color swatch: paste some colors (hex, rgb(), hsl(), from CSS or anywhere) and see them as
// swatches with each format to copy. Pick two (A on B) for their WCAG contrast ratio and whether
// it passes AA and AAA. Below, the colors of the theme you're using, by name, to copy.
// Nothing is sent anywhere; what you pasted is kept in this mod's localStorage. On first open,
// data/color-swatch/example.txt under the app folder, if there, fills the box.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { appHome, readTextFile, settings, theme, props, closeOverlay } from "woolshed";
import { extractColors, toHex, toRgb, toHsl, contrast, wcag, ratioText, themeColors } from "./parse.js";

const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not kept */ } },
};
const opaque = (hex) => hex.slice(0, 7);

export default class ColorSwatch extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    const kept = store.get("color-swatch:text");
    this.input = TextareaState.new({ placeholder: "Paste colors: #1e66f5, rgb(30 102 245), hsl(220 91% 54%)…", value: kept ?? "", rows: 3 });
    this.pair = [0, 1];
    this.note = null;
    this.showTheme = store.get("color-swatch:theme") !== "closed";
    this.colors = extractColors(kept ?? "");
    this.input.on("change", (_e, cx) => {
      this.colors = extractColors(this.input.value());
      store.set("color-swatch:text", this.input.value().slice(0, 20000));
      this.fixPair();
      cx.notify();
    });
    if (kept === null) {
      cx.spawn(async (cx) => {
        const text = await readTextFile(`${appHome()}/data/color-swatch/example.txt`).catch(() => null);
        if (text && !this.input.value()) { this.input.set_value(text); this.colors = extractColors(text); this.fixPair(); cx.notify(); }
      });
    }
  }

  fixPair() {
    const n = this.colors.length;
    this.pair = this.pair.map((i, k) => (i < n ? i : Math.min(k, Math.max(0, n - 1))));
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(1800, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  copy(text, cx) { cx.write_to_clipboard(text); this.flash(`Copied ${text}`, cx); }

  card(t, mono, entry, i) {
    const hex = toHex(entry.c);
    const pick = (slot) => div().id(`pick-${slot}-${i}`).flex_none().w(18).h(18).flex().items_center().justify_center().rounded(4)
      .text_size(10).font_semibold().cursor_pointer()
      .bg(this.pair[slot] === i ? t.solid : t.raised).text_color(this.pair[slot] === i ? t.solid_foreground : t.dim)
      .tooltip(slot === 0 ? "Use as the text color (A)" : "Use as the background (B)")
      .on_mouse_down("left", stop).on_click((_e, cx) => { this.pair[slot] = i; cx.notify(); }).child(slot === 0 ? "A" : "B");
    const line = (id, text, color) => div().id(id).truncate().font_family(mono).text_size(10.5).text_color(color).cursor_pointer()
      .hover((s) => s.text_color(t.foreground)).tooltip(`Copy ${text}`).on_mouse_down("left", stop)
      .on_click((_e, cx) => this.copy(text, cx)).child(text);
    return v_flex().flex_none().w(122).rounded(8).border_1().border_color(t.border).bg(t.background).overflow_hidden()
      .child(div().id(`sw-${i}`).h(42).bg(hex).border_b_1().border_color(t.border).cursor_pointer().tooltip(`Copy ${hex}`)
        .on_mouse_down("left", stop).on_click((_e, cx) => this.copy(hex, cx)))
      .child(v_flex().px(7).py(5).gap(1)
        .child(h_flex().gap(3).items_center()
          .child(div().flex_1().min_w(0).child(line(`hex-${i}`, hex, t.foreground)))
          .child(pick(0)).child(pick(1)))
        .child(line(`rgb-${i}`, toRgb(entry.c), t.dim))
        .child(line(`hsl-${i}`, toHsl(entry.c), t.dim)));
  }

  contrastPanel(t, mono) {
    const a = this.colors[this.pair[0]], b = this.colors[this.pair[1]];
    if (!a || !b) return null;
    const ratio = contrast(a.c, b.c);
    const fg = toHex(a.c), bg = toHex(b.c);
    return v_flex().flex_none().mx(12).mt(10).p(10).gap(8).rounded(8).border_1().border_color(t.border).bg(t.background)
      .child(h_flex().gap(10).items_center()
        .child(v_flex().flex_none().w(150).h(56).px(10).justify_center().rounded(6).border_1().border_color(t.border).bg(bg)
          .child(div().text_size(18).font_semibold().text_color(fg).child("Aa"))
          .child(div().text_size(11).text_color(fg).truncate().child("The quick brown fox")))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(4).items_baseline()
            .child(div().font_family(mono).text_size(22).font_semibold().text_color(t.foreground).child(ratioText(ratio)))
            .child(div().text_size(12).text_color(t.dim).child(": 1")))
          .child(div().truncate().font_family(mono).text_size(10.5).text_color(t.dim).child(`A ${opaque(fg)} on B ${opaque(bg)}`)))
        .child(div().id("cs-swap").flex_none().h(24).px(8).flex().items_center().rounded(6).text_size(11).bg(t.raised).text_color(t.foreground)
          .cursor_pointer().hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.pair = [this.pair[1], this.pair[0]]; cx.notify(); }).child("⇄ swap")))
      .child(h_flex().gap(4).flex_wrap()
        .children(wcag(ratio).map(([name, about, pass]) => h_flex().id(`w-${name}`).flex_none().h(22).px(7).gap(4).items_center().rounded(5)
          .bg(t.raised).tooltip(about)
          .child(div().text_size(11).font_semibold().text_color(pass ? t.done : t.blocked).child(pass ? "✓" : "✗"))
          .child(div().text_size(11).text_color(pass ? t.foreground : t.muted).child(name)))));
  }

  themeList(t, mono) {
    const { named, ansi } = themeColors(t);
    return v_flex().flex_none().gap(6)
      .child(h_flex().id("cs-theme").mx(16).mt(12).gap(6).items_center().cursor_pointer().on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.showTheme = !this.showTheme; store.set("color-swatch:theme", this.showTheme ? "open" : "closed"); cx.notify(); })
        .child(div().text_size(11).text_color(t.dim).child(`${this.showTheme ? "▾" : "▸"} This theme's colors${typeof settings().theme === "string" ? ` · ${settings().theme}` : ""}`)))
      .when(this.showTheme, (el) => el
        .child(h_flex().mx(12).gap(2).flex_wrap()
          .children(named.map(([name, hex]) => h_flex().id(`t-${name}`).flex_none().w(129).h(24).px(6).gap(6).items_center().rounded(5).cursor_pointer()
            .hover((s) => s.bg(t.hover)).tooltip(`Copy ${hex}`).on_mouse_down("left", stop).on_click((_e, cx) => this.copy(hex, cx))
            .child(div().size(14).flex_none().rounded(4).border_1().border_color(t.border).bg(hex))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.foreground).child(name)))))
        .when(ansi.length > 0, (el) => el.child(h_flex().mx(16).gap(3).items_center()
          .child(div().w(34).flex_none().text_size(10.5).text_color(t.dim).child("ANSI"))
          .children(ansi.map(([name, hex]) => div().id(`t-${name}`).flex_1().h(18).rounded(3).border_1().border_color(t.border).bg(hex)
            .cursor_pointer().tooltip(`${name} ${hex}: click to copy`).on_mouse_down("left", stop).on_click((_e, cx) => this.copy(hex, cx)))))));
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const n = this.colors.length;
    return v_flex().id("color-swatch").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(424) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child("Colors"))
          .child(div().truncate().text_size(11).text_color(t.dim).child(n ? `${n} color${n === 1 ? "" : "s"}${n > 1 ? " · pick A and B for contrast" : ""}` : "Paste colors to see them")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("cs-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(v_flex().id("cs-body").flex_none().overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(620) : el.flex_1().min_h(0)))
        .child(div().flex_none().mx(12).h(64).on_mouse_down("left", stop)
          .child(Textarea.new(this.input).w_full().h_full().px(10).py(7).rounded(7).border_1().border_color(t.input)
            .bg(t.background).font_family(mono).text_size(12).text_color(t.foreground)))
        .when(n > 0, (el) => el.child(h_flex().mx(12).mt(10).gap(8).flex_wrap()
          .children(this.colors.slice(0, 24).map((e, i) => this.card(t, mono, e, i)))))
        .when(Boolean(this.input.value().trim()) && !n, (el) => el.child(div().px(16).pt(8).text_size(11.5).text_color(t.working)
          .child("No colors found. Try #rrggbb, rgb(r g b) or hsl(h s% l%).")))
        .when(n > 1, (el) => el.child(this.contrastPanel(t, mono)))
        .when(n === 1, (el) => el.child(div().px(16).pt(8).text_size(11).text_color(t.dim).child("Add a second color to see their contrast.")))
        .child(this.themeList(t, mono)))
      .child(div().flex_none().px(16).pt(8).text_size(10.5).text_color(this.note ? t.foreground : t.dim).truncate()
        .child(this.note ?? (n > 24 ? `Showing 24 of ${n} colors.` : "Click a swatch or a value to copy it.")));
  }
}
