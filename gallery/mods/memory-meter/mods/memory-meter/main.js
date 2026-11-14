// Memory meter: how much memory is in use, what's using it, the system's
// memory pressure and swap. Reads every 10 seconds while it's open (a window)
// or while its block is in the layout (a strip). Read-only: macOS runs
// `vm_stat` and `sysctl -n hw.memsize vm.swapusage
// kern.memorystatus_vm_pressure_level`; Linux reads /proc/meminfo and
// /proc/pressure/memory with `cat`.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { readMac, readLinux, size } from "./parse.js";

const EVERY = 10000;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const share = (part, whole) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);
const LABEL = { normal: "Normal", warning: "Warning", critical: "Critical" };

export default class MemoryMeter extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.mem = null;
    this.error = null;
    this.wide = true;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  async read() {
    const platform = appWindow()?.platform;
    if (platform === "windows") throw new Error("The memory meter isn't on Windows yet.");
    if (platform === "linux") {
      const info = await exec("cat", ["/proc/meminfo"], { timeout: 5000 });
      const psi = await exec("cat", ["/proc/pressure/memory"], { timeout: 5000 }).catch(() => null);
      return readLinux(info.stdout, psi?.code === 0 ? psi.stdout : "");
    }
    const vm = await exec("vm_stat", [], { timeout: 5000 });
    // The pressure level is missing on some versions: ask for it last so the rest still prints.
    const sys = await exec("sysctl", ["-n", "hw.memsize", "vm.swapusage", "kern.memorystatus_vm_pressure_level"], { timeout: 5000 });
    return readMac(vm.stdout, sys.stdout);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const mem = await this.read();
        if (!mem) throw new Error("Couldn't read this computer's memory.");
        this.mem = mem;
        this.error = null;
      } catch (e) {
        const text = String(e?.message ?? e);
        this.error = /ENOENT|not found|No such file/i.test(text) ? "vm_stat isn't installed here." : text;
      }
      this.busy = false;
      cx.notify();
    });
  }

  tone(t, pressure) { return pressure === "critical" ? t.blocked : pressure === "warning" ? t.working : t.ansi2; }

  // The used memory as a stacked bar: each part a shade of the accent color.
  bar(t, mem, height) {
    const shades = ["", "aa", "66"];
    return h_flex().w_full().h(height).rounded(height / 2).overflow_hidden().bg(alpha(t.foreground, "14"))
      .children(mem.parts.map((p, i) => div().h_full().w(`${share(p.bytes, mem.total).toFixed(1)}%`).bg(alpha(t.accent, shades[i] ?? "55"))));
  }

  strip(t) {
    const m = this.mem;
    return h_flex().id("memory-meter").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .on_size_change((box, cx) => { const wide = box.width > 200; if (wide !== this.wide) { this.wide = wide; cx.notify(); } })
      .tooltip(this.error ?? (m ? `Pressure: ${LABEL[m.pressure] ?? "unknown"} · swap ${size(m.swap.used)}` : "Memory"))
      .child(div().flex_none().text_color(t.dim).child("Memory"))
      .child(div().flex_none().font_semibold().text_color(this.error ? t.blocked : t.foreground)
        .child(this.error ? "!" : m ? `${Math.round(share(m.used, m.total))}%` : "…"))
      .when(Boolean(m) && this.wide, (el) => el.child(div().w(64).flex_none().child(this.bar(t, m, 6))))
      .when(Boolean(m?.pressure), (el) => el.child(div().size(7).flex_none().rounded(4).bg(this.tone(t, m.pressure))))
      .when(Boolean(m) && this.wide, (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`${size(m.used)} of ${size(m.total)}`)));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const m = this.mem;
    const legendShades = ["", "aa", "66"];
    return v_flex().id("memory-meter").w(320).pb(14).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Memory"))
        .when(Boolean(m), (el) => el.child(div().text_size(11).text_color(t.dim).child(`${size(m.total)} installed`)))
        .child(div().id("mem-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).text_color(t.blocked).child(this.error)))
      .when(!this.error && !m, (el) => el.child(div().px(16).text_color(t.dim).child("Reading…")))
      .when(Boolean(m), (el) => el
        .child(h_flex().px(16).gap(8).items_end()
          .child(div().flex_none().text_size(28).font_semibold().text_color(t.foreground).child(size(m.used)))
          .child(div().flex_1().min_w(0).pb(5).truncate().text_color(t.muted).child(`used of ${size(m.total)}`))
          .when(Boolean(m.pressure), (el) => el.child(h_flex().flex_none().mb(5).px(8).h(22).gap(6).items_center().rounded(11)
            .bg(alpha(this.tone(t, m.pressure), "1f"))
            .tooltip("How hard the system is working to find memory")
            .child(div().size(7).rounded(4).bg(this.tone(t, m.pressure)))
            .child(div().text_size(11.5).text_color(t.foreground).child(`Pressure: ${LABEL[m.pressure]}`)))))
        .child(div().px(16).pt(10).child(this.bar(t, m, 10)))
        .child(h_flex().px(16).pt(8).gap(12).flex_wrap().text_size(11.5).children(m.parts.map((p, i) =>
          h_flex().gap(5).items_center()
            .child(div().size(7).rounded(4).bg(alpha(t.accent, legendShades[i] ?? "55")))
            .child(div().text_color(t.muted).child(`${p.name} ${size(p.bytes)}`)))))
        .child(v_flex().px(16).pt(14).gap(5)
          .child(h_flex().text_size(11.5)
            .child(div().flex_1().text_color(t.dim).child("Swap"))
            .child(div().text_color(m.swap.total && m.swap.used / m.swap.total > 0.75 ? t.working : t.muted)
              .child(m.swap.total ? `${size(m.swap.used)} of ${size(m.swap.total)}` : "none in use")))
          .when(m.swap.total > 0, (el) => el.child(div().w_full().h(4).rounded(2).bg(alpha(t.foreground, "14"))
            .child(div().h_full().rounded(2).w(`${share(m.swap.used, m.swap.total).toFixed(1)}%`).bg(m.swap.used / m.swap.total > 0.75 ? t.working : alpha(t.accent, "aa"))))))
        .when(m.cached > 0, (el) => el.child(div().px(16).pt(10).text_size(11).text_color(t.dim)
          .child(`Cached files ${size(m.cached)}: given back when apps need it`))))
      .child(div().px(16).pt(8).text_size(11).text_color(t.dim).child("Updates every 10 seconds"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}
