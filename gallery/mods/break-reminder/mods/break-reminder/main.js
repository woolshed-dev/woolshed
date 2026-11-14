// Break reminder: after a stretch at the computer (50 minutes by default) a
// gentle toast says to stand up for a few minutes. The stretch starts at your
// last break: time away from the keyboard and mouse (the system's idle time:
// ioreg on macOS, xprintidle or GNOME's idle monitor on Linux), the computer
// asleep or Woolshed closed, or a break you start or mark here. Snooze, quiet
// hours. State in shared `break-reminder.state`, choices in `break-reminder.settings`.
// Commands: break-reminder.break (the toast's click), .snooze, .back, .took.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, shared, setShared, notify, theme, props, closeOverlay, nextCommand, window as win, appHome, readTextFile } from "woolshed";
import * as B from "./parse.js";

const KEY = "break-reminder.state";
const SETTINGS = "break-reminder.settings";
const LOOK = 30000;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const cfg = () => B.settings(shared(SETTINGS));
const state = () => B.clean(shared(KEY));
const save = (st) => setShared(KEY, st);
const clockAt = (ms) => { const d = new Date(ms); return B.hhmm(d.getHours() * 60 + d.getMinutes()); };
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// Where idle time comes from on this system, found once: { read() -> ms | null, name } or null.
async function idleSource() {
  const platform = win()?.platform;
  const tries = platform === "macos"
    ? [["ioreg", ["-c", "IOHIDSystem", "-d", "4", "-k", "HIDIdleTime"], B.ioregIdle, "the system's idle time"]]
    : platform === "linux"
      ? [["xprintidle", [], B.xprintidle, "xprintidle"],
         ["gdbus", ["call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", "--object-path", "/org/gnome/Mutter/IdleMonitor/Core", "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"], B.mutterIdle, "GNOME's idle monitor"]]
      : [];
  for (const [cmd, args, parse, name] of tries) {
    const read = async () => {
      const r = await exec(cmd, args, { timeout: 5000 }).catch(() => null);
      return r && r.code === 0 ? parse(r.stdout) : null;
    };
    if ((await read()) !== null) return { read, name };
  }
  return null;
}

// An example for a first look (the gallery preview writes one): data/break-reminder/example.json,
// { "worked": minutes at the computer, "breaks": breaks today }, taken once each time it changes.
async function example() {
  const raw = await readTextFile(`${appHome()}/data/break-reminder/example.json`).catch(() => null);
  if (!raw || shared("break-reminder.example") === hash(raw)) return;
  setShared("break-reminder.example", hash(raw));
  let ex;
  try { ex = JSON.parse(raw); } catch { return; }
  const now = Date.now();
  const st = B.fresh(now);
  st.since = now - (Number(ex.worked) || 0) * 60000;
  st.breaks.count = Math.max(0, Number(ex.breaks) || 0);
  save(st);
}

