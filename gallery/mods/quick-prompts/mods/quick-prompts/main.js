// Quick prompts: your saved prompts, one click from the agent you're looking
// at. Nothing is ever sent by itself: only Send does it, with `hc send` (which
// pastes the text and presses Enter, and refuses an agent that is asking you
// something). The list lives in data/quick-prompts/prompts.json under the app
// folder, so you (or an agent) can edit it there too; this window follows.
// {space}, {tab}, {folder} and {branch} in a prompt are filled in on Send.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { agents, panes, spaces, focused, layout, hc, appHome, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay } from "woolshed";

const SEEDS = [
  { title: "Keep going", text: "Continue with the next step." },
  { title: "Run the tests", text: "Run the test suite and fix any failures you find." },
  { title: "Summarize", text: "Summarize what you changed and why, in five short bullet points." },
  { title: "Review your diff", text: "Review your own diff on {branch} for bugs and missing tests before we continue." },
  { title: "Plan first", text: "Before writing more code, explain your plan in a few sentences and wait for my go." },
];

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const dir = () => `${appHome()}/data/quick-prompts`;
const file = () => `${dir()}/prompts.json`;

function parse(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.prompts;
    if (!Array.isArray(list)) return null;
    return list.filter((p) => p && typeof p.text === "string").map((p, i) => ({ id: String(p.id ?? `p${i + 1}`), title: String(p.title ?? p.text.slice(0, 40)), text: p.text }));
  } catch { return null; }
}
const dump = (list) => JSON.stringify({ prompts: list }, null, 2) + "\n";

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function shows(node, kind) {
  if (!node || typeof node !== "object") return false;
  if (node.content && node.content[kind] !== undefined && !node.hidden) return true;
  return (node.children ?? []).some((c) => shows(c, kind));
}

// The agent you're looking at: the one an agent block shows, else the focused pane's.
function target() {
  const f = focused();
  const list = agents();
  const addr = shows(layout(), "agent") ? f?.agent : f?.terminal;
  return list.find((a) => a.address === addr) ?? null;
}

function fill(text, a) {
  const pane = panes().find((p) => p.terminal === a.address);
  const space = spaces().find((s) => s.id === a.space);
  const values = { space: a.space_name ?? "", tab: a.tab_name ?? "", folder: pane?.cwd ?? space?.folder ?? "", branch: pane?.branch ?? space?.branch ?? "this branch" };
  return text.replace(/\{(space|tab|folder|branch)\}/g, (_m, k) => values[k] || k);
}

