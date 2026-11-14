// Machines health: this computer and every machine Woolshed Core knows
// (`hc machine ls --json`), whether each is reachable, and its load and
// uptime. Every 60 seconds while it's open (a window) or while its block is in
// the layout (a strip), it runs `uptime` and the core count (`nproc`, else
// `sysctl -n hw.ncpu`) through `sh` on each connected machine, with a
// 15-second limit. Shell opens a new space on that machine.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, hc, run, theme, props, closeOverlay } from "woolshed";
import { parseMachines, parseUptime, since, strain } from "./parse.js";

const EVERY = 60000;
const PROBE = "uptime; nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null";
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const STATE = { connected: "reachable", connecting: "connecting…", needs_login: "needs a login", needs_update: "needs an update", unreachable: "unreachable" };

export default class MachinesHealth extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.machines = null;
    this.error = null;
    this.health = new Map(); // name ("" for here) → { load, up, users, cores } | { error }
    this.hover = null;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  async probe(on) {
    try {
      const options = { timeout: 15000 };
      if (on) options.on = on;
      const r = await exec("sh", ["-c", PROBE], options);
      return parseUptime(r.stdout) ?? { error: "no uptime there" };
    } catch (e) {
      const text = String(e?.message ?? e);
      return { error: /ENOENT|not found|No such file/i.test(text) ? "no uptime there" : /time/i.test(text) ? "didn't answer in 15 s" : text.split("\n")[0] };
    }
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        const list = parseMachines(r.stdout);
        if (!list) throw new Error(r.stderr.trim() || "Woolshed Core didn't list its machines.");
        this.machines = list;
        this.error = null;
      } catch (e) { this.error = String(e?.message ?? e); }
      cx.notify();
      const names = ["", ...(this.machines ?? []).filter((m) => m.state === "connected").map((m) => m.name)];
      const results = await Promise.all(names.map((n) => this.probe(n)));
      const next = new Map();
      names.forEach((n, i) => next.set(n, results[i]));
      this.health = next;
      this.busy = false;
      cx.notify();
    });
  }

  tone(t, state) {
    return state === "connected" ? t.ansi2 : state === "unreachable" ? t.blocked : t.working;
  }

  loadView(t, h) {
    if (!h) return div().text_size(11.5).text_color(t.dim).child("…");
    if (h.error) return div().max_w(150).truncate().text_size(11.5).text_color(t.dim).child(h.error);
    const s = strain(h.load, h.cores);
    const color = s === "over" ? t.blocked : s === "busy" ? t.working : t.accent;
    const share = h.load && h.cores ? Math.min(1, h.load[0] / h.cores) : 0;
    return h_flex().flex_none().gap(8).items_center()
      .child(div().w(54).h(5).rounded(3).bg(alpha(t.foreground, "14"))
        .child(div().h_full().rounded(3).w(`${Math.max(3, share * 100).toFixed(0)}%`).bg(color)))
      .child(div().w(108).flex_none().truncate().text_size(11.5).text_color(s === "ok" ? t.muted : color)
        .tooltip(h.cores ? `Load over the last 1, 5 and 15 minutes, on ${h.cores} cores` : "Load over the last 1, 5 and 15 minutes")
        .child(h.load ? h.load.map((v) => (v >= 10 ? v.toFixed(0) : v.toFixed(2))).join("  ") : "–"));
  }

  row(t, key, title, sub, state, h) {
    const stop = (_e, cx) => cx.stop_propagation();
    const here = key === "";
    const canShell = !here && state === "connected";
    return h_flex().id(`mh-${key || "here"}`).flex_none().mx(6).px(10).py(7).gap(10).items_center().rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover((v, cx) => { if (v !== (this.hover === key)) { this.hover = v ? key : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .child(div().size(8).flex_none().rounded(4).bg(this.tone(t, state)))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().max_w(150).truncate().font_semibold().text_color(t.foreground).child(title))
          .when(Boolean(h?.up !== undefined && h?.up !== null), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(`up ${since(h.up)}`))))
        .child(div().truncate().text_size(11.5).text_color(state === "unreachable" ? t.blocked : t.dim).child(sub)))
      .when(state === "connected", (el) => el.child(this.loadView(t, h)))
      .when(canShell && this.hover === key, (el) => el.child(div().id(`mh-shell-${key}`).flex_none().h(22).px(8).flex().items_center().rounded(6)
        .text_size(11.5).bg(t.raised).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.selected))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: key }); })
        .tooltip(`A new space on ${key}`)
        .child("Shell")));
  }

  strip(t) {
    const list = this.machines ?? [];
    const up = list.filter((m) => m.state === "connected").length;
    const down = list.filter((m) => m.state === "unreachable").length;
    const busy = [...this.health.values()].filter((h) => !h.error && strain(h.load, h.cores) !== "ok").length;
    return h_flex().id("machines-health").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .tooltip(this.error ?? (list.map((m) => `${m.name}: ${STATE[m.state] ?? m.state}`).join("\n") || "No other machines"))
      .child(div().flex_none().text_color(t.dim).child("Machines"))
      .child(h_flex().flex_none().gap(3).children(list.slice(0, 10).map((m) => div().size(7).rounded(4).bg(this.tone(t, m.state)))))
      .child(div().flex_1().min_w(0).truncate().text_color(down ? t.blocked : busy ? t.working : t.muted)
        .child(this.error ? "!" : this.machines === null ? "…" : !list.length ? "only this one" : down ? `${down} unreachable` : busy ? `${busy} busy` : `${up} reachable`));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const list = this.machines ?? [];
    const here = this.health.get("");
    return v_flex().id("machines-health").w(440).pb(10).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Machines"))
        .child(div().id("mh-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .child(div().id("mh-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .child(this.row(t, "", "This computer", here?.users ? `${here.users} user${here.users === 1 ? "" : "s"} logged in` : "here", "connected", here))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("mh-rows").flex_none().max_h(380).gap(1).overflow_y_scrollbar()
        .children(list.map((m) => {
          const sub = m.state === "unreachable"
            ? `unreachable${m.since ? ` since ${hhmm(m.since)}` : ""}${m.why ? ` · ${m.why}` : ""}`
            : [m.host && m.host !== m.name ? m.host : null, STATE[m.state] ?? m.state, m.temporary ? "short-lived" : null].filter(Boolean).join(" · ");
          return this.row(t, m.name, m.name, sub, m.state, this.health.get(m.name));
        })))
      .when(this.machines !== null && !list.length && !this.error, (el) => el.child(h_flex().mx(16).mt(6).gap(10).items_center()
        .child(div().flex_1().text_color(t.dim).child("No other machines yet. Add one you reach with ssh, and its load shows here."))
        .child(div().id("mh-add").flex_none().h(26).px(10).flex().items_center().rounded(7).text_size(12).cursor_pointer()
          .bg(t.solid).text_color(t.solid_foreground).hover((s) => s.opacity(0.85))
          .on_mouse_down("left", stop)
          .on_click(() => run("mod.open", { name: "machine-add" }))
          .child("Add a machine"))))
      .child(div().px(16).pt(8).text_size(11).text_color(t.dim).child("Load: 1, 5 and 15 minutes · updates every minute"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}
