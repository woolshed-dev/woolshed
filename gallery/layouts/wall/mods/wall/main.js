// Wall: every agent as a small tile showing the bottom of its screen, grouped
// by space, so you read what each one is up to without opening it. The screens
// are read every 10 seconds (`hc read <terminal> --lines 0`); a click puts that
// agent live on the stage beside the wall, where you type to it.
// Props: { role: "bar" } the title bar, { role: "wall" } the tiles.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, focused, run, hc, theme, props, shared, setShared, settings, window as appWindow, openOverlay, setAgentOrder } from "woolshed";
import { snippet, columns, groups, LINES } from "./snippet.js";

const READ_EVERY = 10000;
const READ_MAX = 24;
const READ_TIMEOUT = 5000;
const REFRESH = "wall.refresh";
const SPIN = "mods/wall/spinner.svg";
const WORDS = { blocked: "needs you", working: "working", done: "finished", idle: "idle" };
const LINE_H = 14;

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function what(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  const title = clean(a.title);
  const telling = title && title !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(title) && !title.includes("@") && title.toLowerCase() !== a.program?.key;
  return telling ? title : a.program?.name ?? "agent";
}

function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d`;
}

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function glyph(t, status, size = 8) {
  if (status === "working") return svg(SPIN).size(size + 3).flex_none().text_color(t.working).spin(900);
  if (status === "idle") return div().size(size).flex_none().rounded(size / 2).border(1.5).border_color(t.idle ?? t.dim);
  return div().size(size).flex_none().rounded(size / 2).bg(t[status] ?? t.dim);
}

export default class Wall extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "wall";
    this.since = {};
    this.screens = {};
    this.width = 0;
    this.missing = false;
    this.refreshSeen = shared(REFRESH) ?? null;
    if (this.role === "wall") {
      this.readAll(cx);
      cx.timer.every(READ_EVERY, (cx) => this.readAll(cx));
    }
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Reads every agent's screen, one after another, at most READ_MAX of them.
  readAll(cx) {
    if (this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      const list = agents().slice(0, READ_MAX);
      const live = new Set(list.map((a) => a.address));
      for (const a of list) {
        try {
          const r = await Promise.race([
            hc(["read", a.address, "--lines", "0"]),
            cx.sleep(READ_TIMEOUT).then(() => ({ code: -1, stdout: "", stderr: "timed out" })),
          ]);
          this.missing = false;
          this.screens[a.address] = r.code === 0
            ? { lines: snippet(r.stdout), at: Date.now() }
            : { lines: this.screens[a.address]?.lines ?? [], error: (r.stderr || "couldn't read the screen").trim().split("\n")[0], at: Date.now() };
        } catch (e) {
          // hc itself didn't start: Woolshed Core isn't on the PATH Woolshed gives mods.
          this.missing = true;
          break;
        }
      }
      for (const k of Object.keys(this.screens)) if (!live.has(k)) delete this.screens[k];
      this.reading = false;
      cx.notify();
    });
  }

  track(list) {
    const now = Date.now();
    for (const a of list) if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };
  }

  newAgent() { openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }); }

  bar(t) {
    const list = agents();
    const n = (s) => list.filter((a) => a.status === s).length;
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action, strong = false, tip = null) => div().id(id).h(28).px(11).flex_none().flex().items_center().rounded(7).text_size(12)
      .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.foreground).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).when(Boolean(tip), (el) => el.tooltip(tip)).child(label);
    const winButton = (id, label, command) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    const stat = (color, text) => h_flex().flex_none().gap(5).items_center().child(div().size(7).rounded(4).bg(color)).child(div().text_color(t.muted).child(text));
    const sp = new Set(list.map((a) => a.space)).size;
    return h_flex().id("wall-bar").size_full().min_w(0).pl(mac ? 84 : 16).pr(8).gap(14).items_center().bg(t.chrome)
      .border_b(1).border_color(t.border).text_size(12.5)
      .child(div().flex_none().text_size(14).font_semibold().text_color(t.foreground).child("Wall"))
      .child(div().flex_none().text_color(t.dim).child(list.length ? `${list.length} agent${list.length === 1 ? "" : "s"} in ${sp} space${sp === 1 ? "" : "s"}` : "No agents"))
      .when(n("blocked") > 0, (el) => el.child(stat(t.blocked, `${n("blocked")} need${n("blocked") === 1 ? "s" : ""} you`)))
      .when(n("working") > 0, (el) => el.child(stat(t.working, `${n("working")} working`)))
      .when(n("done") > 0, (el) => el.child(stat(t.done, `${n("done")} done`)))
      .child(div().flex_1())
      .child(div().flex_none().text_size(11.5).text_color(t.dim).child("screens every 10 s"))
      .child(button("wall-refresh", "Read now", () => setShared(REFRESH, Date.now()), false, "Read every screen again"))
      .child(button("wall-new", "+ New agent", () => this.newAgent(), true))
      .when(Boolean(w?.buttons), (el) => el
        .child(winButton("wall-min", "–", "window.minimize"))
        .child(winButton("wall-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("wall-close", "✕", "window.close")));
  }

  tile(t, a, width, stageAddr, now) {
    const screen = this.screens[a.address];
    const st = a.status;
    const on = a.address === stageAddr;
    const mono = settings().font_family ?? "JetBrains Mono";
    const started = this.since[a.address]?.at ?? now;
    const lines = screen?.lines ?? [];
    const body = v_flex().h(LINES * LINE_H + 14).flex_none().px(10).py(7).overflow_hidden().bg(t.background)
      .text_size(10.5).text_color(st === "idle" ? t.dim : t.muted)
      .when(lines.length > 0, (el) => el.font_family(mono).justify_end().children(lines.map((l, i) => div().h(LINE_H).flex_none().whitespace_nowrap().overflow_hidden()
        .text_color(i === lines.length - 1 && st === "blocked" ? t.foreground : st === "idle" ? t.dim : t.muted).child(l || " "))))
      .when(lines.length === 0, (el) => el.items_center().justify_center().text_size(11.5).text_color(t.dim)
        .child(screen?.error ? `Couldn't read the screen: ${screen.error}` : screen ? "Nothing on screen yet" : "Reading the screen…"));
    return v_flex().id(`wall-${a.address}`).w(width).flex_none().rounded(10).overflow_hidden().cursor_pointer()
      .border(1).border_color(on ? t.accent : st === "blocked" ? alpha(t.blocked, "88") : t.border)
      .bg(t.chrome).hover((s) => s.border_color(on ? t.accent : t.input))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .tooltip(on ? "On the stage" : "Show it on the stage")
      .child(h_flex().h(30).flex_none().px(10).gap(7).items_center().text_size(12)
        .bg(st === "blocked" ? alpha(t.blocked, "1c") : on ? t.raised : t.chrome)
        .border_b(1).border_color(t.border)
        .child(glyph(t, st))
        .child(icon(a.program, 14, t.foreground))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(what(a)))
        .when(a.pinned, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child("pinned")))
        .child(div().flex_none().text_size(11).text_color(st === "blocked" ? t.blocked : t.dim)
          .child(st === "idle" ? "idle" : `${WORDS[st] ?? st} ${span(now - started)}`)))
      .child(body);
  }

  wall(t, cx) {
    // The bar's Read now.
    const ask = shared(REFRESH) ?? null;
    if (ask !== this.refreshSeen) { this.refreshSeen = ask; this.readAll(cx); }
    const list = agents();
    this.track(list);
    const g = groups(spaces(), list);
    setAgentOrder(g.flatMap((x) => x.agents.map((a) => a.address)));
    const f = focused();
    const stageAddr = f?.agent ?? null;
    const now = Date.now();
    const gap = 10;
    const inner = Math.max(0, (this.width || 900) - 2);
    const cols = columns(inner, 280, gap);
    const width = Math.floor((inner - gap * (cols - 1)) / cols);
    const section = (x) => v_flex().flex_none().gap(8)
      .child(h_flex().gap(8).items_center().px(2)
        .child(div().text_size(13).font_semibold().text_color(x.space.active ? t.foreground : t.muted).child(x.space.name))
        .when(Boolean(x.space.machine), (el) => el.child(div().text_size(11).text_color(t.dim).child(x.space.machine)))
        .when(x.space.id !== "other", (el) => el.child(div().id(`wall-open-${x.space.id}`).text_size(11.5).text_color(t.dim).cursor_pointer()
          .hover((s) => s.text_color(t.foreground)).on_click(() => run("space.select", { id: x.space.id }))
          .child(`${x.agents.length} agent${x.agents.length === 1 ? "" : "s"}`))))
      .child(h_flex().flex_wrap().gap(gap).items_start().children(x.agents.map((a) => this.tile(t, a, width, stageAddr, now))));
    return v_flex().id("wall").size_full().min_h(0).min_w(0)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 2) { this.width = size.width; cx.notify(); } })
      .when(this.missing, (el) => el.child(div().flex_none().mb(8).p(10).rounded(8).bg(alpha(t.blocked, "1c")).text_size(12).text_color(t.blocked)
        .child("Woolshed Core's hc isn't on this computer's PATH, so screens can't be read. Reinstall Woolshed, or put ~/.local/bin on your PATH.")))
      .when(list.length === 0, (el) => el.child(v_flex().flex_1().items_center().justify_center().gap(10).rounded(12).border_1().border_color(t.border).bg(t.chrome)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child("No agents yet"))
        .child(div().text_size(12.5).text_color(t.dim).child("Every agent you start gets a tile here with the bottom of its screen."))
        .child(div().id("wall-empty-new").mt(4).h(30).px(14).flex().items_center().rounded(8).bg(t.solid).text_color(t.solid_foreground).text_size(12.5)
          .cursor_pointer().hover((s) => s.opacity(0.85)).on_click(() => this.newAgent()).child("+ New agent"))))
      .when(list.length > 0, (el) => el.child(v_flex().id("wall-scroll").flex_1().min_h(0).gap(16).overflow_y_scrollbar()
        .children(g.map(section))
        .when(list.length > READ_MAX, (el) => el.child(div().text_size(11.5).text_color(t.dim)
          .child(`Screens are read for the first ${READ_MAX} agents; the rest show their status only.`)))));
  }

  render(cx) {
    const t = theme();
    if (this.role === "bar") return this.bar(t);
    return this.wall(t, cx);
  }
}
