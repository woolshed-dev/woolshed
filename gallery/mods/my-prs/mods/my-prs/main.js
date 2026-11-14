// My PRs: your open pull requests in the shown space's repo, with where review
// stands, the checks, whether it can merge, and "Check out in a new worktree space"
// (asks first: `git fetch` and `git worktree add`, then a space there). Lists with
// `gh pr list --author @me` every 60 seconds while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, run, notify, spaces, home, exec } from "woolshed";
import { ago, tidy } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, sampleOnly, tool, header, problemView, looking, shell, toneDot, chip, textButton, confirmStrip, stop } from "./kit.js";
import { PR_FIELDS, parseMine, plan } from "./parse.js";

const NAME = "my-prs";
const EVERY = 60000;

export default class MyPrs extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.prs = null;
    this.sample = null;
    this.hover = null;
    this.asking = null;  // { number, path } waiting for a yes
    this.working = null; // the number being checked out
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.prs = null; this.problem = null; this.asking = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        if (at.problem) { this.problem = at.problem; this.prs = null; return; }
        const r = this.sample ? { ok: true, text: JSON.stringify(this.sample.prs ?? []) }
          : await tool("gh", ["pr", "list", "--repo", this.repo.remote.path, "--author", "@me", "--state", "open", "--limit", "30", "--json", PR_FIELDS], { cwd: this.repo.root });
        if (this.key !== key) return;
        if (!r.ok) { this.problem = r.problem; return; }
        this.prs = parseMine(r.text);
        this.problem = null;
      } catch (e) {
        this.problem = { kind: "other", message: String(e?.message ?? e), hint: "" };
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  // Works out the checkout first, so the question names the real folder.
  ask(pr, cx) {
    const repo = this.repo;
    if (this.sample) {
      this.asking = { number: pr.number, path: `${tidy(home(), home())}/.woolshed/worktrees/${repo.remote.name}/${pr.branch}`, plan: null };
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      const git = (args) => exec("git", args, { timeout: 120000 });
      const [listed, has] = await Promise.all([
        git(["-C", repo.root, "worktree", "list", "--porcelain"]),
        git(["-C", repo.root, "show-ref", "--verify", "--quiet", `refs/heads/${pr.cross ? `pr-${pr.number}` : pr.branch}`]),
      ]);
      const p = plan({ pr, remote: repo.remote.remote, root: repo.root, repoName: repo.remote.name, home: home(), listed: listed.stdout, hasBranch: has.code === 0 });
      if (p.open) { this.openSpace(p.open); return; }
      this.asking = { number: pr.number, path: tidy(p.path, home()), plan: p };
      cx.notify();
    });
  }

  openSpace(path) {
    const s = spaces().find((x) => !x.machine && x.folder.replace(/\/+$/, "") === path.replace(/\/+$/, ""));
    if (s) run("space.select", { id: s.id });
    else run("space.new", { folder: path });
  }

  checkout(pr, cx) {
    const a = this.asking;
    this.asking = null;
    if (this.sample || !a?.plan) { sampleOnly(NAME, `Check out #${pr.number}`); cx.notify(); return; }
    this.working = pr.number;
    cx.notify();
    cx.spawn(async (cx) => {
      let failed = null;
      for (const step of a.plan.steps) {
        const r = await exec("git", step, { timeout: 300000 }).catch((e) => ({ code: 1, stderr: String(e) }));
        if (r.code !== 0) { failed = (r.stderr || "git failed").trim().split("\n").pop(); break; }
      }
      this.working = null;
      if (failed) notify({ title: `Couldn't check out #${pr.number}`, body: failed, level: "error", timeout: 12000 });
      else this.openSpace(a.plan.path);
      cx.notify();
    });
  }

  row(t, p) {
    const hovered = this.hover === p.number;
    const rv = p.review;
    const rvColor = { pass: t.ansi2, fail: t.blocked, wait: t.muted, draft: t.dim }[rv.tone] ?? t.muted;
    const c = p.checks;
    return v_flex().flex_none()
      .child(h_flex().id(`pr-${p.number}`).mx(6).px(10).py(7).gap(10).items_start().rounded(8).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? p.number : null; cx.notify(); } })
        .on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(p.url)).tooltip("Open the pull request")
        .child(div().flex_none().w(40).pt(1).text_size(12).font_semibold().text_color(t.dim).child(`#${p.number}`))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().truncate().font_semibold().text_color(p.draft ? t.muted : t.foreground).child(p.title))
          .child(h_flex().gap(6).min_w(0).text_size(11).text_color(t.dim)
            .child(chip(t, p.branch))
            .child(div().flex_none().text_color(t.ansi2).child(`+${p.adds}`))
            .child(div().flex_none().text_color(t.blocked).child(`−${p.dels}`))
            .child(div().flex_none().child(ago(p.updated))))
          .child(h_flex().gap(10).text_size(11.5).items_center()
            .child(div().flex_none().text_color(rvColor).child(rv.word + (rv.who.length ? ` · ${rv.who.slice(0, 2).map((w) => `@${w}`).join(", ")}` : "")))
            .when(c.total > 0, (el) => el.child(h_flex().flex_none().gap(5).items_center()
              .child(toneDot(t, c.tone, 7))
              .child(div().text_color(c.fail ? t.blocked : t.muted).child(c.fail ? `${c.fail} of ${c.total} failing` : c.wait ? `${c.wait} of ${c.total} running` : `${c.total} checks passed`))))
            .when(Boolean(p.merge.word), (el) => el.child(div().flex_none().text_color(p.merge.tone === "fail" ? t.blocked : p.merge.tone === "pass" ? t.ansi2 : t.dim).child(p.merge.word)))))
        .child(div().flex_none().w(84).flex().justify_end()
          .when(this.working === p.number, (el) => el.child(div().text_size(11).text_color(t.working).child("checking out…")))
          .when(this.working !== p.number, (el) => el.child(textButton(t, `wt-${p.number}`, "worktree", (_e, cx) => this.ask(p, cx), hovered ? t.foreground : t.dim)))))
      .when(this.asking?.number === p.number, (el) => el.child(confirmStrip(t, `ask-${p.number}`,
        `Fetch ${p.branch} and check it out in ${this.asking.path}, then open it as a space?`, "Check out",
        (cx) => this.checkout(p, cx), (cx) => { this.asking = null; cx.notify(); })));
  }

  render() {
    const t = theme();
    const prs = this.prs ?? [];
    const failing = prs.filter((p) => p.checks.fail).length;
    const approved = prs.filter((p) => p.review.tone === "pass").length;
    return shell(t, this.overlay, 480, v_flex().pb(6))
      .child(header(t, { title: "My PRs", detail: this.repo ? this.repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.prs === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.prs !== null && !prs.length, (el) => el.child(div().px(16).py(10).text_color(t.dim)
        .child("You have no open pull requests here. When an agent opens one (gh pr create), it shows here.")))
      .child(v_flex().id("prs").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(480) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : prs.map((p) => this.row(t, p))))
      .when(!this.problem && prs.length > 0, (el) => el.child(h_flex().px(16).pt(6).gap(8).text_size(11).text_color(t.dim)
        .child(div().flex_1().child(`${prs.length} open · ${approved} approved${failing ? ` · ${failing} with failing checks` : ""}`))
        .child(div().child("worktree: check it out beside this one"))));
  }
}
