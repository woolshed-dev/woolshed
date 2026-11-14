// Releases: the shown space's GitHub releases, and the commits since the latest
// one on this branch. "Draft notes" copies them to the clipboard as a markdown
// list (New, Fixed, Other). Read-only: `gh release list`, `git log`, and GitHub's
// compare when the tag isn't in this clone; every 60 seconds while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, notify, exec } from "woolshed";
import { ago } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, tool, header, problemView, looking, shell, chip, button, stop } from "./kit.js";
import { RELEASE_FIELDS, LOG_FORMAT, parseReleases, parseLog, parseCompare, draftNotes, kindOf, sentence } from "./parse.js";

const NAME = "releases";
const EVERY = 60000;

export default class Releases extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.releases = null;
    this.latest = null;
    this.commits = null;
    this.since = ""; // where the commits came from
    this.sample = null;
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  // Commits after the tag: this clone's history when it has the tag, else GitHub's compare.
  async commitsSince(tag) {
    const repo = this.repo;
    const git = (args) => exec("git", ["--no-optional-locks", "-C", repo.root, ...args], { timeout: 15000 });
    const has = await git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`]);
    if (has.code === 0) {
      const log = await git(["log", "--no-merges", "-n", "300", LOG_FORMAT, `${tag}..HEAD`]);
      return { list: parseLog(log.stdout), from: `on ${repo.branch || "HEAD"}` };
    }
    const info = await tool("gh", ["repo", "view", repo.remote.path, "--json", "defaultBranchRef"], { cwd: repo.root });
    let branch = "main";
    try { branch = JSON.parse(info.text.slice(info.text.indexOf("{"))).defaultBranchRef?.name || "main"; } catch {}
    const c = await tool("gh", ["api", `repos/${repo.remote.path}/compare/${encodeURIComponent(tag)}...${encodeURIComponent(branch)}`], { cwd: repo.root, timeout: 30000 });
    return c.ok ? { list: parseCompare(c.text), from: `on ${branch}, from GitHub (fetch tags to use this clone)` } : { list: [], from: c.problem?.message ?? "" };
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.releases = null; this.commits = null; this.problem = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        if (at.problem) { this.problem = at.problem; this.releases = null; return; }
        const r = this.sample ? { ok: true, text: JSON.stringify(this.sample.releases ?? []) }
          : await tool("gh", ["release", "list", "--repo", this.repo.remote.path, "--limit", "10", "--json", RELEASE_FIELDS], { cwd: this.repo.root });
        if (this.key !== key) return;
        if (!r.ok) { this.problem = r.problem; return; }
        const { rows, latest } = parseReleases(r.text);
        this.releases = rows;
        this.latest = latest;
        this.problem = null;
        if (this.sample) { this.commits = parseLog((this.sample.log ?? []).join("\n")); this.since = `on ${this.repo.branch}`; }
        else if (latest) { const c = await this.commitsSince(latest.tag); if (this.key === key) { this.commits = c.list; this.since = c.from; } }
        else {
          const log = await exec("git", ["--no-optional-locks", "-C", this.repo.root, "log", "--no-merges", "-n", "50", LOG_FORMAT], { timeout: 15000 });
          this.commits = parseLog(log.stdout);
          this.since = "the last 50, no release yet";
        }
      } catch (e) {
        this.problem = { kind: "other", message: String(e?.message ?? e), hint: "" };
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  release(t, r) {
    const page = `${this.repo.remote.web}/releases/tag/${encodeURIComponent(r.tag)}`;
    return h_flex().id(`rel-${r.tag}`).flex_none().mx(6).px(10).h(32).gap(8).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(page)).tooltip("Open the release")
      .child(div().flex_none().font_semibold().text_color(r.draft ? t.muted : t.foreground).child(r.tag))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(r.name))
      .when(r.latest, (el) => el.child(chip(t, "Latest", t.ansi2)))
      .when(r.pre, (el) => el.child(chip(t, "Pre-release", t.working)))
      .when(r.draft, (el) => el.child(chip(t, "Draft", t.dim)))
      .child(div().flex_none().w(60).flex().justify_end().text_size(11).text_color(t.dim).child(r.draft ? "" : ago(r.at)));
  }

  commit(t, c) {
    const kind = kindOf(c.subject);
    return h_flex().id(`c-${c.sha}`).flex_none().mx(6).px(10).h(26).gap(8).items_center().rounded(6)
      .child(div().flex_none().w(56).text_size(11).text_color(t.dim).child(c.sha))
      .child(div().flex_none().w(6).h(6).rounded(3).bg(kind === "new" ? t.accent : kind === "fixed" ? t.ansi2 : t.border))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(sentence(c.subject)))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(c.author));
  }

  copy(cx) {
    const notes = draftNotes(this.latest?.tag ?? "", this.commits ?? []);
    cx.write_to_clipboard(notes);
    const lines = notes.split("\n").filter((l) => l.startsWith("- ") && l !== "- Nothing yet.").length;
    notify({ title: "Release notes copied", body: `${lines} line${lines === 1 ? "" : "s"} since ${this.latest?.tag ?? "the start"}, as markdown.`, level: "success", timeout: 5000 });
  }

  render() {
    const t = theme();
    const rels = this.releases ?? [];
    const commits = this.commits ?? [];
    const tag = this.latest?.tag;
    return shell(t, this.overlay, 460, v_flex().pb(8))
      .child(header(t, { title: "Releases", detail: this.repo ? this.repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.releases === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.releases !== null, (el) => el
        .when(!rels.length, (e) => e.child(div().px(16).py(6).text_color(t.dim).child("No releases yet. gh release create v0.1.0 makes the first.")))
        .child(v_flex().id("rels").gap(1).max_h(170).overflow_y_scrollbar().children(rels.map((r) => this.release(t, r))))
        .child(h_flex().mt(8).mx(16).pt(8).gap(8).items_center().border_t(1).border_color(t.border)
          .child(v_flex().flex_1().min_w(0)
            .child(div().text_size(12).font_semibold().text_color(t.foreground)
              .child(this.commits === null ? "Commits…" : tag ? `${commits.length} commit${commits.length === 1 ? "" : "s"} since ${tag}` : `${commits.length} commits`))
            .child(div().truncate().text_size(11).text_color(t.dim).child(this.since)))
          .when(commits.length > 0, (e) => e.child(button(t, "draft", "Draft notes", (_e, cx) => this.copy(cx), { solid: true }))))
        .when(this.commits !== null && !commits.length && Boolean(tag), (e) => e.child(div().px(16).py(6).text_color(t.dim).child(`Nothing new since ${tag}.`)))
        .child(v_flex().id("commits").pt(4).gap(0).overflow_y_scrollbar()
          .map((x) => (this.overlay ? x.max_h(260) : x.flex_1().min_h(0)))
          .children(commits.map((c) => this.commit(t, c)))));
  }
}
