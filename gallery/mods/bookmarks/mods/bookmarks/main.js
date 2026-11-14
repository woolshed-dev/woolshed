// Bookmarks: the links you keep opening for a project (staging, a dashboard,
// the pull request, the docs) and for everything else. Each list is a markdown
// file of "- [Title](https://…)" lines in data/bookmarks/ under the app folder,
// one per project folder plus everywhere.md, so a person or an agent can add to
// it too; this window follows. Clicking opens the link in the browser. Every
// change reads the file fresh and writes only if nobody changed it meanwhile
// (else it reads again and retries).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, appHome, home, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay } from "woolshed";
import { parse, isUrl, hostOf, shortOf, isLocal, titleFor, add, remove } from "./parse.js";

const dir = () => `${appHome()}/data/bookmarks`;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

// One list per folder (and machine); a space without a folder gets its own.
function spaceList(space) {
  if (!space) return null;
  const where = space.folder || `space ${space.id}`;
  const base = (space.folder ? space.folder.split(/[\\/]/).filter(Boolean).pop() : space.name) || "home";
  const slug = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "links";
  const machine = space.machine ? `${space.machine.replace(/[^A-Za-z0-9_-]+/g, "-")}--` : "";
  return {
    key: `${space.machine ?? ""}\u0000${where}`, name: space.name,
    path: `${dir()}/${machine}${slug}-${hash(`${space.machine ?? ""}:${where}`)}.md`,
    header: `# Bookmarks · ${space.name}${space.folder ? ` (${tidy(space.folder)})` : ""}`,
  };
}
const everywhere = () => ({ key: "all", name: "Everywhere", path: `${dir()}/everywhere.md`, header: "# Bookmarks · everywhere" });