export default class QuickPrompts extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.list = null;
    this.note = null;
    this.editing = null;
    this.confirm = null;
    this.sending = null;
    this.title = InputState.new({ placeholder: "Title" });
    this.text = TextareaState.new({ placeholder: "What to tell the agent. {space} {tab} {folder} {branch} are filled in.", rows: 4 });
    cx.spawn(async (cx) => {
      await this.load(true);
      cx.notify();
      // Edits to the file (by hand or by an agent) show up here.
      for (;;) {
        try { await watchFolder(dir()); await this.load(false); cx.notify(); }
        catch { await cx.sleep(15000); }
      }
    });
  }

  async load(seed) {
    try {
      const text = await readTextFile(file());
      if (text === null && seed) {
        const list = SEEDS.map((p, i) => ({ id: `p${i + 1}`, ...p }));
        await writeTextFile(file(), dump(list), null).catch(() => {});
        this.list = list;
        return;
      }
      this.list = parse(text ?? "") ?? this.list ?? [];
      this.error = text !== null && parse(text) === null ? "prompts.json isn't valid JSON: fix it or delete it" : null;
    } catch (e) { this.error = String(e.message ?? e); this.list = this.list ?? []; }
  }

  // Reads the file fresh, changes it, writes it back only if nobody else did meanwhile.
  change(fn, cx) {
    cx.spawn(async (cx) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await readTextFile(file());
          const list = parse(text ?? "") ?? [];
          fn(list);
          await writeTextFile(file(), dump(list), text);
          this.list = list;
          break;
        } catch (e) { this.note = { bad: true, text: String(e.message ?? e) }; }
      }
      cx.notify();
    });
  }

  edit(p, cx) {
    this.editing = p ? p.id : "new";
    this.title.set_value(p?.title ?? "");
    this.text.set_value(p?.text ?? "");
    this.title.focus();
    cx.notify();
  }

  save(cx) {
    const title = this.title.value().trim();
    const text = this.text.value().trim();
    if (!text) { this.note = { bad: true, text: "A prompt needs some text." }; cx.notify(); return; }
    const id = this.editing;
    this.change((list) => {
      const p = list.find((x) => x.id === id);
      if (p) { p.title = title || text.slice(0, 40); p.text = text; }
      else list.push({ id: `p${Date.now().toString(36)}`, title: title || text.slice(0, 40), text });
    }, cx);
    this.editing = null;
  }

  send(p, a, cx) {
    if (!a || this.sending) return;
    const text = fill(p.text, a);
    this.sending = p.id;
    this.note = null;
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["send", a.address, text]);
        this.note = r.code === 0
          ? { bad: false, text: `Sent "${p.title}" to ${a.space_name} · ${a.program?.name ?? "agent"}` }
          : { bad: true, text: (r.stderr || r.stdout || "hc send failed").trim().split("\n")[0] };
      } catch (e) { this.note = { bad: true, text: String(e.message ?? e) }; }
      this.sending = null;
      cx.notify();
      cx.timer.after(6000, (cx) => { this.note = null; cx.notify(); });
    });
    cx.notify();
  }

  form(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const field = (el) => el.w_full().px(10).py(7).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5);
    return v_flex().gap(8).px(14).py(10).border_b(1).border_color(t.border).on_mouse_down("left", stop)
      .child(field(Input.new(this.title)).h(32))
      .child(field(Textarea.new(this.text)).h(96))
      .child(h_flex().gap(6).justify_end()
        .child(div().id("qp-cancel").h(26).px(10).flex().items_center().rounded(6).bg(t.raised).text_color(t.muted).cursor_pointer()
          .on_click((_e, cx) => { this.editing = null; cx.notify(); }).child("Cancel"))
        .child(div().id("qp-save").h(26).px(12).flex().items_center().rounded(6).bg(t.solid).text_color(t.solid_foreground).cursor_pointer()
          .on_click((_e, cx) => this.save(cx)).child("Save")));
  }

  row(t, p, a) {
    const stop = (_e, cx) => cx.stop_propagation();
    // An agent asking a question gets its answer from you, not a prompt.
    const ready = Boolean(a) && a.status !== "blocked";
    const asking = this.confirm === p.id;
    const small = (id, label, action, color = t.dim) => div().id(id).px(6).py(2).rounded(5).text_size(11).text_color(color).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
    return h_flex().id(`qp-${p.id}`).flex_none().mx(6).px(10).py(7).gap(10).items_center().rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== (this.hover === p.id)) { this.hover = h ? p.id : null; this.confirm = h ? this.confirm : null; cx.notify(); } })
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().font_medium().text_color(t.foreground).child(p.title))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(p.text.split("\n")[0])))
      .when(this.hover === p.id && !asking, (el) => el
        .child(small(`qp-edit-${p.id}`, "Edit", (_e, cx) => this.edit(p, cx)))
        .child(small(`qp-del-${p.id}`, "Delete", (_e, cx) => { this.confirm = p.id; cx.notify(); })))
      .when(asking, (el) => el.child(small(`qp-really-${p.id}`, "Delete it", (_e, cx) => {
        this.confirm = null;
        this.change((list) => { const i = list.findIndex((x) => x.id === p.id); if (i >= 0) list.splice(i, 1); }, cx);
      }, t.blocked)))
      .child(div().id(`qp-send-${p.id}`).flex_none().h(26).px(12).flex().items_center().rounded(6).text_size(12)
        .bg(ready ? t.solid : t.raised).text_color(ready ? t.solid_foreground : t.dim)
        .when(ready, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { if (ready) this.send(p, a, cx); })
        .child(this.sending === p.id ? "Sending…" : "Send"));
  }

  render() {
    const t = theme();
    const a = target();
    const list = this.list ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const to = a
      ? h_flex().gap(7).items_center().min_w(0)
        .child(div().flex_none().text_color(t.dim).child("To"))
        .child(icon(a.program, 14, t.foreground))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`${a.space_name} · ${a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : a.program?.name ?? "agent"}`))
        .when(a.status === "blocked", (el) => el.child(div().flex_none().text_size(11).text_color(t.blocked).child("asking you: answer it first")))
        .when(a.status === "working", (el) => el.child(div().flex_none().text_size(11).text_color(t.working).child("working")))
      : div().text_color(t.dim).child("Focus an agent's pane (or show one) to send to it.");
    return v_flex().id("quick-prompts").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(380) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Quick prompts"))
        .child(div().id("qp-new").h(22).px(8).flex().items_center().rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.edit(null, cx)).child("+ New"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("qp-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().flex_none().px(16).pb(8).text_size(12).child(to))
      .when(this.editing !== null, (el) => el.child(this.form(t)))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("qp-rows").flex_none().max_h(420).py(4).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.max_h(380) : el.flex_1()))
        .when(this.list === null, (el) => el.child(div().px(16).py(6).text_color(t.dim).child("Loading…")))
        .when(this.list !== null && !list.length, (el) => el.child(div().px(16).py(6).text_color(t.dim).child("No prompts yet. + New adds one.")))
        .children(list.map((p) => this.row(t, p, a))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11.5)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : t.dim)
        .child(this.note?.text ?? "Send pastes the prompt into the agent and presses Enter."));
  }
}
