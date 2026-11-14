// Markdown view: the shown space's README (or any markdown file in its repo,
// picked from `git ls-files`) rendered, and read again when the file changes.
// Links to other markdown files in the repo open here; web links open in the
// browser. As a pane, `props: { file }` (an absolute path) shows that file.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, home, theme, props, closeOverlay } from "woolshed";
import { markdownFiles, pickDefault, resolveLink } from "./parse.js";

const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const clock = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function tidy(path, machine) {
  if (!path) return "";
  if (machine) return `${machine}:${path}`;
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

// Where to look: a pane's own file, else the shown space (its focused
// terminal's folder when that pane is in it, else the space's folder).
function source() {
  const own = props()?.file;
  if (typeof own === "string" && own.startsWith("/")) {
    const machine = props()?.machine ?? null;
    return { key: `file\u0000${machine ?? ""}\u0000${own}`, folder: own.slice(0, own.lastIndexOf("/")) || "/", file: own, machine, name: own.split("/").pop() };
  }
  const space = spaces().find((s) => s.active);
  if (!space) return null;
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane && p.terminal) : null;
  const inSpace = pane && space.tabs.some((t) => t.id === pane.tab);
  const folder = (inSpace && pane.cwd) || space.folder || (space.machine ? "" : home());
  return { key: `${space.machine ?? ""}\u0000${folder}`, folder, machine: space.machine, name: space.name };
}

