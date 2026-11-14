// To do: a checklist for the shown space (one per project folder) and one for
// everywhere. Each is a markdown task list in data/todo/ under the app folder
// ("- [ ] ..." / "- [x] ..."), so a person or an agent can edit it too; this
// window follows. Every change reads the file fresh and writes only if nobody
// changed it meanwhile (else it reads again and retries).
// In a short layout block it's a strip: how many are left and the next one.
// Commands: todo.space, todo.everywhere (show that list).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, appHome, home, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay, run, nextCommand } from "woolshed";
import { parse, add, toggle, remove, move, clearDone } from "./parse.js";

const dir = () => `${appHome()}/data/todo`;

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

// One list per folder (and machine), like space notes; a space without a
// folder gets its own. The other list is everywhere's.
function listOf(scope, space) {
  if (scope === "all") return { key: "all", path: `${dir()}/everywhere.md`, name: "Everywhere", header: "# To do · everywhere" };
  if (!space) return null;
  const where = space.folder || `space ${space.id}`;
  const base = (space.folder ? space.folder.split(/[\\/]/).filter(Boolean).pop() : space.name) || "home";
  const slug = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "todo";
  const machine = space.machine ? `${space.machine.replace(/[^A-Za-z0-9_-]+/g, "-")}--` : "";
  const key = `${space.machine ?? ""}\u0000${where}`;
  return {
    key, name: space.name, folder: space.folder,
    path: `${dir()}/${machine}${slug}-${hash(`${space.machine ?? ""}:${where}`)}.md`,
    header: `# To do · ${space.name}${space.folder ? ` (${tidy(space.folder)})` : ""}`,
  };
}

