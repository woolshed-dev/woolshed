// Git tags: the tags of the repository you're in, newest first, with their
// dates, and the commits since the latest one on this branch: the start of
// the next changelog, sorted into New, Fixed and Other when the commits use
// conventional prefixes (feat:, fix:). Click a tag to see what came after it;
// "Copy as markdown" puts the list on the clipboard. Follows the focused
// pane, on whichever machine its space runs; reads every 30 seconds.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, home, theme, settings, props, closeOverlay } from "woolshed";
import { TAG_FORMAT, COMMIT_FORMAT, parseTags, parseCommits, sections, changelog, since, day, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false"];
const LOOK_EVERY = 30000;
const TAGS = 60;
const COMMITS = 200;

function location() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f && f.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}
const keyOf = (l) => `${l.on ?? ""}\u0000${l.cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class GitTags extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
    this.pick = null; // the tag clicked, else the latest on this branch
    this.copied = false;
    this.key = null;
    this.looked = 0;
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
    if (key !== this.key) { this.key = key; this.repo = null; this.error = null; this.pick = null; }
    if (!l.cwd) { this.error = { text: "Open a space to see its tags" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const [refs, latest, merged] = await Promise.all([
          git(["for-each-ref", "--sort=-creatordate", `--count=${TAGS}`, `--format=${TAG_FORMAT}`, "refs/tags"], root),
          git(["describe", "--tags", "--abbrev=0", "HEAD"], root),
          git(["tag", "--merged", "HEAD"], root),
        ]);
        const tags = parseTags(refs.stdout);
        const onBranch = new Set(merged.code === 0 ? merged.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : []);
        const latestName = latest.code === 0 ? latest.stdout.trim() : null;
        const anchor = tags.some((t) => t.name === this.pick) ? this.pick : latestName;
        const log = await git(["log", "--no-merges", `-n${COMMITS}`, `--format=${COMMIT_FORMAT}`, ...(anchor ? [`refs/tags/${anchor}..HEAD`] : [])], root);
        if (this.key !== key) return;
        if (log.code !== 0 && !explain(null, log.stderr).empty) throw Object.assign(new Error(log.stderr), { stderr: log.stderr });
        this.repo = { root, on: l.on, tags, onBranch, latest: latestName, anchor, commits: log.code === 0 ? parseCommits(log.stdout) : [] };
        this.error = null;
      } catch (e) {
        if (this.key === key) this.error = explain(e, e?.stderr);
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  copy(cx) {
    const r = this.repo;
    if (!r) return;
    cx.write_to_clipboard(changelog(r.commits, r.anchor));
    this.copied = true;
    this.flash?.cancel();
    this.flash = cx.timer.after(1600, (cx) => { this.copied = false; cx.notify(); });
    cx.notify();
  }

  commits(t, mono) {
    const r = this.repo;
    if (!r.commits.length) return div().px(16).py(4).text_color(t.dim).child(r.anchor ? `Nothing since ${r.anchor}: HEAD is the tagged commit.` : "No commits yet.");
    const tone = { New: t.ansi2, Fixed: t.working, Faster: t.accent };
    return v_flex().id("tg-commits").flex_none().gap(0).overflow_y_scrollbar().max_h(this.overlay ? 250 : 400)
      .children(sections(r.commits).map((s) => v_flex().flex_none()
        .child(div().px(16).pt(6).pb(2).text_size(11).font_semibold().text_color(tone[s.title] ?? t.dim).child(`${s.title} · ${s.items.length}`))
        .children(s.items.map((x) => h_flex().id(`tg-c-${x.sha}`).px(16).h(22).gap(8).items_center()
          .tooltip(`${x.subject}\n${x.author} · ${since(x.time)}`)
          .child(div().flex_none().text_color(t.dim).child("•"))
          .when(Boolean(x.c.scope), (el) => el.child(div().flex_none().max_w(90).truncate().text_size(11.5).font_semibold().text_color(t.muted).child(`${x.c.scope}:`)))
          .when(x.c.breaking, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.blocked).child("breaking")))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(x.c.text))
          .child(div().flex_none().font_family(mono).text_size(11).text_color(t.dim).child(x.short))))));
  }

  tag(t, g) {
    const r = this.repo;
    const chosen = g.name === r.anchor;
    const here = r.onBranch.has(g.name);
    return h_flex().id(`tg-${g.name}`).flex_none().mx(6).px(10).h(26).gap(8).items_center().rounded(7).cursor_pointer()
      .when(chosen, (el) => el.bg(t.selected))
      .when(!chosen, (el) => el.hover((s) => s.bg(t.hover)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { this.pick = g.name; this.looked = 0; this.look(cx); })
      .tooltip(`Show the commits since ${g.name}`)
      .child(div().flex_none().text_size(10).text_color(here ? t.done : t.dim).child("◆"))
      .child(div().flex_none().max_w(130).truncate().font_semibold().text_color(here ? t.foreground : t.muted).child(g.name))
      .when(g.name === r.latest, (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.done).child("latest")))
      .when(!here, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).tooltip("Not an ancestor of this branch").child("elsewhere")))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(g.subject))
      .child(div().flex_none().text_size(11).text_color(t.dim).tooltip(day(g.time)).child(since(g.time)));
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    const head = h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
      .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Tags"))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
      .child(div().id("tg-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
      .when(Boolean(this.overlay), (el) => el.child(div().id("tg-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => closeOverlay(this.overlay)).child("✕")));
    const root = v_flex().id("git-tags").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(460) : el.size_full()))
      .child(head);
    if (this.error) return root.child(quiet(this.error.text, this.error.notRepo || this.error.empty ? t.dim : t.blocked));
    if (!r) return root.child(quiet("Reading the tags…"));
    return root
      .child(h_flex().flex_none().px(16).pb(2).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground)
          .child(r.anchor ? `${r.commits.length}${r.commits.length >= COMMITS ? "+" : ""} commit${r.commits.length === 1 ? "" : "s"} since ${r.anchor}` : `No tags yet: every commit (${r.commits.length}${r.commits.length >= COMMITS ? "+" : ""})`))
        .when(r.commits.length > 0, (el) => el.child(div().id("tg-copy").flex_none().px(9).py(3).rounded(6).text_size(11.5).cursor_pointer()
          .bg(this.copied ? t.raised : t.solid).text_color(this.copied ? t.done : t.solid_foreground)
          .hover((s) => s.opacity(0.88)).on_mouse_down("left", stop)
          .tooltip("The list as markdown, ready for a changelog or a release")
          .on_click((_e, cx) => this.copy(cx)).child(this.copied ? "Copied" : "Copy as markdown"))))
      .child(this.commits(t, mono))
      .child(div().flex_none().mx(16).mt(8).pt(6).border_t_1().border_color(t.border)
        .child(div().text_size(11).font_medium().text_color(t.dim).child(r.tags.length ? `${r.tags.length}${r.tags.length >= TAGS ? "+" : ""} tag${r.tags.length === 1 ? "" : "s"}` : "No tags. git tag -a v0.1.0 -m \"First release\" makes one.")))
      .when(r.tags.length > 0, (el) => el.child(v_flex().id("tg-tags").flex_none().pt(2).gap(1).overflow_y_scrollbar().max_h(this.overlay ? 150 : 300)
        .children(r.tags.map((g) => this.tag(t, g)))))
      .child(div().flex_none().px(16).pt(6).truncate().text_size(11).text_color(t.dim).child(`${tidy(r.root)}${r.on ? ` · on ${r.on}` : ""}`));
  }
}
