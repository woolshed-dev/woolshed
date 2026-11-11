// Git glance: the focused space's branch at a look. Where it is against its
// upstream (as of the last fetch: this never fetches), what's staged, changed,
// new or in conflict, the stash, and the last commit. Read-only git commands
// only, on the machine the space lives on. A block (a strip or a card), or a
// window (mod.open git-glance). Click to look again now.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, home, theme, props, closeOverlay } from "woolshed";
import { parseStatus, since } from "./status.js";

// These reads write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const LOOK_EVERY = 15000;

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

function location() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  // A layout terminal block has no pane: its address says the machine.
  const on = f && f.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}
const keyOf = (l) => `${l.on ?? ""}\u0000${l.cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class GitGlance extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.info = null;
    this.error = null;
    this.key = null;
    this.looked = 0;
    this.busy = false;
    // Often enough to notice a new folder at once; git itself runs every 15 s.
    cx.timer.every(2500, (cx) => {
      const l = location();
      if (keyOf(l) !== this.key || Date.now() - this.looked > LOOK_EVERY) this.look(cx);
    });
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    const l = location();
    const key = keyOf(l);
    if (key !== this.key) { this.key = key; this.info = null; this.error = null; }
    if (!l.cwd) { this.error = "No folder"; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.info = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim();
        const st = await git(["status", "--porcelain=v2", "--branch", "--show-stash", "--untracked-files=normal"], root);
        if (st.code !== 0) throw new Error((st.stderr || "git status failed").trim());
        const info = parseStatus(st.stdout);
        const last = await git(["log", "-1", "--format=%s%x1f%ct"], root);
        if (last.code === 0 && last.stdout.trim()) {
          const [subject, time] = last.stdout.trim().split("\x1f");
          info.subject = subject;
          info.time = Number(time) || null;
        }
        info.root = root;
        if (this.key === key) { this.info = info; this.error = null; }
      } catch (e) {
        if (this.key === key) this.error = /ENOENT|not found|No such file/i.test(String(e)) ? "git is not installed here" : String(e.message ?? e);
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  // The counts, as small colored words; nothing when the tree is clean.
  counts(t, i) {
    const parts = [];
    if (i.conflicts) parts.push([`${i.conflicts} conflict${i.conflicts === 1 ? "" : "s"}`, t.blocked]);
    if (i.staged) parts.push([`${i.staged} staged`, t.ansi2]);
    if (i.changed) parts.push([`${i.changed} changed`, t.working]);
    if (i.untracked) parts.push([`${i.untracked} new`, t.done]);
    if (!parts.length) parts.push(["clean", t.dim]);
    return parts.map(([label, color]) => div().flex_none().text_color(color).child(label));
  }

  branch(t, i) {
    return h_flex().flex_none().gap(6).items_center().min_w(0)
      .child(svg("mods/git-glance/branch.svg").size(13).flex_none().text_color(t.muted))
      .child(div().max_w(220).truncate().font_semibold().text_color(t.foreground).child(i.detached ? `detached ${String(i.oid ?? "").slice(0, 7)}` : i.head ?? "no branch"))
      .when(i.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${i.ahead}`)))
      .when(i.behind > 0, (el) => el.child(div().flex_none().text_color(t.working).child(`↓${i.behind}`)));
  }

  strip(t, i) {
    return h_flex().size_full().min_w(0).gap(12).items_center()
      .child(this.branch(t, i))
      .child(h_flex().flex_none().gap(8).children(this.counts(t, i)))
      .when(Boolean(i.subject), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim)
        .child(`${i.subject}${i.time ? ` · ${since(i.time)}` : ""}`)));
  }

  card(t, i, l) {
    const line = (el) => h_flex().gap(8).items_center().min_w(0).child(el);
    return v_flex().gap(7).min_w(0)
      .child(this.branch(t, i))
      .child(h_flex().gap(8).items_center().text_size(12).text_color(t.muted)
        .child(i.upstream ? `${i.ahead} ahead · ${i.behind} behind ${i.upstream}` : "No upstream branch")
        .when(i.stash, (el) => el.child(div().text_color(t.dim).child(`· ${i.stash} stashed`))))
      .child(h_flex().gap(10).items_center().text_size(12).children(this.counts(t, i)))
      .when(Boolean(i.subject), (el) => el.child(line(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(i.subject))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(i.time ? since(i.time) : ""))))
      .child(div().truncate().text_size(11).text_color(t.dim).child(tidy(i.root ?? l.cwd)));
  }

  render() {
    const t = theme();
    const l = location();
    const i = this.info;
    const quiet = div().truncate().text_color(t.dim).child(this.error ?? (l.cwd ? "Looking…" : "No folder"));
    const stop = (_e, cx) => cx.stop_propagation();
    if (this.overlay) {
      return v_flex().id("git-glance").w(330).p(14).pt(10).gap(10).bg(t.popover).text_size(12.5)
        .child(h_flex().items_center().gap(8)
          .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Git glance"))
          .child(div().id("gg-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
            .on_click((_e, cx) => this.look(cx)).child(this.busy ? "looking…" : "look again"))
          .child(div().id("gg-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
            .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
            .on_click(() => closeOverlay(this.overlay)).child("✕")))
        .child(i ? this.card(t, i, l) : quiet);
    }
    return div().id("git-glance").size_full().min_w(0).px(12).flex().items_center().bg(t.chrome).text_size(12).cursor_pointer()
      .on_size_change((size, cx) => { const tall = size.height > 64; if (tall !== this.tall) { this.tall = tall; cx.notify(); } })
      .tooltip("Look again")
      .on_click((_e, cx) => this.look(cx))
      .child(i ? (this.tall ? div().py(10).w_full().child(this.card(t, i, l)) : this.strip(t, i)) : quiet);
  }
}
