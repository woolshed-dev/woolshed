// Waiting chime: a sound when an agent starts needing you, and again every few
// minutes while it still waits, so a question never sits unheard. Quiet hours
// keep it silent at night. In a layout block it's a strip with the bell's
// state; as a window (mod.open waiting-chime) it has the settings.
// The bell rings from any copy that runs; the state is shared, so it rings once.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, run, playSound, theme, props, closeOverlay, shared, setShared, appHome } from "woolshed";
import * as fs from "fs/promises";
import { what, span, pad, plural } from "./words.js";
import { icon, closeButton, button, link, stop } from "./ui.js";
import { EVERY, inQuiet, ringStep, nextRing } from "./chime.js";

const SETTINGS = "waiting-chime.settings";
const STATE = "waiting-chime.state";
const BELL = "mods/waiting-chime/bell.svg";
const BELL_OFF = "mods/waiting-chime/bell-off.svg";
const TICK = 15000;
// The sounds Woolshed has: its two attention sounds (or the files settings.json's
// `sounds` names for them), plus any .mp3 in this mod's data folder.
const BUILT_IN = [{ id: "blocked", name: "Needs-you sound" }, { id: "done", name: "Done sound" }];

function settings() {
  const s = shared(SETTINGS) ?? {};
  return { on: true, every: 5, sound: "blocked", ...s, quiet: { on: false, from: 22, to: 8, ...(s.quiet ?? {}) } };
}
function state() { const s = shared(STATE); return { rung: {}, ...(s && typeof s === "object" ? s : {}) }; }
const hour = (h) => `${pad(h)}:00`;

