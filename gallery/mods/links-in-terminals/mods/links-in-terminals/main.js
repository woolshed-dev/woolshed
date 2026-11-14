// Links in terminals: every address that showed up in the shown tab's
// terminals (a dev server's localhost, a pull request a push printed, docs an
// agent mentioned), newest first, one click to open. It reads the terminals'
// text with `hc read <t> --lines 200` when it opens, when the tab changes and
// on Refresh; nothing in the background.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, spaces, focused, hc, theme, props, closeOverlay } from "woolshed";
import { collect, shortUrl } from "./parse.js";

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clock = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// The shown tab and its terminal panes, each with a name people know it by.
function shownTab() {
  const f = focused();
  if (!f?.tab) return null;
  const space = spaces().find((s) => s.tabs.some((t) => t.id === f.tab));
  const tab = space?.tabs.find((t) => t.id === f.tab);
  const list = panes().filter((p) => p.tab === f.tab && p.terminal);
  const names = list.map((p) => p.program?.name || "terminal");
  const terms = list.map((p, i) => ({
    address: p.terminal,
    name: names.filter((n) => n === names[i]).length > 1 ? `${names[i]} (${p.terminal.split("/").pop()})` : names[i],
  }));
  return { id: f.tab, label: space ? `${space.name} · ${tab?.name ?? ""}` : "this tab", terms };
}

export default class LinksInTerminals extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.links = null;
    this.tab = null;
    this.reading = false;
    this.read = null;
    this.failed = [];
    this.note = null;
    this.hover = null;
  }

  refresh(shown, cx) {
    if (this.reading) { this.again = true; return; }
    this.reading = true;
    this.tab = shown?.id ?? null;
    cx.spawn(async (cx) => {
      const outputs = [];
      const failed = [];
      for (const term of shown?.terms ?? []) {
        try {
          const r = await hc(["read", term.address, "--json", "--lines", "200"]);
          if (r.code !== 0) { failed.push(term.name); continue; }
          let text = r.stdout;
          try { text = JSON.parse(r.stdout).text ?? ""; } catch {}
          outputs.push({ source: term.name, text });
        } catch { failed.push(term.name); }
      }
      if (this.tab === (shown?.id ?? null)) {
        this.links = collect(outputs);
        this.failed = failed;
        this.read = new Date();
      }
      this.reading = false;
      if (this.again) { this.again = false; this.refresh(shownTab(), cx); }
      cx.notify();
    });
    cx.notify();
  }

  open(url, cx) {
    // 0.0.0.0 is where a server listens, not an address browsers like.
    const target = url.replace(/^(https?:\/\/)0\.0\.0\.0(?=[:/]|$)/i, "$1localhost");
    try { cx.open_url(target); this.note = null; }
    catch (e) { this.note = { bad: true, text: `Couldn't open it: ${String(e.message ?? e)}` }; }
    cx.notify();
  }

  row(t, link, i) {
    const stop = (_e, cx) => cx.stop_propagation();
    const id = `lt-${i}`;
    const short = shortUrl(link.url);
    const cut = short.indexOf("/");
    const host = cut < 0 ? short : short.slice(0, cut);
    const path = cut < 0 ? "" : short.slice(cut);
    const hover = this.hover === link.url;
    return h_flex().id(id).flex_none().mx(6).px(10).py(6).gap(10).items_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h || hover) { this.hover = h ? link.url : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => this.open(link.url, cx))
      .tooltip(link.url)
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().min_w(0).gap(0).text_size(12.5)
          .child(div().flex_none().font_medium().text_color(t.foreground).child(host))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(path)))
        .child(div().truncate().text_size(11).text_color(t.dim).child(link.sources.join(", "))))
      .when(link.local, (el) => el.child(div().flex_none().px(6).py(1).rounded(5).text_size(10.5).font_medium()
        .bg(alpha(t.accent, "22")).text_color(t.accent).child("local")))
      .when(hover, (el) => el.child(div().id(`${id}-copy`).flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim)
        .hover((s) => s.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(link.url); this.note = { bad: false, text: `Copied ${short}` }; cx.notify(); })
        .child("Copy")));
  }

  render(cx) {
    const t = theme();
    const shown = shownTab();
    // Reads again when it opens and whenever another tab is shown.
    if ((shown?.id ?? null) !== this.tab && !this.reading) this.refresh(shown, cx);
    const stop = (_e, cx) => cx.stop_propagation();
    const links = this.links ?? [];
    const empty = (text) => div().px(16).py(10).text_size(12.5).text_color(t.dim).child(text);
    const terms = shown?.terms.length ?? 0;
    const status = this.reading ? "Reading…"
      : !shown ? ""
      : `${links.length} link${links.length === 1 ? "" : "s"} from ${terms} terminal${terms === 1 ? "" : "s"}${this.read ? ` · read ${clock(this.read)}` : ""}`;
    return v_flex().id("links-in-terminals").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(44).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Links in this tab"))
          .child(div().truncate().text_size(12.5).font_semibold().text_color(t.foreground).child(shown?.label ?? "No tab shown")))
        .child(div().id("lt-refresh").h(22).px(8).flex().items_center().rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.refresh(shownTab(), cx)).child(this.reading ? "Reading…" : "Refresh"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("lt-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(v_flex().id("lt-rows").py(4).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(420) : el.flex_1().min_h(0)))
        .when(!shown, (el) => el.child(empty("Open a space to see the links in its terminals.")))
        .when(Boolean(shown) && !terms, (el) => el.child(empty("This tab has no terminals.")))
        .when(Boolean(shown) && terms > 0 && this.links === null, (el) => el.child(empty("Reading the terminals…")))
        .when(Boolean(shown) && terms > 0 && this.links !== null && !links.length, (el) => el.child(empty("No links in this tab's terminals yet. When a server or an agent prints one, Refresh.")))
        .children(links.map((l, i) => this.row(t, l, i))))
      .when(this.failed.length > 0, (el) => el.child(div().flex_none().px(16).py(4).text_size(11).text_color(t.blocked)
        .child(`Couldn't read ${this.failed.join(", ")}`)))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : t.dim)
        .child(this.note?.text ?? status));
  }
}