export default class BreakReminder extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.source = undefined; // undefined: still looking; null: none here
    this.idle = null;
    cx.spawn(async (cx) => {
      await example();
      this.source = await idleSource();
      await this.look(cx);
      cx.notify();
    });
    cx.timer.every(LOOK, (cx) => cx.spawn(async (cx) => { await this.look(cx); cx.notify(); }));
    // A one-second redraw only during a break you started (its countdown shows seconds).
    cx.timer.every(1000, (cx) => { if (state().breakUntil) cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const last = shared("break-reminder.command");
        if (last && last.c === c && Math.abs(Date.now() - last.at) < 250) continue;
        setShared("break-reminder.command", { c, at: Date.now() });
        this.act(c);
        cx.notify();
      }
    });
  }

  act(c) {
    const now = Date.now();
    const st = state(), s = cfg();
    if (c === "break") save(B.takeBreak(st, now, s));
    else if (c === "snooze") save(B.snooze(st, now, s));
    else if (c === "back") save(B.endBreak(st, now));
    else if (c === "took") save(B.tookOne(st, now));
  }

  // One look: every copy runs it; whichever comes first does the work, the others find it fresh.
  async look(cx) {
    if (this.source === undefined) return;
    const raw = shared(KEY);
    if (raw && typeof raw.seen === "number" && Date.now() - raw.seen < LOOK - 5000) return;
    this.idle = this.source ? await this.source.read() : null;
    const now = Date.now();
    const s = cfg();
    const r = B.step(state(), now, this.idle, s);
    save(r.st);
    if (r.remind) {
      notify({ title: `Time for a break: stand up for ${s.rest} minutes`, body: `${B.minutes(now - r.st.since)} at the computer. Click to start the break.`, level: "info", timeout: 60000, action: { name: "break-reminder.break" } });
    }
    if (r.over) notify({ title: "Break's over", body: "Welcome back.", level: "success", timeout: 8000 });
  }

  button(t, id, label, action, primary = false) {
    return div().id(id).h(28).px(12).flex().items_center().justify_center().rounded(7).text_size(12.5).cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { action(); cx.notify(); })
      .child(label);
  }

  strip(t, st, s, now) {
    const on = Boolean(st.breakUntil);
    const worked = now - st.since;
    const over = worked >= s.work * 60000;
    return h_flex().id("break-reminder").size_full().min_w(0).overflow_hidden().px(10).gap(7).items_center().text_size(12.5)
      .tooltip(on ? "On a break" : `${B.minutes(worked)} since your last break`)
      .child(svg("mods/break-reminder/cup.svg").size(13).flex_none().text_color(on ? t.done : over ? t.blocked : t.dim))
      .child(div().flex_none().font_semibold().text_color(on ? t.done : over ? t.blocked : t.muted).child(on ? B.clock(st.breakUntil - now) : B.minutes(worked)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(on ? "break" : st.away ? "away" : ""));
  }

  card(t, st, s, now) {
    const stop = (_e, cx) => cx.stop_propagation();
    const on = Boolean(st.breakUntil);
    const worked = now - st.since;
    const share = on ? 1 - (st.breakUntil - now) / (s.rest * 60000) : Math.min(1, worked / (s.work * 60000));
    const over = !on && worked >= s.work * 60000;
    const quiet = B.inQuiet(s.quiet, now);
    const choice = (key, label, tip) => div().id(`br-${key}`).px(6).py(2).rounded(5).cursor_pointer().text_color(t.muted)
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { setShared(SETTINGS, { ...s, [key]: B.cycle(key, s[key]) }); cx.notify(); })
      .tooltip(tip)
      .child(label);
    const how = this.source === undefined ? "Looking for the system's idle time…"
      : this.source ? (st.away ? "Away: that counts as a break" : `Time away counts as a break (${this.source.name})`)
      : win()?.platform === "linux" ? "Counting from your last break. Install xprintidle to count time away too."
      : "Counting from your last break, or the computer's last sleep.";
    const n = B.breaksToday(st, now);
    return v_flex().id("break-reminder").w(310).p(16).pt(12).gap(10).bg(t.popover).text_size(12.5)
      .child(h_flex().items_center().gap(8)
        .child(svg("mods/break-reminder/cup.svg").size(14).flex_none().text_color(on ? t.done : t.muted))
        .child(div().flex_1().text_color(t.muted).child(on ? "On a break" : "Since your last break"))
        .child(div().id("br-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((el) => el.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .child(h_flex().items_end().gap(8)
        .child(div().text_size(40).font_semibold().text_color(on ? t.done : over ? t.blocked : t.foreground)
          .child(on ? B.clock(st.breakUntil - now) : String(Math.floor(worked / 60000))))
        .child(div().pb(7).text_color(t.dim).child(on ? "left · stand up, look away, stretch" : Math.floor(worked / 60000) === 1 ? "minute at the computer" : "minutes at the computer")))
      .child(div().w_full().h(4).rounded(2).bg(alpha(t.foreground, "14"))
        .child(div().h_full().rounded(2).w(`${Math.round(Math.max(0, share) * 1000) / 10}%`).bg(on ? t.done : over ? t.blocked : t.working)))
      .child(div().text_size(11.5).text_color(over ? t.blocked : t.dim)
        .child(on ? `Back at ${clockAt(st.breakUntil)}`
          : over ? (quiet ? "Over, but it's quiet hours: no toasts" : st.snoozeUntil > now ? `Snoozed until ${clockAt(st.snoozeUntil)}` : `Time for a ${s.rest}-minute break`)
          : `A break in ${B.minutes(s.work * 60000 - worked)}`))
      .child(h_flex().gap(6)
        .when(on, (el) => el.child(this.button(t, "br-back", "I'm back", () => this.act("back"), true)))
        .when(!on, (el) => el
          .child(this.button(t, "br-take", `Take ${s.rest} min now`, () => this.act("break"), true))
          .child(over
            ? this.button(t, "br-snooze", `Snooze ${s.snooze} min`, () => this.act("snooze"))
            : this.button(t, "br-took", "I just took one", () => this.act("took")))))
      .child(h_flex().gap(2).items_center().text_size(11.5).flex_wrap()
        .child(choice("work", `every ${s.work} min`, "How long a stretch before the reminder"))
        .child(div().text_color(t.dim).child("·"))
        .child(choice("rest", `${s.rest} min break`, "How long a break (and how long away counts as one)"))
        .child(div().text_color(t.dim).child("·"))
        .child(choice("snooze", `snooze ${s.snooze}`, "Snooze length, and how often it asks again"))
        .child(div().text_color(t.dim).child("·"))
        .child(choice("quiet", B.quietLabel(s.quiet), "No toasts in these hours")))
      .child(h_flex().items_center().gap(8).text_size(11)
        .child(div().flex_1().min_w(0).text_color(t.dim).child(how))
        .child(div().flex_none().text_color(t.dim).child(`${n} break${n === 1 ? "" : "s"} today`)));
  }

  render() {
    const t = theme();
    const st = state();
    const s = cfg();
    const now = Date.now();
    return this.overlay ? this.card(t, st, s, now) : this.strip(t, st, s, now);
  }
}
