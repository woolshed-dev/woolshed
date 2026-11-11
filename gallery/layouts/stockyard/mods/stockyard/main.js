// Stockyard: every agent's live terminal at once, each in its own pen, in a
// grid that grows with them (up to 12). Type into any pen; zoom one to give it
// the whole yard. The bar keeps the layout's "yard" node in step with the
// agents (layout.set, only when the set of agents changes).
// Props: { role: "bar" | "tag" | "empty" | "filler", terminal } (tag: a pen's
// header, told its terminal).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, focused, layout, run, shared, setShared, theme, props, window as appWindow, openOverlay, setAgentOrder } from "woolshed";

const NAME = "stockyard";
const ZOOM = "stockyard.zoom";
const MAX = 12;
const SPIN = "mods/stockyard/spinner.svg";
const WORDS = { blocked: "needs you", working: "working", done: "finished", idle: "idle" };

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
const slug = (addr) => String(addr).replace(/[^A-Za-z0-9_-]/g, "-");

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

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

// Columns and rows for n pens: wide rather than tall.
export function shape(n) {
  if (n <= 3) return [Math.max(1, n), 1];
  if (n === 4) return [2, 2];
  if (n <= 6) return [3, 2];
  if (n <= 8) return [4, 2];
  if (n === 9) return [3, 3];
  return [4, 3];
}

function pen(addr) {
  const s = slug(addr);
  return {
    id: `pen-${s}`, type: "column", background: "background", border: { width: 1, color: "border" }, radius: 10,
    focus: { border: { width: 1, color: "accent" } }, resizable: false,
    children: [
      { id: `tag-${s}`, type: "block", size: { px: 30 }, content: { mod: NAME, props: { role: "tag", terminal: addr } } },
      { id: `term-${s}`, type: "block", content: { terminal: addr } },
    ],
  };
}

export function yard(addrs) {
  if (!addrs.length) return [{ id: "yard-empty", type: "block", content: { mod: NAME, props: { role: "empty" } } }];
  const [cols, rows] = shape(addrs.length);
  const out = [];
  for (let r = 0; r < rows; r++) {
    const kids = addrs.slice(r * cols, r * cols + cols).map(pen);
    // Short last row: blank pens keep the columns lined up.
    for (let i = kids.length; i < cols; i++) kids.push({ id: `blank-${r}-${i}`, type: "block", content: { mod: NAME, props: { role: "filler" } } });
    out.push({ id: `yard-row-${r}`, type: "row", gap: 8, children: kids });
  }
  return out;
}

function penned(node) {
  const out = [];
  const walk = (n) => { if (n?.content?.terminal) out.push(n.content.terminal); for (const c of n?.children ?? []) walk(c); };
  walk(node);
  return out;
}

// Who gets a pen: the zoomed one alone; else everyone in list order, pinned
// first. Past 12, the ones that need you most.
export function pick(list, zoom) {
  if (zoom && list.some((a) => a.address === zoom)) return [zoom];
  const rank = { blocked: 0, working: 1, done: 2, idle: 3 };
  const chosen = list.length > MAX
    ? new Set([...list].sort((x, y) => Number(y.pinned) - Number(x.pinned) || (rank[x.status] ?? 4) - (rank[y.status] ?? 4)).slice(0, MAX).map((a) => a.address))
    : new Set(list.map((a) => a.address));
  return [...list.filter((a) => a.pinned), ...list.filter((a) => !a.pinned)].map((a) => a.address).filter((x) => chosen.has(x));
}

