// PR checks: the shown branch's pull request and each of its checks, with how
// long it took, required ones marked, a click to open each. Read-only: `gh pr view`
// and `gh pr checks` (also `--required`), every 60 seconds while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay } from "woolshed";
import { where, repoAt, sampleOf, sampleRepo, tool, header, problemView, looking, shell, toneDot, toneColor, chip, stop } from "./kit.js";
import { PR_FIELDS, CHECK_FIELDS, parsePr, parseChecks, tally } from "./parse.js";

const NAME = "pr-checks";
const EVERY = 60000;

export default class PrChecks extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.pr = undefined; // undefined: looking; null: none for this branch
    this.checks = null;
    this.sample = null;
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  async ask(args) {
    if (this.sample) {
      const s = this.sample;
      if (args[1] === "view") return s.pr ? { ok: true, text: JSON.stringify(s.pr) } : { ok: false, problem: { kind: "notfound", message: "no pull requests found", hint: "" } };
      if (args.includes("--required")) return { ok: true, text: JSON.stringify(s.required ?? []) };
      return { ok: true, text: JSON.stringify(s.checks ?? []) };
    }
    return tool("gh", args, { cwd: this.repo.root });
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.pr = undefined; this.checks = null; this.problem = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        if (at.problem) { this.problem = at.problem; return; }
        const path = this.repo.remote.path;
        if (!this.repo.branch) { this.problem = { kind: "nogit", message: "No branch is checked out here.", hint: "" }; return; }
        const v = await this.ask(["pr", "view", this.repo.branch, "--repo", path, "--json", PR_FIELDS]);
        if (this.key !== key) return;
        if (!v.ok) {
          if (v.problem?.kind === "notfound") { this.pr = null; this.checks = null; this.problem = null; return; }
          this.problem = v.problem; return;
        }
        const pr = parsePr(v.text);
        this.pr = pr;
        if (!pr) return;
        // gh exits 8 while checks run and 1 when one fails: the JSON is what counts.
        const [c, req] = await Promise.all([
          this.ask(["pr", "checks", String(pr.number), "--repo", path, "--json", CHECK_FIELDS]),
          this.ask(["pr", "checks", String(pr.number), "--repo", path, "--required", "--json", "name,workflow"]),
        ]);
        if (this.key !== key) return;
        const listed = c.text?.trim().startsWith("[");
        if (!listed && /no checks reported/i.test(c.stderr ?? "")) { this.checks = []; this.problem = null; return; }
        if (!listed) { this.problem = c.problem ?? { kind: "other", message: "gh pr checks failed", hint: "" }; return; }
        this.checks = parseChecks(c.text, req.text?.trim().startsWith("[") ? req.text : "");
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

  prLine(t, pr) {
    const state = { draft: ["Draft", t.dim], open: ["Open", t.ansi2], merged: ["Merged", t.done], closed: ["Closed", t.blocked] }[pr.state] ?? [pr.state, t.muted];
    return v_flex().id("pr").mx(6).px(10).py(6).gap(3).rounded(8).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(pr.url)).tooltip("Open the pull request")
      .child(h_flex().gap(6).min_w(0)
        .child(div().flex_none().font_semibold().text_color(t.foreground).child(`#${pr.number}`))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(pr.title))
        .child(chip(t, state[0], state[1])))
      .child(div().truncate().text_size(11).text_color(t.dim).child(`${pr.base} ← ${pr.head}`));
  }

  bar(t, n) {
    const parts = [["fail", n.fail], ["running", n.running + n.queued], ["pass", n.pass], ["skipped", n.skipped + n.cancelled]].filter(([, k]) => k > 0);
    return v_flex().px(16).pt(4).pb(8).gap(6)
      .child(h_flex().h(6).gap(2).children(parts.map(([tn, k]) => {
        const seg = div().flex_grow(k).flex_basis(0).h_full().rounded(3).bg(toneColor(t, tn));
        return tn === "running" ? seg.loop("opacity", { from: 0.4, to: 1, period: 1200 }) : seg;
      })))
      .child(h_flex().gap(8).text_size(11.5)
        .child(div().flex_1().text_color(n.fail ? t.blocked : t.muted).child(n.words))
        .when(Boolean(n.required), (el) => el.child(div().text_color(t.dim).child(n.required))));
  }

  row(t, c, i) {
    return h_flex().id(`check-${i}`).flex_none().mx(6).px(10).h(32).gap(9).items_center().rounded(7)
      .when(Boolean(c.link), (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => cx.open_url(c.link)).tooltip(c.description || "Open this check"))
      .child(toneDot(t, c.tone, 8))
      .child(div().flex_none().max_w(200).truncate().text_color(c.tone === "fail" ? t.blocked : t.foreground).child(c.name))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(c.workflow))
      .when(c.required, (el) => el.child(chip(t, "required", t.foreground)))
      .child(div().flex_none().w(56).text_size(11.5).text_color(c.tone === "running" ? t.working : t.muted).child(c.took || (c.tone === "queued" ? "waiting" : c.tone === "skipped" ? "skipped" : ""))
        .map((el) => el.flex().justify_end()));
  }

  render() {
    const t = theme();
    const pr = this.pr;
    const checks = this.checks ?? [];
    const n = tally(checks);
    const branch = this.repo?.branch ?? "";
    return shell(t, this.overlay, 440, v_flex().pb(6))
      .child(header(t, { title: "PR checks", detail: this.repo ? `${this.repo.remote.path}${branch ? ` · ${branch}` : ""}` : "", busy: this.busy,
        sample: this.sample, onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && pr === undefined, (el) => el.child(looking(t)))
      .when(!this.problem && pr === null, (el) => el.child(v_flex().px(16).py(10).gap(4)
        .child(div().text_color(t.muted).child(`No pull request for ${branch} yet.`))
        .child(div().text_size(11.5).text_color(t.dim).child("Open one from the status bar's repo menu, or have the agent run gh pr create."))))
      .when(!this.problem && Boolean(pr), (el) => el.child(this.prLine(t, pr))
        .when(this.checks === null, (e) => e.child(looking(t, "Reading checks…")))
        .when(this.checks !== null && !checks.length, (e) => e.child(div().px(16).py(8).text_color(t.dim).child("No checks on this pull request.")))
        .when(checks.length > 0, (e) => e.child(this.bar(t, n))
          .child(v_flex().id("checks").gap(1).overflow_y_scrollbar()
            .map((x) => (this.overlay ? x.max_h(420) : x.flex_1().min_h(0)))
            .children(checks.map((c, i) => this.row(t, c, i))))));
  }
}