export default class WaitingChime extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.sounds = BUILT_IN;
    this.seen = "";
    cx.timer.every(TICK, (cx) => { this.tick(); cx.notify(); });
    this.tick();
    if (this.overlay) cx.spawn(async (cx) => { await this.findSounds(); cx.notify(); });
  }

  dataDir() { return `${appHome()}/data/waiting-chime`; }

  async findSounds() {
    try {
      const names = (await fs.readdir(this.dataDir())).filter((n) => /\.mp3$/i.test(n)).sort();
      this.sounds = [...BUILT_IN, ...names.map((n) => ({ id: `data/waiting-chime/${n}`, name: n.replace(/\.mp3$/i, "") }))];
    } catch { this.sounds = BUILT_IN; }
  }

  tick() {
    const now = Date.now();
    const st = state();
    const s = settings();
    const { ring, dirty } = ringStep(st, agents(), now, s, new Date(now).getHours());
    if (ring) playSound(s.sound);
    if (dirty) setShared(STATE, st);
  }

  set(patch, cx) { setShared(SETTINGS, { ...settings(), ...patch }); this.tick(); cx.notify(); }

  // What the bell is doing, for the strip and the window's header.
  bell(t, s, st, waiting, now) {
    const quiet = s.quiet.on && inQuiet(new Date(now).getHours(), s.quiet.from, s.quiet.to);
    if (!s.on) return { icon: BELL_OFF, color: t.dim, text: "Bell off" };
    if (quiet) return { icon: BELL_OFF, color: t.muted, text: `Quiet hours till ${hour(s.quiet.to)}${waiting.length ? ` · ${waiting.length} waiting` : ""}` };
    if (!waiting.length) return { icon: BELL, color: t.muted, text: "Bell on · nobody waiting" };
    const next = nextRing(st, waiting, s);
    return { icon: BELL, color: t.blocked, text: `${waiting.length} waiting${next ? ` · next chime ${span(next - now)}` : ""}` };
  }

  strip(t, b) {
    return h_flex().id("waiting-chime").size_full().min_w(0).px(10).gap(7).items_center().text_size(12.5).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => run("mod.open", { name: "waiting-chime" }))
      .tooltip("Waiting chime: open its settings")
      .child(svg(b.icon).size(14).flex_none().text_color(b.color))
      .child(div().flex_1().min_w(0).truncate().text_color(b.color === t.blocked ? t.foreground : t.muted).child(b.text));
  }

  card(t, s, st, waiting, b, now) {
    const label = (text) => div().w(118).flex_none().text_color(t.muted).child(text);
    const line = (id, ...kids) => h_flex().id(id).flex_none().px(16).h(32).gap(6).items_center().children(kids);
    const step = (id, text, onClick, off = false) => div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(6)
      .bg(t.raised).text_color(off ? t.dim : t.foreground).when(!off, (el) => el.cursor_pointer().hover((x) => x.bg(t.hover)))
      .on_mouse_down("left", stop).on_click((e, cx) => { if (!off) onClick(e, cx); }).child(text);
    const toggle = (id, on, onClick) => link(t, id, on ? "on" : "off", onClick, { color: on ? t.done : t.dim });
    const i = Math.max(0, EVERY.indexOf(s.every));
    const sound = this.sounds.find((x) => x.id === s.sound) ?? { id: s.sound, name: s.sound.split("/").at(-1) };
    const nextSound = this.sounds[(this.sounds.findIndex((x) => x.id === s.sound) + 1) % this.sounds.length];
    const hourStep = (key, dir) => (_e, cx) => this.set({ quiet: { ...s.quiet, [key]: (s.quiet[key] + dir + 24) % 24 } }, cx);
    return v_flex().id("root").w(400).min_h(0).pb(4).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(svg(b.icon).size(15).flex_none().text_color(b.color))
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Waiting chime"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(b.text))
        .child(closeButton(t, "wc-close", () => closeOverlay(this.overlay))))
      .child(line("wc-on", label("Bell"), toggle("wc-toggle", s.on, (_e, cx) => this.set({ on: !s.on }, cx)),
        div().flex_1().text_size(11.5).text_color(t.dim).child("rings when an agent starts needing you")))
      .child(line("wc-every", label("Again every"),
        step("wc-less", "−", (_e, cx) => this.set({ every: EVERY[Math.max(0, i - 1)] }, cx), i === 0),
        div().min_w(64).text_center().font_semibold().text_color(t.foreground).child(s.every ? `${s.every} min` : "never"),
        step("wc-more", "+", (_e, cx) => this.set({ every: EVERY[Math.min(EVERY.length - 1, i + 1)] }, cx), i === EVERY.length - 1),
        div().flex_1().text_size(11.5).text_color(t.dim).child("while it still waits")))
      .child(line("wc-sound", label("Sound"),
        link(t, "wc-pick", sound.name, (_e, cx) => this.set({ sound: nextSound.id }, cx), { color: t.foreground, tip: "Click for the next sound" }),
        div().flex_1(),
        button(t, "wc-test", "Play", () => playSound(s.sound), { tip: "Play it now" })))
      .child(line("wc-quiet", label("Quiet hours"), toggle("wc-qt", s.quiet.on, (_e, cx) => this.set({ quiet: { ...s.quiet, on: !s.quiet.on } }, cx)),
        step("wc-from-", "‹", hourStep("from", -1), !s.quiet.on),
        div().text_color(s.quiet.on ? t.foreground : t.dim).child(hour(s.quiet.from)),
        step("wc-from+", "›", hourStep("from", 1), !s.quiet.on),
        div().text_color(t.dim).child("to"),
        step("wc-to-", "‹", hourStep("to", -1), !s.quiet.on),
        div().text_color(s.quiet.on ? t.foreground : t.dim).child(hour(s.quiet.to)),
        step("wc-to+", "›", hourStep("to", 1), !s.quiet.on)))
      .child(div().flex_none().mt(6).h(1).bg(t.border))
      .child(div().flex_none().px(16).pt(8).pb(4).text_size(11).font_medium().text_color(t.dim).child(waiting.length ? `Waiting on you · ${waiting.length}` : "Waiting on you"))
      .child(v_flex().id("wc-rows").flex_none().max_h(220).gap(1).overflow_y_scrollbar()
        .when(!waiting.length, (el) => el.child(div().px(16).pb(8).text_color(t.dim).child("Nobody is waiting. The bell rings the moment an agent asks you something.")))
        .children(waiting.map((a) => {
          const r = st.rung[a.address];
          return h_flex().id(`wc-${a.address}`).flex_none().mx(8).px(8).h(32).gap(9).items_center().rounded(7).cursor_pointer()
            .hover((el) => el.bg(t.hover)).on_mouse_down("left", stop)
            .on_click(() => run("agent.focus", { terminal: a.address }))
            .child(div().size(8).flex_none().rounded(4).bg(t.blocked))
            .child(icon(a.program, 14, t.foreground))
            .child(h_flex().flex_1().min_w(0).gap(5)
              .child(div().flex_none().max_w(130).truncate().text_color(t.foreground).child(a.space_name || "space"))
              .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${what(a)}`)))
            .child(div().flex_none().text_size(11.5).text_color(t.blocked).child(`waiting ${span(now - (r?.first ?? now))}`))
            .child(div().flex_none().text_size(11.5).text_color(t.dim).child(r?.count ? `· ${plural(r.count, "chime")}` : ""));
        })));
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const list = agents();
    const sig = list.filter((a) => a.status === "blocked").map((a) => a.address).join(",");
    // Someone just started waiting: ring now rather than at the next tick.
    if (sig !== this.seen) { this.seen = sig; cx.spawn(async (cx) => { this.tick(); cx.notify(); }); }
    const s = settings();
    const st = state();
    const waiting = list.filter((a) => a.status === "blocked").sort((x, y) => (st.rung[x.address]?.first ?? now) - (st.rung[y.address]?.first ?? now));
    const b = this.bell(t, s, st, waiting, now);
    return this.overlay ? this.card(t, s, st, waiting, b, now) : this.strip(t, b);
  }
}