export default class Stockyard extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "bar";
    this.terminal = props()?.terminal ?? null;
    try { this.since = JSON.parse(localStorage.getItem("since") ?? "{}"); } catch { this.since = {}; }
    if (this.role === "tag") cx.timer.every(30000, (cx) => cx.notify());
  }

  // Rewrites the yard when the agents in it should change; never twice in a row for the same set.
  keep(list) {
    const l = layout();
    const node = find(l, "yard");
    if (!node) return;
    const want = pick(list, shared(ZOOM));
    const sig = want.join("\u0000");
    if (sig === penned(node).join("\u0000")) return;
    if (this.lastSig === sig && Date.now() - this.lastAt < 4000) return;
    this.lastSig = sig;
    this.lastAt = Date.now();
    const next = JSON.parse(JSON.stringify(l));
    find(next, "yard").children = yard(want);
    run("layout.set", { layout: next });
  }

  newAgent() { openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }); }

  bar(t) {
    const list = agents();
    this.keep(list);
    const order = pick(list, null);
    setAgentOrder(order);
    const zoom = shared(ZOOM);
    const zoomed = list.find((a) => a.address === zoom);
    const n = (s) => list.filter((a) => a.status === s).length;
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action, strong = false) => div().id(id).h(26).px(10).flex().items_center().rounded(7).text_size(12)
      .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.foreground).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);
    const winButton = (id, label, command) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    const stat = (color, text) => h_flex().gap(5).items_center().child(div().size(7).rounded(4).bg(color)).child(div().text_color(t.muted).child(text));
    return h_flex().id("stockyard-bar").size_full().pl(mac ? 82 : 14).pr(8).gap(14).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(12)
      .child(div().font_semibold().text_size(13.5).text_color(t.foreground).child("Stockyard"))
      .child(div().text_color(t.dim).child(`${list.length} agent${list.length === 1 ? "" : "s"}`))
      .when(n("blocked") > 0, (el) => el.child(stat(t.blocked, `${n("blocked")} need you`)))
      .when(n("working") > 0, (el) => el.child(stat(t.working, `${n("working")} working`)))
      .when(list.length > MAX && !zoomed, (el) => el.child(div().text_color(t.dim).child(`${MAX} shown, ${list.length - MAX} more`)))
      .child(div().flex_1())
      .when(Boolean(zoomed), (el) => el
        .child(div().text_color(t.muted).child(`Showing ${zoomed.space_name} · ${what(zoomed)}`))
        .child(button("yard-all", "Show all", () => setShared(ZOOM, null))))
      .child(button("yard-new", "+ New agent", () => this.newAgent(), true))
      .when(Boolean(w?.buttons), (el) => el
        .child(winButton("yard-min", "–", "window.minimize"))
        .child(winButton("yard-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("yard-close", "✕", "window.close")));
  }

  tag(t) {
    const addr = this.terminal;
    const a = agents().find((x) => x.address === addr);
    const now = Date.now();
    if (a && this.since.s !== a.status) {
      this.since = { s: a.status, at: now };
      try { localStorage.setItem("since", JSON.stringify(this.since)); } catch {}
    }
    const f = focused();
    const on = f?.terminal === addr && !f?.pane;
    const zoomed = shared(ZOOM) === addr;
    const st = a?.status;
    const color = t[st] ?? t.dim;
    const stop = (_e, cx) => cx.stop_propagation();
    const glyph = st === "working" ? svg(SPIN).size(11).flex_none().text_color(t.working).spin(900)
      : st === "idle" ? div().size(8).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim)
      : div().size(8).flex_none().rounded(4).bg(color);
    return h_flex().id(`tag-${slug(addr)}`).size_full().min_w(0).px(10).gap(8).items_center().cursor_pointer()
      .bg(st === "blocked" ? alpha(t.blocked, "1c") : t.background).border_b(1).border_color(t.border).text_size(12)
      .on_click(() => run("pane.focus", { terminal: addr }))
      .child(glyph)
      .child(a ? icon(a.program, 14, t.foreground) : div())
      .child(div().flex_none().max_w(160).truncate().font_semibold().text_color(on ? t.foreground : t.muted).child(a?.space_name ?? addr))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(a ? what(a) : "ended"))
      .when(Boolean(st), (el) => el.child(div().flex_none().text_size(11.5).text_color(st === "idle" ? t.dim : color)
        .child(`${WORDS[st] ?? st} ${span(now - (this.since.at ?? now))}`)))
      .child(div().id(`zoom-${slug(addr)}`).size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); setShared(ZOOM, zoomed ? null : addr); })
        .tooltip(zoomed ? "Back to every pen" : "Give it the whole yard")
        .child(svg(zoomed ? "mods/stockyard/unzoom.svg" : "mods/stockyard/zoom.svg").size(13)));
  }

  empty(t) {
    return v_flex().id("yard-empty").size_full().items_center().justify_center().gap(10).rounded(12).border_1().border_color(t.border).bg(t.chrome)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("No agents yet"))
      .child(div().text_size(12.5).text_color(t.dim).child("Every agent you start gets a pen here, live, up to twelve at once."))
      .child(div().id("yard-empty-new").mt(4).h(30).px(14).flex().items_center().rounded(8).bg(t.solid).text_color(t.solid_foreground).text_size(12.5)
        .cursor_pointer().hover((s) => s.opacity(0.85)).on_click(() => this.newAgent()).child("+ New agent"));
  }

  render() {
    const t = theme();
    if (this.role === "tag") return this.tag(t);
    if (this.role === "empty") return this.empty(t);
    if (this.role === "filler") return div().size_full();
    return this.bar(t);
  }
}
