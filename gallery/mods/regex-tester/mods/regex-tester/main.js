// Regex tester: a pattern, its flags and some text to try it on. The matches light up in the
// text, and each one is listed with its capture groups (named ones by name). Common patterns
// (email, URL, IPv4, date, UUID, semver, ...) are a click away. It runs this app's JavaScript
// regex engine, so what matches here matches in JavaScript. Nothing is sent anywhere; the last
// pattern and text are kept in this mod's localStorage. On first open, an example in
// data/regex-tester/example.json under the app folder ({ pattern, flags, text }) fills it in.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { appHome, readTextFile, settings, theme, props, closeOverlay } from "woolshed";
import { FLAGS, SNIPPETS, splitLiteral, normalizeFlags, compile, findMatches, pieces, position, showText } from "./parse.js";

const MAX_TEXT = 20000;
const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ } },
};

export default class RegexTester extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    const kept = store.get("regex-tester");
    this.flags = normalizeFlags(kept?.flags ?? "g");
    this.note = null;
    this.pattern = InputState.new({ placeholder: "pattern, e.g. (\\d{4})-(\\d{2})", value: kept?.pattern ?? "" });
    this.text = TextareaState.new({ placeholder: "Text to test the pattern on", value: kept?.text ?? "", rows: 5 });
    this.pattern.on("change", (_e, cx) => {
      // A whole literal pasted (/abc/gi) splits into pattern and flags.
      const lit = splitLiteral(this.pattern.value());
      if (lit) { this.flags = normalizeFlags(lit.flags); this.pattern.set_value(lit.pattern); }
      this.update(cx);
    });
    this.text.on("change", (_e, cx) => this.update(cx));
    this.compute();
    if (!kept) {
      cx.spawn(async (cx) => {
        const raw = await readTextFile(`${appHome()}/data/regex-tester/example.json`).catch(() => null);
        let ex = null;
        try { ex = raw ? JSON.parse(raw) : null; } catch { ex = null; }
        if (ex && !this.pattern.value() && !this.text.value()) {
          this.flags = normalizeFlags(ex.flags ?? "g");
          this.pattern.set_value(String(ex.pattern ?? ""));
          this.text.set_value(String(ex.text ?? ""));
          this.compute();
          cx.notify();
        }
      });
    }
  }

  update(cx) {
    this.wait?.cancel();
    this.wait = cx.timer.after(120, (cx) => { this.compute(); store.set("regex-tester", { pattern: this.pattern.value(), flags: this.flags, text: this.text.value().slice(0, MAX_TEXT) }); cx.notify(); });
  }

  compute() {
    const text = this.text.value().slice(0, MAX_TEXT);
    this.compiled = compile(this.pattern.value(), this.flags);
    this.found = findMatches(this.compiled, text);
    this.cut = pieces(text, this.found.matches);
    this.shown = text;
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(1800, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const c = this.compiled;
    const { matches, capped } = this.found;
    const groups = matches[0]?.groups.length ?? 0;
    const pattern = this.pattern.value();
    const hasText = Boolean(this.shown);
    let status, statusColor = t.dim;
    if (c.error) { status = c.error; statusColor = t.blocked; }
    else if (!pattern) status = "Type a pattern, or pick a common one below";
    else if (!hasText) status = "Add some text to test it on";
    else if (!matches.length) { status = "No match"; statusColor = t.working; }
    else { status = `${matches.length}${capped ? "+" : ""} ${matches.length === 1 ? "match" : "matches"}${groups ? ` · ${groups} ${groups === 1 ? "group" : "groups"}` : ""}${!c.global && !c.sticky ? " · first only (add g for all)" : ""}`; statusColor = t.done; }
    const flagChip = ([f, about]) => div().id(`flag-${f}`).flex_none().w(24).h(24).flex().items_center().justify_center().rounded(6)
      .font_family(mono).text_size(12).cursor_pointer().tooltip(about)
      .bg(this.flags.includes(f) ? t.selected : t.raised).text_color(this.flags.includes(f) ? t.foreground : t.dim)
      .when(this.flags.includes(f), (el) => el.font_semibold())
      .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.flags = normalizeFlags(this.flags.includes(f) ? this.flags.replace(f, "") : this.flags + f); this.update(cx); cx.notify(); })
      .child(f);
    const lineEl = (line, i) => h_flex().id(`line-${i}`).min_h(18).overflow_hidden().items_center()
      .children(line.map((p, k) => p.empty
        ? div().w(2).h(14).flex_none().bg(t.accent)
        : div().flex_none().whitespace_nowrap()
          .when(p.match !== null, (el) => el.rounded(3).bg(p.match % 2 ? t.hover : t.selection).border_b_1().border_color(t.accent))
          .text_color(p.match !== null ? t.foreground : t.muted).child(p.text)))
      .when(!line.length, (el) => el.child(div().child(" ")));

    return v_flex().id("regex-tester").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(540) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child("Regex"))
          .child(div().truncate().text_size(11).text_color(statusColor).child(status)))
        .when(Boolean(this.overlay), (el) => el.child(div().id("rx-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(h_flex().flex_none().mx(12).gap(6).items_center()
        .child(h_flex().flex_1().min_w(0).h(32).pl(10).pr(4).gap(4).items_center().rounded(7).border_1()
          .border_color(c.error ? t.blocked : t.input).bg(t.background).font_family(mono).on_mouse_down("left", stop)
          .child(div().flex_none().text_color(t.dim).child("/"))
          .child(div().flex_1().min_w(0).child(Input.new(this.pattern).h(30).text_size(12.5).text_color(t.foreground)))
          .child(div().flex_none().text_color(t.dim).child(`/${this.flags}`)))
        .children(FLAGS.map(flagChip)))
      .child(h_flex().flex_none().mx(12).mt(8).gap(4).flex_wrap()
        .children(SNIPPETS.map(([name, src]) => div().id(`snip-${name}`).flex_none().h(22).px(8).flex().items_center().rounded(11)
          .text_size(11).cursor_pointer().border_1().border_color(pattern === src ? t.accent : t.border)
          .text_color(pattern === src ? t.foreground : t.muted).tooltip(src)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.pattern.set_value(src); this.compute(); cx.notify(); }).child(name))))
      .child(div().flex_none().mx(12).mt(8).h(104).on_mouse_down("left", stop)
        .child(Textarea.new(this.text).w_full().h_full().px(10).py(8).rounded(7).border_1().border_color(t.input)
          .bg(t.background).font_family(mono).text_size(12).text_color(t.foreground)))
      .when(hasText && Boolean(pattern) && !c.error, (el) => el
        .child(div().flex_none().mx(16).mt(10).mb(4).text_size(11).text_color(t.dim).child("In the text"))
        .child(v_flex().id("rx-view").flex_none().mx(12).max_h(140).px(10).py(6).rounded(7).bg(t.background).border_1().border_color(t.border)
          .overflow_y_scrollbar().font_family(mono).text_size(12)
          .children(this.cut.lines.map(lineEl))
          .when(this.cut.more > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(`… ${this.cut.more} more lines`)))))
      .when(matches.length > 0, (el) => el
        .child(div().flex_none().mx(16).mt(10).mb(4).text_size(11).text_color(t.dim).child("Matches · click one to copy it"))
        .child(v_flex().id("rx-matches").flex_none().mx(6).gap(1).overflow_y_scrollbar()
          .map((el) => (this.overlay ? el.max_h(170) : el.flex_1().min_h(0)))
          .children(matches.slice(0, 200).map((m, i) => {
            const at = position(this.shown, m.index);
            return v_flex().id(`m-${i}`).flex_none().px(10).py(4).rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
              .on_mouse_down("left", stop).on_click((_e, cx) => { cx.write_to_clipboard(m.text); this.flash(`Copied match ${i + 1}.`, cx); })
              .child(h_flex().gap(8).items_center()
                .child(div().w(20).flex_none().text_size(11).text_color(t.dim).child(String(i + 1)))
                .child(div().flex_1().min_w(0).truncate().font_family(mono).text_size(12).text_color(t.foreground).child(showText(m.text)))
                .child(div().flex_none().text_size(10.5).text_color(t.dim).child(`line ${at.line}, col ${at.col}`)))
              .when(m.groups.length > 0, (el) => el.child(h_flex().pl(28).gap(10).flex_wrap()
                .children(m.groups.map((g) => h_flex().gap(4).items_center().text_size(11)
                  .child(div().flex_none().text_color(t.accent).child(g.name ? g.name : `$${g.n}`))
                  .child(div().flex_none().max_w(180).truncate().font_family(mono).text_color(g.text === undefined ? t.dim : t.muted).child(showText(g.text)))))));
          }))))
      .child(div().flex_none().px(16).pt(8).text_size(10.5).text_color(this.note ? t.foreground : t.dim).truncate()
        .child(this.note ?? (this.text.value().length > MAX_TEXT ? `Only the first ${MAX_TEXT} characters are tested.` : "JavaScript regex syntax. Paste /pattern/flags to fill both.")));
  }
}