export default class MarkdownView extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.src = null;
    this.root = null;
    this.git = true;
    this.files = null;
    this.file = null;
    this.text = null;
    this.error = null;
    this.note = null;
    this.picking = false;
    this.updated = null;
    this.filter = InputState.new({ placeholder: "Filter files" });
    this.filter.on("change", (_e, cx) => cx.notify());
    // The file is read again every 5 s (15 s on another machine), and the
    // view redraws only when it changed.
    let tick = 0;
    cx.timer.every(5000, (cx) => {
      tick += 1;
      if (!this.file || this.loading || (this.src?.machine && tick % 3)) return;
      cx.spawn(async (cx) => { if (await this.read()) cx.notify(); });
    });
  }

  run(cmd, args, cwd) {
    return exec(cmd, args, { cwd: cwd || undefined, on: this.src?.machine ?? null, timeout: 10000 });
  }

  // Finds the repo, lists its markdown files and shows the remembered one or
  // the README.
  locate(src, cx) {
    this.src = src;
    this.root = null; this.files = null; this.file = null; this.text = null; this.error = null; this.note = null; this.picking = false; this.gitMissing = false;
    if (!src) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        let root = src.folder;
        this.git = true;
        try {
          const r = await this.run("git", ["rev-parse", "--show-toplevel"], src.folder);
          if (r.code === 0 && r.stdout.trim()) root = r.stdout.trim();
          else this.git = false;
        } catch { this.git = false; this.gitMissing = true; }
        if (this.src !== src) return;
        this.root = root;
        await this.list();
        if (this.src !== src) return;
        const own = src.file && root && src.file.startsWith(root.replace(/\/+$/, "") + "/") ? src.file.slice(root.replace(/\/+$/, "").length + 1) : null;
        if (src.file && !own) { this.files = [src.file.split("/").pop(), ...(this.files ?? [])]; }
        this.file = own ?? (src.file ? src.file.split("/").pop() : pickDefault(this.files ?? [], stored(`mv.pick.${src.machine ?? ""}.${root}`)));
        if (this.gitMissing) this.note = "git isn't installed: showing only the folder's own markdown files.";
        await this.read();
      } catch (e) {
        this.error = String(e.message ?? e);
      }
      this.loading = false;
      cx.notify();
    });
  }

  async list() {
    const root = this.root;
    try {
      const r = this.git
        ? await this.run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md", "*.markdown", "*.mdx"], root)
        : await this.run("ls", ["-1A"], root);
      if (this.root !== root) return;
      this.files = r.code === 0 ? markdownFiles(r.stdout) : [];
      if (r.code !== 0) this.error = (r.stderr || "couldn't list the files").trim().split("\n")[0];
    } catch (e) {
      this.files = [];
      this.error = String(e.message ?? e);
    }
  }

  path(rel) {
    const root = (this.root ?? "").replace(/\/+$/, "");
    return rel.startsWith("/") ? rel : `${root}/${rel}`;
  }

  // Reads the shown file; true when its text changed.
  async read() {
    const file = this.file;
    if (!file) return false;
    try {
      const text = await readTextFile(this.path(file), { on: this.src?.machine ?? null });
      if (this.file !== file) return false;
      const was = this.text;
      this.text = text;
      this.error = text === null ? `${file} isn't there any more.` : null;
      if (text !== was) this.updated = new Date();
      return text !== was;
    } catch (e) {
      if (this.file !== file) return false;
      const msg = String(e.message ?? e);
      const changed = this.error !== msg;
      this.error = msg;
      return changed;
    }
  }

  pick(rel, cx) {
    this.file = rel;
    this.text = null;
    this.picking = false;
    this.note = null;
    if (this.src && !this.src.file) store(`mv.pick.${this.src.machine ?? ""}.${this.root}`, rel);
    cx.spawn(async (cx) => { await this.read(); cx.notify(); });
    cx.notify();
  }

  link(url, cx) {
    const to = resolveLink(this.file, url, this.files ?? [], this.root);
    if (to?.file) return this.pick(to.file, cx);
    if (to?.url) { try { cx.open_url(to.url); } catch (e) { this.note = String(e.message ?? e); } }
    else this.note = `Can't open ${url} from here.`;
    cx.notify();
  }

  picker(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const q = this.filter.value().trim().toLowerCase();
    const all = this.files ?? [];
    const list = (q ? all.filter((p) => p.toLowerCase().includes(q)) : all).slice(0, 300);
    return v_flex().flex_none().mx(12).mb(8).rounded(8).border_1().border_color(t.border).bg(t.background).on_mouse_down("left", stop)
      .child(div().p(6).child(Input.new(this.filter).w_full().h(28).px(8).rounded(6).border_1().border_color(t.border).bg(t.surface).text_color(t.foreground).text_size(12)))
      .child(v_flex().id("mv-files").max_h(240).pb(4).overflow_y_scrollbar()
        .when(!list.length, (el) => el.child(div().px(12).py(6).text_size(12).text_color(t.dim).child(all.length ? "No file matches." : "No markdown files here.")))
        .children(list.map((p, i) => {
          const cut = p.lastIndexOf("/");
          return h_flex().id(`mv-f-${i}`).mx(4).px(8).h(26).gap(6).items_center().rounded(5).cursor_pointer()
            .map((el) => (p === this.file ? el.bg(t.selected) : el.hover((s) => s.bg(t.hover))))
            .on_click((_e, cx) => this.pick(p, cx))
            .child(div().flex_none().text_size(12.5).text_color(t.foreground).child(cut < 0 ? p : p.slice(cut + 1)))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(cut < 0 ? "" : p.slice(0, cut)));
        })));
  }

  render(cx) {
    const t = theme();
    const src = source();
    if ((src?.key ?? null) !== (this.src?.key ?? null)) this.locate(src, cx);
    const stop = (_e, cx) => cx.stop_propagation();
    const empty = (text) => div().p(16).text_size(12.5).text_color(t.dim).child(text);
    const files = this.files ?? [];
    const where = this.root ? tidy(this.root, src?.machine) : "";
    let body;
    if (!src) body = empty("Open a space to read its markdown.");
    else if (this.files === null || (this.file && this.text === null && !this.error)) body = empty("Reading…");
    else if (!this.file) body = empty(`No markdown files in ${where || "this folder"}.${this.git ? "" : " (Not a git repository: only the folder's own files are listed.)"}`);
    else if (this.text === null) body = empty(this.error ?? "");
    else if (!this.text.trim()) body = empty(`${this.file} is empty.`);
    else body = TextView.markdown(`mv-${this.file}`, this.text).selectable(true).w_full()
      .on_link_click((url, cx) => this.link(url, cx));
    const footer = this.note ?? (this.error && this.text !== null ? this.error : null);
    return v_flex().id("markdown-view").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(580) : el.size_full()))
      .child(h_flex().flex_none().h(44).pl(16).pr(8).gap(8).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(11.5).font_medium().text_color(t.dim).child(src ? `Markdown · ${src.name}` : "Markdown"))
          .child(div().id("mv-pick").flex_none().min_w(0).max_w(420).flex().items_center().gap(4).cursor_pointer().text_color(t.foreground)
            .hover((s) => s.text_color(t.accent)).on_mouse_down("left", stop)
            .on_click((_e, cx) => {
              this.picking = !this.picking;
              if (this.picking && this.root) cx.spawn(async (cx) => { await this.list(); cx.notify(); });
              cx.notify();
            })
            .when(files.length > 0 || Boolean(this.file), (el) => el
              .child(div().truncate().text_size(13).font_semibold().child(this.file ?? "Pick a file"))
              .child(div().flex_none().text_size(10).text_color(t.dim).child(this.picking ? "▴" : "▾")))))
        .when(Boolean(this.overlay), (el) => el.child(div().id("mv-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(this.picking, (el) => el.child(this.picker(t)))
      .child(div().id("mv-body").min_h(0).mx(12).px(18).py(12).rounded(8).border_1().border_color(t.border).bg(t.background)
        .text_color(t.foreground).text_size(13).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.h(520) : el.flex_1()))
        .child(body))
      .child(h_flex().flex_none().px(16).py(8).gap(6).text_size(11).text_color(footer ? t.blocked : t.dim)
        .child(div().flex_1().min_w(0).truncate().child(footer ?? (this.file && this.root ? tidy(this.path(this.file), src?.machine) : where)))
        .when(!footer && Boolean(this.updated) && this.text !== null, (el) => el.child(div().flex_none().child(`updated ${clock(this.updated)}`)))
        .when(!footer && files.length > 1, (el) => el.child(div().flex_none().child(`· ${files.length} files`))));
  }
}
