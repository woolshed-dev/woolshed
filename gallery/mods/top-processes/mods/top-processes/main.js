// Top processes: the 8 processes using the most CPU right now, with their
// memory, and the ones your agents started marked with the agent and its
// space. Stop asks first, then sends the process a TERM signal (`kill -TERM`);
// Woolshed, Woolshed Core and the system's own processes have no Stop.
// Reads every 5 seconds while it's open (a window) or while its block is in
// the layout (a strip): `ps -Ao pid=,ppid=,pcpu=,rss=,comm=` on macOS,
// `cat /proc/[0-9]*/stat` (through `sh`) on Linux.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, agents, terminals, theme, props, closeOverlay, notify, window as appWindow } from "woolshed";
import { parsePs, parseProcStat, cpuBetween, busiest, owners, protectedProcess, memory } from "./parse.js";

const EVERY = 5000;
const COUNT = 8;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

export default class TopProcesses extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.list = null;
    this.marks = new Map();
    this.error = null;
    this.prev = null; // Linux: the last reading, for CPU time between
    this.asking = null; // pid whose Stop is waiting for a yes
    this.failed = null; // { pid, text }
    this.hover = null;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  async read() {
    const platform = appWindow()?.platform;
    if (platform === "windows") throw new Error("Top processes isn't on Windows yet.");
    if (platform === "linux") {
      const r = await exec("sh", ["-c", "cat /proc/[0-9]*/stat 2>/dev/null"], { timeout: 10000 });
      const now = { at: Date.now(), list: parseProcStat(r.stdout) };
      const prev = this.prev;
      this.prev = now;
      if (!prev) return null; // the first reading only starts the clock
      return cpuBetween(prev.list, now.list, (now.at - prev.at) / 1000);
    }
    const r = await exec("ps", ["-Ao", "pid=,ppid=,pcpu=,rss=,comm="], { timeout: 10000 });
    return parsePs(r.stdout);
  }

  // Each Woolshed terminal's own process, labelled with its agent and space.
  roots() {
    const byAddress = new Map(agents().map((a) => [a.address, a]));
    const out = new Map();
    for (const t of terminals() ?? []) {
      if (!t?.pid) continue;
      const a = byAddress.get(t.address);
      out.set(Number(t.pid), a
        ? { label: `${a.program?.name ?? a.app ?? "agent"} · ${a.space_name}`, agent: true }
        : { label: t.program?.name ? `in ${t.program.name}` : "in a terminal", agent: false });
    }
    return out;
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const all = await this.read();
        if (all) {
          this.marks = owners(all, this.roots());
          this.list = busiest(all, COUNT);
        }
        this.error = null;
      } catch (e) {
        const text = String(e?.message ?? e);
        this.error = /ENOENT|not found|No such file/i.test(text) ? "ps isn't installed here." : text;
      }
      this.busy = false;
      cx.notify();
    });
  }

  stop(p, cx) {
    this.asking = null;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("kill", ["-TERM", String(p.pid)], { timeout: 5000 });
        if (r.code !== 0) throw new Error(r.stderr.replace(/^.*kill:\s*/s, "").trim() || `kill exited ${r.code}`);
        notify({ title: `Asked ${p.name} to stop`, body: `pid ${p.pid}`, level: "info", timeout: 5000 });
        this.failed = null;
      } catch (e) {
        this.failed = { pid: p.pid, text: /not permitted/i.test(String(e?.message ?? e)) ? "Not allowed: it belongs to another user or the system." : String(e?.message ?? e) };
      }
      cx.notify();
      this.look(cx);
    });
  }

  button(t, id, label, primary, onClick) {
    return div().id(id).flex_none().h(24).px(9).flex().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .bg(primary ? t.blocked : t.raised).text_color(primary ? t.accent_foreground : t.foreground)
      .hover((s) => s.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .child(label);
  }

  row(t, p) {
    const mark = this.marks.get(p.pid);
    const stop = (_e, cx) => cx.stop_propagation();
    const hot = p.cpu >= 80;
    if (this.asking === p.pid) {
      return h_flex().id(`proc-${p.pid}`).flex_none().mx(6).px(10).h(38).gap(8).items_center().rounded(8).bg(alpha(t.blocked, "14"))
        .on_mouse_down("left", stop)
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`Stop ${p.name} (pid ${p.pid})?`))
        .child(this.button(t, `proc-no-${p.pid}`, "Cancel", false, () => { this.asking = null; }))
        .child(this.button(t, `proc-yes-${p.pid}`, "Stop", true, (cx) => this.stop(p, cx)));
    }
    const canStop = !protectedProcess(p);
    return v_flex().id(`proc-${p.pid}`).flex_none().mx(6).px(10).py(6).gap(2).rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== (this.hover === p.pid)) { this.hover = h ? p.pid : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .tooltip(p.path && p.path !== p.name ? p.path : `pid ${p.pid}`)
      .child(h_flex().gap(10).items_center()
        .child(div().w(48).flex_none().font_semibold().text_color(hot ? t.blocked : t.foreground).child(`${p.cpu.toFixed(p.cpu >= 10 ? 0 : 1)}%`))
        .child(div().flex_none().max_w(150).truncate().text_color(t.foreground).child(p.name))
        .when(Boolean(mark), (el) => el.child(div().flex_none().max_w(140).truncate().px(5).rounded(4)
          .bg(mark.agent ? alpha(t.working, "26") : t.raised).text_size(11).text_color(mark.agent ? t.foreground : t.muted).child(mark.label)))
        .child(div().flex_1())
        .when(this.hover === p.pid && canStop, (el) => el.child(this.button(t, `proc-stop-${p.pid}`, "Stop…", false, () => { this.asking = p.pid; this.failed = null; })))
        .when(this.hover !== p.pid || !canStop, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(memory(p.rss)))))
      .child(div().ml(58).h(3).rounded(2).bg(alpha(t.foreground, "10"))
        .child(div().h_full().rounded(2).w(`${Math.min(100, p.cpu / Math.max(1, this.scale()) * 100).toFixed(1)}%`).bg(hot ? t.blocked : mark?.agent ? t.working : t.accent)))
      .when(this.failed?.pid === p.pid, (el) => el.child(div().ml(58).text_size(11).text_color(t.blocked).child(this.failed.text)));
  }

  // Bars are scaled to the busiest process (at least one full core).
  scale() { return Math.max(100, ...(this.list ?? []).map((p) => p.cpu)); }

  strip(t) {
    const p = this.list?.[0];
    const mark = p && this.marks.get(p.pid);
    return h_flex().id("top-processes").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .tooltip(this.error ?? ((this.list ?? []).slice(0, 5).map((x) => `${x.cpu.toFixed(0)}%  ${x.name}`).join("\n") || "Top processes"))
      .child(div().flex_none().text_color(t.dim).child("Top"))
      .child(div().flex_none().font_semibold().text_color(this.error ? t.blocked : t.foreground).child(this.error ? "!" : p ? `${p.cpu.toFixed(0)}%` : "…"))
      .when(Boolean(p), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(mark?.agent ? t.foreground : t.muted).child(mark?.agent ? `${p.name} (${mark.label})` : p.name)));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const list = this.list ?? [];
    return v_flex().id("top-processes").w(420).pb(10).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Top processes by CPU"))
        .child(div().id("proc-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .child(div().id("proc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).text_color(t.blocked).child(this.error)))
      .when(!this.error && this.list === null, (el) => el.child(div().px(16).text_color(t.dim).child("Measuring…")))
      .child(v_flex().id("proc-rows").flex_none().gap(1).children(list.map((p) => this.row(t, p))))
      .child(h_flex().px(16).pt(6).gap(6).items_center().text_size(11).text_color(t.dim)
        .child(div().size(7).rounded(4).bg(t.working))
        .child(div().flex_1().min_w(0).truncate().child("started by an agent · hover a row to stop it")));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}