export default class Bookmarks extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.docs = {};
    this.loading = new Set();
    this.note = null;
    this.adding = null;
    this.hover = null;
    this.title = InputState.new({ placeholder: "Title (optional)" });
    this.url = InputState.new({ placeholder: "https://…" });
    const submit = (_e, cx) => this.saveForm(cx);
    this.title.on("submit", submit);
    this.url.on("submit", submit);
    // The lists shown now, read when the window opens; another space's list is
    // read the first time it shows.
    cx.spawn(async (cx) => { await this.loadMissing(); cx.notify(); });
    cx.timer.every(2000, (cx) => {
      if (this.lists().some((l) => !this.docs[l.key] && !this.loading.has(l.key))) cx.spawn(async (cx) => { await this.loadMissing(); cx.notify(); });
    });
    // Edits made elsewhere (an agent adding a link) show up here. The folder
    // may not exist before the first link, so a failed watch tries again later.
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(dir());
          for (const list of this.lists()) await this.load(list);
          cx.notify();
        } catch { await cx.sleep(15000); }
      }
    });
  }

  lists() {
    const s = spaceList(spaces().find((x) => x.active));
    return s ? [s, everywhere()] : [everywhere()];
  }

  async loadMissing() {
    for (const list of this.lists().filter((l) => !this.docs[l.key] && !this.loading.has(l.key))) {
      this.loading.add(list.key);
      try { await this.load(list); } finally { this.loading.delete(list.key); }
    }
  }

  async load(list) {
    try {
      const text = await readTextFile(list.path);
      this.docs[list.key] = { text: text ?? "", error: null };
    } catch (e) {
      this.docs[list.key] = { text: this.docs[list.key]?.text ?? "", error: String(e.message ?? e) };
    }
  }

  // Reads the file fresh, changes it, writes it only if it's still as read.
  // `fn` returns null when what it meant is gone or not a link.
  change(list, fn, cx, gone = "That link changed somewhere else; this is the list now.") {
    cx.spawn(async (cx) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await readTextFile(list.path);
          const next = fn(text ?? "");
          if (next === null) { this.say(cx, true, gone); await this.load(list); break; }
          await writeTextFile(list.path, next, text);
          this.docs[list.key] = { text: next, error: null };
          break;
        } catch (e) { if (attempt === 2) this.say(cx, true, String(e.message ?? e)); }
      }
      cx.notify();
    });
  }

  say(cx, bad, text) {
    this.note = { bad, text };
    this.flash?.cancel();
    this.flash = cx.timer.after(6000, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  open(link, cx) {
    if (!isUrl(link.url)) { this.say(cx, true, `Only http and https links open: ${link.url}`); return; }
    try { cx.open_url(link.url); } catch (e) { this.say(cx, true, String(e.message ?? e)); }
  }

  startAdd(list, cx) {
    this.adding = this.adding === list.key ? null : list.key;
    this.title.set_value("");
    this.url.set_value("");
    if (this.adding) this.url.focus();
    cx.notify();
  }

  saveForm(cx) {
    const list = this.lists().find((l) => l.key === this.adding);
    if (!list) return;
    const url = this.url.value().trim();
    if (!isUrl(url)) { this.say(cx, true, "That isn't an http or https link."); return; }
    const title = this.title.value().trim();
    this.adding = null;
    this.change(list, (text) => add(text, title, url, list.header), cx);
  }

  pasteLink(list, cx) {
    const text = (cx.read_from_clipboard() ?? "").trim();
    if (!isUrl(text)) { this.say(cx, true, "The clipboard has no link"); return; }
    this.change(list, (t) => add(t, titleFor(text), text, list.header), cx);
    this.say(cx, false, `Added ${titleFor(text)} to ${list.name}`);
  }

  row(t, list, link) {
    const stop = (_e, cx) => cx.stop_propagation();
    const key = `bm-${list.key === "all" ? "a" : "s"}-${link.index}`;
    const hover = this.hover === key;
    const host = hostOf(link.url).replace(/^www\./, "");
    const small = (id, label, tip, action) => div().id(id).px(6).h(20).flex().items_center().rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
      .hover((el) => el.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); }).tooltip(tip).child(label);
    return h_flex().id(key).flex_none().mx(6).px(8).py(5).gap(9).items_center().rounded(7).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_hover((h, cx) => { if (h || hover) { this.hover = h ? key : null; cx.notify(); } })
      .on_click((_e, cx) => this.open(link, cx))
      .tooltip(link.url)
      .child(div().size(20).flex_none().flex().items_center().justify_center().rounded(5).bg(t.raised)
        .text_size(11).font_semibold().text_color(t.muted).child((host[0] ?? "?").toUpperCase()))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_medium().text_color(t.foreground).child(link.title || host))
        .child(div().truncate().text_size(11).text_color(t.dim).child(shortOf(link.url).replace(/^www\./, ""))))
      .when(isLocal(link.url), (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.accent).child("local")))
      .when(hover, (el) => el
        .child(small(`${key}-copy`, "Copy", "Copy the link", (_e, cx) => { cx.write_to_clipboard(link.url); this.say(cx, false, "Copied the link"); }))
        .child(small(`${key}-del`, "✕", "Delete", (_e, cx) => this.change(list, (text) => remove(text, link.index, link.url), cx))));
  }

  section(t, list) {
    const stop = (_e, cx) => cx.stop_propagation();
    const doc = this.docs[list.key];
    const links = parse(doc?.text ?? "").links;
    const tiny = (id, label, tip, action) => div().id(id).h(20).px(7).flex().items_center().rounded(5).text_size(11).text_color(t.muted).cursor_pointer()
      .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).tooltip(tip).child(label);
    const k = list.key === "all" ? "a" : "s";
    const field = (el) => el.w_full().h(30).px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5);
    return v_flex().flex_none().gap(1)
      .child(h_flex().flex_none().px(16).pt(8).pb(3).gap(4).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).font_medium().text_color(t.dim).child(list.name))
        .child(tiny(`bm-${k}-paste`, "Paste link", "Add the link on the clipboard", (_e, cx) => this.pasteLink(list, cx)))
        .child(tiny(`bm-${k}-add`, this.adding === list.key ? "Cancel" : "+ Add", "Add a link", (_e, cx) => this.startAdd(list, cx))))
      .when(this.adding === list.key, (el) => el.child(v_flex().mx(12).mb(4).gap(6).on_mouse_down("left", stop)
        .child(field(Input.new(this.url)))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).child(field(Input.new(this.title))))
          .child(div().id(`bm-${k}-save`).flex_none().h(30).px(12).flex().items_center().rounded(7).bg(t.solid).text_color(t.solid_foreground)
            .cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_e, cx) => this.saveForm(cx)).child("Save")))))
      .when(!doc, (el) => el.child(div().px(16).py(4).text_color(t.dim).child("Loading…")))
      .when(Boolean(doc?.error), (el) => el.child(div().px(16).py(4).text_size(11.5).text_color(t.blocked).child(doc.error)))
      .when(Boolean(doc) && !links.length, (el) => el.child(div().px(16).py(4).text_color(t.dim).child(list.key === "all" ? "No links for everywhere yet." : `No links for ${list.name} yet.`)))
      .children(links.map((l) => this.row(t, list, l)));
  }

  render(cx) {
    const t = theme();
    const lists = this.lists();
    const stop = (_e, cx) => cx.stop_propagation();
    return v_flex().id("bookmarks").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(380) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Bookmarks"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("bm-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(v_flex().id("bm-rows").pb(8).gap(4).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(480) : el.flex_1().min_h(0)))
        .children(lists.map((list) => this.section(t, list))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11.5)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : t.dim)
        .child(this.note?.text ?? `Click to open in the browser · ${tidy(dir())}`));
  }
}