const stored = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export default class Todo extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.scope = stored("todo.scope", "space") === "all" ? "all" : "space";
    this.showDone = stored("todo.done", "no") === "yes";
    this.docs = {};
    this.note = null;
    this.busy = false;
    this.size = null;
    this.input = InputState.new({ placeholder: "Add a to-do and press Enter" });
    this.input.on("submit", (_e, cx) => {
      const value = this.input.value().trim();
      const list = this.current();
      if (!value || !list) return;
      this.input.set_value("");
      this.change(list, (text) => add(text, value, list.header), cx);
    });
    // Edits made elsewhere (an agent ticking a box) show up here. The folder
    // may not exist before the first list, so a failed watch tries again later.
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(dir());
          for (const k of Object.keys(this.docs)) this.docs[k].stale = true;
          const list = this.current();
          if (list) await this.load(list);
          cx.notify();
        } catch { await cx.sleep(15000); }
      }
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "space" || c === "everywhere") this.pick(c === "space" ? "space" : "all");
        cx.notify();
      }
    });
  }

  current() {
    return listOf(this.scope, spaces().find((s) => s.active));
  }

  pick(scope) {
    this.scope = scope;
    this.note = null;
    store("todo.scope", scope);
  }

  async load(list) {
    try {
      const text = await readTextFile(list.path);
      this.docs[list.key] = { text: text ?? "", missing: text === null, error: null };
    } catch (e) {
      this.docs[list.key] = { text: this.docs[list.key]?.text ?? "", error: String(e.message ?? e) };
    }
  }

  // Reads the file fresh, changes it, and writes it only if it's still as read.
  // `fn` returns null when the item it meant is gone (changed elsewhere).
  change(list, fn, cx) {
    this.busy = true;
    cx.spawn(async (cx) => {
      this.note = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await readTextFile(list.path);
          const next = fn(text ?? "");
          if (next === null) { this.note = { bad: true, text: "That item changed somewhere else; this is the list now." }; await this.load(list); break; }
          if (next === (text ?? "")) break;
          await writeTextFile(list.path, next, text);
          this.docs[list.key] = { text: next, missing: false, error: null };
          break;
        } catch (e) {
          if (attempt === 2) this.note = { bad: true, text: String(e.message ?? e) };
        }
      }
      this.busy = false;
      cx.notify();
    });
    cx.notify();
  }

  box(t, done, onClick, id) {
    return div().id(id).size(16).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
      .map((el) => (done ? el.bg(t.done) : el.border(1.5).border_color(t.input).hover((s) => s.border_color(t.accent))))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .when(done, (el) => el.child(svg("mods/todo/check.svg").size(11).text_color(t.background)));
  }

  row(t, list, it) {
    const stop = (_e, cx) => cx.stop_propagation();
    const hover = this.hover === `${list.key}:${it.line}`;
    const small = (id, label, tip, action) => div().id(id).size(20).flex_none().flex().items_center().justify_center().rounded(5)
      .text_size(11.5).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).tooltip(tip).child(label);
    const id = `td-${it.done ? "d" : "o"}-${it.index}`;
    return h_flex().id(id).flex_none().mx(6).px(8).min_h(30).py(4).gap(9).items_center().rounded(7)
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { const k = h ? `${list.key}:${it.line}` : null; if (h || hover) { this.hover = k; cx.notify(); } })
      .child(this.box(t, it.done, (_e, cx) => this.change(list, (text) => toggle(text, it.index, it.text), cx), `${id}-box`))
      .child(div().flex_1().min_w(0).text_size(12.5).text_color(it.done ? t.dim : t.foreground).when(it.done, (el) => el.line_through()).child(it.text))
      .when(hover, (el) => el
        .child(small(`${id}-up`, "↑", "Move up", (_e, cx) => this.change(list, (text) => move(text, it.index, it.text, -1), cx)))
        .child(small(`${id}-down`, "↓", "Move down", (_e, cx) => this.change(list, (text) => move(text, it.index, it.text, 1), cx)))
        .child(small(`${id}-del`, "✕", "Delete", (_e, cx) => this.change(list, (text) => remove(text, it.index, it.text), cx))));
  }

  tabs(t, space) {
    const stop = (_e, cx) => cx.stop_propagation();
    const tab = (scope, label) => div().id(`td-tab-${scope}`).h(24).px(10).flex().items_center().rounded(6).text_size(12).cursor_pointer().max_w(170)
      .map((el) => (this.scope === scope ? el.bg(t.background).text_color(t.foreground).font_medium() : el.text_color(t.muted).hover((s) => s.text_color(t.foreground))))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.pick(scope); cx.notify(); })
      .child(div().truncate().child(label));
    return h_flex().p(2).gap(2).rounded(8).bg(t.raised).min_w(0)
      .child(tab("space", space ? space.name : "This space"))
      .child(tab("all", "Everywhere"));
  }

  strip(t, list, doc) {
    const open = parse(doc?.text ?? "").items.filter((it) => !it.done);
    const label = !list ? "No space" : open.length ? `${open.length} to do` : "All done";
    return h_flex().id("todo").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_click(() => run("mod.open", { name: "todo" }))
      .tooltip(list ? `${list.name}: open the list` : "Open the list")
      .child(div().size(13).flex_none().rounded(3).map((el) => (open.length ? el.border(1.5).border_color(t.accent) : el.bg(t.done))))
      .child(div().flex_none().font_semibold().text_color(open.length ? t.foreground : t.muted).child(label))
      .when(open.length > 0, (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(open[0].text)));
  }

  render(cx) {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const list = this.current();
    const doc = list ? this.docs[list.key] : null;
    if (list && (!doc || doc.stale) && !this.loadingKey) {
      const key = list.key;
      this.loadingKey = key;
      cx.spawn(async (cx) => { await this.load(list); if (this.loadingKey === key) this.loadingKey = null; cx.notify(); });
    }
    if (!this.overlay && this.size && this.size.height < 64) return this.strip(t, list, doc);

    const stop = (_e, cx) => cx.stop_propagation();
    const { items } = parse(doc?.text ?? "");
    const open = items.filter((it) => !it.done);
    const done = items.filter((it) => it.done);
    const empty = (text) => div().px(16).py(10).text_color(t.dim).text_size(12.5).child(text);
    return v_flex().id("todo").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(380) : el.size_full()))
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .child(h_flex().flex_none().h(42).pl(12).pr(8).gap(8).items_center()
        .child(this.tabs(t, space))
        .child(div().flex_1())
        .when(Boolean(this.overlay), (el) => el.child(div().id("td-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().flex_none().px(12).pb(8).on_mouse_down("left", stop)
        .child(Input.new(this.input).w_full().h(32).px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5)))
      .child(v_flex().id("td-rows").pb(6).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(420) : el.flex_1().min_h(0)))
        .when(!list, (el) => el.child(empty("Open a space to see its list, or switch to Everywhere.")))
        .when(Boolean(list) && !doc, (el) => el.child(empty("Loading…")))
        .when(Boolean(doc) && !items.length, (el) => el.child(empty(this.scope === "all" ? "Nothing to do everywhere. Add one above." : `Nothing to do in ${list.name}. Add one above.`)))
        .when(Boolean(doc) && items.length > 0 && !open.length, (el) => el.child(empty("All done.")))
        .children(open.map((it) => this.row(t, list, it)))
        .when(done.length > 0, (el) => el
          .child(h_flex().flex_none().mx(6).mt(4).px(8).h(26).gap(6).items_center()
            .child(div().id("td-fold").flex_1().text_size(11.5).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
              .on_click((_e, cx) => { this.showDone = !this.showDone; store("todo.done", this.showDone ? "yes" : "no"); cx.notify(); })
              .child(`${this.showDone ? "▾" : "▸"} ${done.length} done`))
            .when(this.showDone, (el) => el.child(div().id("td-clear").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_click((_e, cx) => this.change(list, (text) => clearDone(text), cx)).child("Clear done"))))
          .when(this.showDone, (el) => el.children(done.map((it) => this.row(t, list, it))))))
      .child(h_flex().flex_none().px(14).py(8).gap(6).border_t(1).border_color(t.border).text_size(11)
        .text_color(this.note?.bad || doc?.error ? t.blocked : t.dim)
        .child(div().flex_none().child(this.note?.text ?? doc?.error ?? (list ? `${open.length} to do` : "")))
        .when(!this.note && !doc?.error && Boolean(list), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${tidy(list.path)}`))));
  }
}
