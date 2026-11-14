// CPU meter: how busy this computer is, and the load average, with a
// two-minute sparkline. Samples every 5 seconds while it's open (a window) or
// while its block is in the layout (a strip). Read-only: macOS runs
// `top -l 2 -n 0 -s 1` (and `sysctl -n hw.ncpu` once); Linux reads
// /proc/stat and /proc/loadavg with `cat`.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { parseTop, parseProcStat, usage } from "./parse.js";

const EVERY = 5000;
const KEEP = 24; // two minutes of samples
const HOT = 85;

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const pct = (v) => `${Math.round(v)}%`;
const load = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(2));

export default class CpuMeter extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.samples = [];
    this.now = null;
    this.load = null;
    this.cores = null;
    this.error = null;
    this.ticks = null;
    this.wide = true;
    cx.timer.every(EVERY, (cx) => this.sample(cx));
    this.sample(cx);
  }

  async read() {
    const platform = appWindow()?.platform;
    if (platform === "windows") throw new Error("The CPU meter isn't on Windows yet.");
    if (platform === "linux") {
      const r = await exec("cat", ["/proc/stat", "/proc/loadavg"], { timeout: 5000 });
      const s = parseProcStat(r.stdout);
      if (!s) throw new Error("Couldn't read /proc/stat.");
      const u = usage(this.ticks, s.ticks);
      this.ticks = s.ticks;
      this.cores = s.cores || this.cores;
      return { cpu: u, load: s.load };
    }
    if (this.cores === null) {
      const n = await exec("sysctl", ["-n", "hw.ncpu"], { timeout: 5000 }).catch(() => null);
      this.cores = Number(n?.stdout.trim()) || null;
    }
    const r = await exec("top", ["-l", "2", "-n", "0", "-s", "1"], { timeout: 15000 });
    const s = parseTop(r.stdout);
    if (!s) throw new Error(r.stderr.trim() || "top printed no CPU usage.");
    return { cpu: s, load: s.load };
  }

  sample(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const { cpu, load } = await this.read();
        this.error = null;
        this.load = load ?? this.load;
        if (cpu) {
          this.now = cpu;
          this.samples = [...this.samples, cpu.busy].slice(-KEEP);
        }
      } catch (e) {
        const text = String(e?.message ?? e);
        this.error = /ENOENT|not found|No such file/i.test(text) ? "top isn't installed here." : text;
      }
      this.busy = false;
      cx.notify();
    });
  }

  color(t, v) { return v >= HOT ? t.blocked : t.accent; }

  // Bars, oldest left; the ones not sampled yet are flat.
  sparkline(t, count, height, gap) {
    const list = this.samples.slice(-count);
    const pad = Array(Math.max(0, count - list.length)).fill(null);
    return h_flex().h(height).items_end().gap(gap).children([...pad, ...list].map((v) =>
      div().flex_1().min_w(1).rounded(1)
        .h(v === null ? 1 : Math.max(1, Math.round((v / 100) * height)))
        .bg(v === null ? alpha(t.foreground, "14") : this.color(t, v))));
  }

  strip(t) {
    const v = this.now?.busy;
    return h_flex().id("cpu-meter").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .on_size_change((box, cx) => { const wide = box.width > 180; if (wide !== this.wide) { this.wide = wide; cx.notify(); } })
      .tooltip(this.error ?? (this.load ? `Load ${this.load.map(load).join(" · ")}` : "CPU use"))
      .child(div().flex_none().text_color(t.dim).child("CPU"))
      .child(div().flex_none().font_semibold().text_color(this.error ? t.blocked : v >= HOT ? t.blocked : t.foreground)
        .child(this.error ? "!" : v === undefined ? "…" : pct(v)))
      .when(this.wide, (el) => el.child(div().w(72).flex_none().child(this.sparkline(t, 12, 14, 1))))
      .when(this.wide && Boolean(this.load), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(load(this.load[0]))));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const now = this.now;
    const peak = this.samples.length ? Math.max(...this.samples) : null;
    const loadTone = (v) => (this.cores && v > this.cores ? t.blocked : t.foreground);
    return v_flex().id("cpu-meter").w(320).pb(14).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("CPU"))
        .when(Boolean(this.cores), (el) => el.child(div().text_size(11).text_color(t.dim).child(`${this.cores} cores`)))
        .child(div().id("cpu-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).text_color(t.blocked).child(this.error)))
      .when(!this.error && !now, (el) => el.child(div().px(16).text_color(t.dim).child("Measuring…")))
      .when(Boolean(now), (el) => el
        .child(h_flex().px(16).gap(14).items_center()
          .child(div().flex_none().text_size(34).font_semibold().text_color(now.busy >= HOT ? t.blocked : t.foreground).child(pct(now.busy)))
          .child(v_flex().flex_1().min_w(0).gap(3).text_size(11.5)
            .child(h_flex().gap(6)
              .child(div().size(7).rounded(4).bg(t.accent))
              .child(div().text_color(t.muted).child(`user ${pct(now.user)}`))
              .child(div().size(7).rounded(4).bg(alpha(t.accent, "88")))
              .child(div().text_color(t.muted).child(`system ${pct(now.sys)}`)))
            .child(div().text_color(t.dim).child(`idle ${pct(now.idle)}`))))
        .child(v_flex().px(16).pt(12).gap(5)
          .child(h_flex().text_size(11).text_color(t.dim)
            .child(div().flex_1().child("Last 2 minutes"))
            .when(peak !== null, (el) => el.child(div().child(`peak ${pct(peak)}`))))
          .child(div().p(6).rounded(6).bg(alpha(t.foreground, "08")).child(this.sparkline(t, KEEP, 44, 2)))))
      .when(Boolean(this.load), (el) => el.child(v_flex().px(16).pt(12).gap(4)
        .child(div().text_size(11).text_color(t.dim).child(this.cores ? `Load average (${this.cores} cores = full)` : "Load average"))
        .child(h_flex().gap(14).children(["1 min", "5 min", "15 min"].map((label, i) =>
          v_flex().flex_1().gap(1)
            .child(div().text_size(15).font_semibold().text_color(loadTone(this.load[i])).child(load(this.load[i])))
            .child(div().text_size(11).text_color(t.dim).child(label)))))))
      .child(div().px(16).pt(10).text_size(11).text_color(t.dim).child(this.busy && !now ? "" : "Updates every 5 seconds"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}
