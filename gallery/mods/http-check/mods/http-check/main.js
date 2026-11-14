// HTTP check: a short list of addresses (staging, production, your local dev server), each
// fetched every 60 seconds while this is open, with its status, how long it took and a red dot
// when it's down. A toast says when one goes down and when it comes back.
// The list is a text file, data/http-check/urls.txt under the app folder ("name url" per line),
// so an agent can add one too; the last 20 results per address are kept beside it in
// history.json. It only ever sends a plain GET to the addresses on the list.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import * as fs from "fs/promises";
import { appHome, home, readTextFile, writeTextFile, notify, theme, props, closeOverlay } from "woolshed";
import { parseList, parseEntry, formatList, classify, transition, reason, fmtMs, since, remember, uptime } from "./parse.js";

const EVERY = 60000;
const TIMEOUT = 10000;
const stop = (_e, cx) => cx.stop_propagation();
const dir = () => `${appHome()}/data/http-check`;
const listPath = () => `${dir()}/urls.txt`;
const historyPath = () => `${dir()}/history.json`;

const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function tidy(path) {
  const h = home();
  return path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class HttpCheck extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.items = null;
    this.disk = null;
    this.results = {};
    this.error = null;
    this.problem = null;
    this.checking = false;
    this.lastRound = null;
    this.input = InputState.new({ placeholder: "staging https://staging.example.com/health" });
    this.input.on("submit", (_e, cx) => this.add(cx));
    this.input.on("change", (_e, cx) => { if (this.problem) { this.problem = null; cx.notify(); } });
    cx.timer.every(EVERY, (cx) => this.round(cx));
    cx.spawn(async (cx) => {
      const saved = await readTextFile(historyPath()).catch(() => null);
      try { this.results = saved ? JSON.parse(saved) : {}; } catch { this.results = {}; }
      this.round(cx);
    });
  }

  async loadList() {
    const text = await readTextFile(listPath()).catch(() => null);
    this.disk = text;
    this.items = parseList(text ?? "");
    return this.items;
  }

  async check(item, cx) {
    const t0 = Date.now();
    let status = 0, error = null;
    try {
      const r = await Promise.race([
        fetch(item.url),
        cx.sleep(TIMEOUT).then(() => { throw new Error("timed out"); }),
      ]);
      status = r.status;
    } catch (e) { error = reason(e); }
    const ms = Date.now() - t0;
    const state = classify(status, error);
    return { state, status, ms: error ? null : ms, error, at: Date.now() };
  }

  round(cx) {
    if (this.checking) return;
    this.checking = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const items = await this.loadList();
        const got = await Promise.all(items.map((i) => this.check(i, cx)));
        const next = {};
        items.forEach((item, n) => {
          const r = got[n];
          const before = this.results[item.url];
          const change = transition(before?.state, r.state);
          if (change === "down") notify({ title: `${item.name} is down`, body: `${r.error ?? r.status} · ${item.url}`, level: "error", timeout: 12000 });
          if (change === "back") notify({ title: `${item.name} is back`, body: `${r.status} in ${fmtMs(r.ms)} · ${item.url}`, level: "success", timeout: 8000 });
          next[item.url] = { ...r, history: remember(before?.history, { state: r.state, ms: r.ms, at: r.at }) };
        });
        this.results = next;
        this.lastRound = Date.now();
        this.error = null;
        await this.saveHistory();
      } catch (e) { this.error = String(e.message ?? e); }
      this.checking = false;
      cx.notify();
    });
  }

  async saveHistory() {
    try {
      await fs.mkdir(dir(), { recursive: true });
      const now = await readTextFile(historyPath()).catch(() => null);
      await writeTextFile(historyPath(), JSON.stringify(this.results), now);
    } catch { /* another copy wrote it first: theirs is as good */ }
  }

  async saveList(items) {
    await fs.mkdir(dir(), { recursive: true });
    const now = await readTextFile(listPath()).catch(() => null);
    await writeTextFile(listPath(), formatList(items), now);
  }

  add(cx) {
    const entry = parseEntry(this.input.value());
    if (!entry) { this.problem = this.input.value().trim() ? "That isn't an address. Try https://example.com/health" : null; cx.notify(); return; }
    cx.spawn(async (cx) => {
      try {
        const items = await this.loadList();
        if (items.some((i) => i.url === entry.url)) { this.problem = "That address is on the list already."; cx.notify(); return; }
        await this.saveList([...items, entry]);
        this.input.set_value("");
        this.problem = null;
        await this.loadList();
        this.round(cx);
      } catch (e) { this.problem = `Couldn't save the list: ${e.message ?? e}`; }
      cx.notify();
    });
  }

  remove(item, cx) {
    cx.spawn(async (cx) => {
      try {
        const items = (await this.loadList()).filter((i) => i.url !== item.url);
        await this.saveList(items);
        await this.loadList();
        delete this.results[item.url];
        await this.saveHistory();
      } catch (e) { this.problem = `Couldn't save the list: ${e.message ?? e}`; }
      cx.notify();
    });
  }

  bars(t, history) {
    const h = (history ?? []).slice(-20);
    const top = Math.max(200, ...h.map((x) => x.ms ?? 0));
    return h_flex().flex_none().h(16).gap(2).items_end()
      .children(h.map((x, i) => div().w(3).rounded(1)
        .h(x.state === "down" ? 16 : Math.max(3, Math.round(((x.ms ?? 0) / top) * 14) + 2))
        .bg(x.state === "down" ? t.blocked : x.state === "warn" ? t.working : t.done)
        .opacity(i === h.length - 1 ? 1 : 0.55)));
  }

  row(t, item) {
    const r = this.results[item.url];
    const state = r?.state ?? null;
    const dot = state === "down" ? t.blocked : state === "warn" ? t.working : state === "up" ? t.done : t.unknown;
    const label = !r ? (this.checking ? "checking…" : "not checked") : r.error ?? String(r.status);
    const hovered = this.hover === item.url;
    return h_flex().id(`url-${item.url}`).flex_none().mx(6).px(10).h(44).gap(10).items_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? item.url : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => cx.open_url(item.url))
      .tooltip(r ? `${uptime(r.history)} · last checked ${since(r.at, Date.now())}` : `Open ${item.url}`)
      .child(div().size(8).flex_none().rounded(4).bg(dot))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_medium().text_color(state === "down" ? t.blocked : t.foreground).child(item.name))
        .child(div().truncate().text_size(11).text_color(t.dim).child(item.url)))
      .when(!hovered, (el) => el.child(this.bars(t, r?.history)))
      .child(v_flex().flex_none().w(84).items_end()
        .child(div().truncate().text_size(11.5).font_medium()
          .text_color(state === "down" ? t.blocked : state === "warn" ? t.working : state === "up" ? t.foreground : t.dim).child(label))
        .child(div().text_size(11).text_color(t.dim).child(r?.ms != null ? fmtMs(r.ms) : "")))
      .when(hovered, (el) => el.child(div().id(`remove-${item.url}`).size(22).flex_none().flex().items_center().justify_center().rounded(6)
        .text_size(11).text_color(t.dim).hover((s) => s.bg(t.raised).text_color(t.foreground)).tooltip("Take it off the list")
        .on_click((_e, cx) => { cx.stop_propagation(); this.remove(item, cx); }).child("✕")));
  }

  render() {
    const t = theme();
    const items = this.items ?? [];
    const down = items.filter((i) => this.results[i.url]?.state === "down").length;
    const sub = this.items === null ? "Reading the list…"
      : !items.length ? "Checks every minute while open"
      : `${items.length} ${items.length === 1 ? "address" : "addresses"}${down ? ` · ${down} down` : " · all answering"}${this.lastRound ? ` · checked ${clock(this.lastRound)}` : ""}`;
    return v_flex().id("http-check").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child("HTTP check"))
          .child(div().truncate().text_size(11).text_color(down ? t.blocked : t.dim).child(sub)))
        .child(div().id("hc-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.round(cx)).child(this.checking ? "checking…" : "check now"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("hc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(t.blocked).child(this.error)))
      .when(this.items !== null && !items.length, (el) => el.child(div().px(16).py(6).text_color(t.dim)
        .child("Nothing on the list yet. Add staging, production or your local dev server below.")))
      .child(v_flex().id("hc-rows").flex_none().gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(400) : el.flex_1().min_h(0)))
        .children(items.map((i) => this.row(t, i))))
      .child(h_flex().flex_none().mt(8).mx(12).gap(6).items_center().on_mouse_down("left", stop)
        .child(div().flex_1().min_w(0).child(Input.new(this.input).h(30).px(9).rounded(7).border_1()
          .border_color(this.problem ? t.blocked : t.input).bg(t.background).text_size(12).text_color(t.foreground)))
        .child(div().id("hc-add").flex_none().h(30).px(12).flex().items_center().rounded(7).font_medium()
          .bg(t.solid).text_color(t.solid_foreground).cursor_pointer().hover((s) => s.opacity(0.9))
          .on_click((_e, cx) => this.add(cx)).child("Add")))
      .child(div().flex_none().px(16).pt(6).text_size(10.5).text_color(this.problem ? t.blocked : t.dim).truncate()
        .child(this.problem ?? `A name, then the address. The list is ${tidy(listPath())}`));
  }
}
