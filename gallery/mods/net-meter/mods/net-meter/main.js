// Network meter: download and upload per second, a two-minute sparkline of
// each, and today's totals. Reads every 5 seconds while it's open (a window)
// or while its block is in the layout (a strip). Read-only: macOS runs
// `netstat -ib`; Linux reads /proc/net/dev with `cat`. Today's totals are kept
// in this copy's localStorage, so the time it was closed still counts.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { parseNetstat, parseProcNetDev, moved, accrue, bytes, rate } from "./parse.js";

const EVERY = 5000;
const KEEP = 24; // two minutes of samples
const SAVE = "net-meter.today";
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default class NetMeter extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.last = null; // { reading, at }
    this.down = [];
    this.up = [];
    this.error = null;
    this.saved = 0;
    try { this.today = JSON.parse(localStorage.getItem(SAVE) ?? "null"); } catch { this.today = null; }
    this.wide = true;
    cx.timer.every(EVERY, (cx) => this.sample(cx));
    this.sample(cx);
  }

  async read() {
    const platform = appWindow()?.platform;
    if (platform === "windows") throw new Error("The network meter isn't on Windows yet.");
    if (platform === "linux") return parseProcNetDev((await exec("cat", ["/proc/net/dev"], { timeout: 5000 })).stdout);
    return parseNetstat((await exec("netstat", ["-ib"], { timeout: 10000 })).stdout);
  }

  sample(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const reading = await this.read();
        const at = Date.now();
        if (this.last) {
          const d = moved(this.last.reading, reading);
          const s = Math.max(1, (at - this.last.at) / 1000);
          this.down = [...this.down, d.rx / s].slice(-KEEP);
          this.up = [...this.up, d.tx / s].slice(-KEEP);
        }
        this.last = { reading, at };
        this.today = accrue(this.today, reading, at, today());
        if (at - this.saved > 30000) {
          this.saved = at;
          try { localStorage.setItem(SAVE, JSON.stringify(this.today)); } catch {}
        }
        this.error = Object.keys(reading).length ? null : "No network interface found.";
      } catch (e) {
        const text = String(e?.message ?? e);
        this.error = /ENOENT|not found|No such file/i.test(text) ? "netstat isn't installed here." : text;
      }
      this.busy = false;
      cx.notify();
    });
  }

  bars(t, list, count, height, color, top) {
    const all = [...this.down, ...this.up];
    const peak = Math.max(1, top ?? Math.max(1, ...all));
    const shown = list.slice(-count);
    const pad = Array(Math.max(0, count - shown.length)).fill(null);
    return h_flex().h(height).items_end().gap(2).children([...pad, ...shown].map((v) =>
      div().flex_1().min_w(1).rounded(1)
        .h(v === null ? 1 : Math.max(1, Math.round(Math.sqrt(v / peak) * height)))
        .bg(v === null ? alpha(t.foreground, "14") : color)));
  }

  strip(t) {
    const d = this.down[this.down.length - 1], u = this.up[this.up.length - 1];
    return h_flex().id("net-meter").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .on_size_change((box, cx) => { const wide = box.width > 230; if (wide !== this.wide) { this.wide = wide; cx.notify(); } })
      .tooltip(this.error ?? (this.today ? `Today ${bytes(this.today.rx)} down · ${bytes(this.today.tx)} up` : "Network"))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child("Network !")))
      .when(!this.error, (el) => el
        .child(div().flex_none().text_color(t.accent).child("↓"))
        .child(div().flex_none().font_semibold().text_color(t.foreground).child(d === undefined ? "…" : rate(d)))
        .child(div().flex_none().text_color(t.ansi2).child("↑"))
        .child(div().flex_none().text_color(t.muted).child(u === undefined ? "…" : rate(u)))
        .when(this.wide, (el) => el.child(div().flex_1().min_w(0).max_w(80).child(this.bars(t, this.down, 12, 14, t.accent)))));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const d = this.down[this.down.length - 1], u = this.up[this.up.length - 1];
    const names = Object.keys(this.last?.reading ?? {}).filter((n) => {
      const r = this.last.reading[n];
      return r.rx > 0 || r.tx > 0;
    });
    const peak = Math.max(0, ...this.down, ...this.up);
    const big = (arrow, color, label, value) => v_flex().flex_1().min_w(0).gap(1)
      .child(h_flex().gap(5).items_center().text_size(11.5)
        .child(div().text_color(color).child(arrow))
        .child(div().text_color(t.dim).child(label)))
      .child(div().text_size(22).font_semibold().truncate().text_color(t.foreground).child(value === undefined ? "…" : rate(value)));
    return v_flex().id("net-meter").w(320).pb(14).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Network"))
        .when(names.length > 0, (el) => el.child(div().max_w(140).truncate().text_size(11).text_color(t.dim).child(names.join(", "))))
        .child(div().id("net-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).pb(4).text_color(t.blocked).child(this.error)))
      .when(!this.error, (el) => el
        .child(h_flex().px(16).gap(12)
          .child(big("↓", t.accent, "Down", d))
          .child(big("↑", t.ansi2, "Up", u)))
        .child(v_flex().px(16).pt(12).gap(5)
          .child(h_flex().text_size(11).text_color(t.dim)
            .child(div().flex_1().child("Last 2 minutes"))
            .when(peak > 0, (el) => el.child(div().child(`peak ${rate(peak)}`))))
          .child(v_flex().p(6).gap(3).rounded(6).bg(alpha(t.foreground, "08"))
            .child(this.bars(t, this.down, KEEP, 30, t.accent))
            .child(this.bars(t, this.up, KEEP, 16, t.ansi2)))))
      .when(Boolean(this.today), (el) => el.child(h_flex().px(16).pt(12).gap(6).items_center().text_size(11.5)
        .tooltip(`Counted since ${hhmm(this.today.since)}, when this first looked today`)
        .child(div().text_color(t.dim).child("Today"))
        .child(div().text_color(t.accent).child("↓"))
        .child(div().text_color(t.foreground).child(bytes(this.today.rx)))
        .child(div().text_color(t.ansi2).child("↑"))
        .child(div().text_color(t.foreground).child(bytes(this.today.tx)))
        .child(div().flex_1().min_w(0).truncate().text_right().text_color(t.dim).child(`since ${hhmm(this.today.since)}`))))
      .child(div().px(16).pt(8).text_size(11).text_color(t.dim).child("Updates every 5 seconds"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}
