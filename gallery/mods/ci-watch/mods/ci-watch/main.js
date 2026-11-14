// CI watch: one GitHub Actions run, the shown branch's latest by default, with its
// jobs; a toast when it finishes (passed or failed), and optionally a ring when it
// fails. Read-only: `gh run list` and `gh run view`, every 60 seconds while open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, notify, playSound } from "woolshed";
import { ago } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, tool, header, problemView, looking, shell, toneDot, toneColor, chip, textButton, stop } from "./kit.js";
import { RUN_FIELDS, VIEW_FIELDS, parseList, parseView, runKey, tell } from "./parse.js";

const NAME = "ci-watch";
const EVERY = 60000;
const WORDS = { pass: "Passed", fail: "Failed", running: "Running", queued: "Queued", cancelled: "Cancelled", skipped: "Skipped", neutral: "Finished" };

const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default class CiWatch extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.run = null;       // the watched run, with jobs
    this.recent = null;    // runs to pick from, while picking
    this.picking = false;
    this.sample = null;
    this.pin = load("ci-watch.pin", null); // { repo, id } or null: follow the branch
    this.ring = load("ci-watch.ring", false);
    this.unfinished = new Set(); // runs seen before they finished
    this.told = new Set(load("ci-watch.told", []));
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  async ask(args, key) {
    if (this.sample) {
      const s = this.sample;
      if (args[1] === "list") {
        const branch = args.includes("--branch") ? args[args.indexOf("--branch") + 1] : "";
        return { ok: true, text: JSON.stringify((s.runs ?? []).filter((r) => !branch || r.headBranch === branch)) };
      }
      const view = s.views?.[args[2]];
      return view ? { ok: true, text: JSON.stringify(view) } : { ok: false, problem: { kind: "notfound", message: "That run isn't in the sample.", hint: "" } };
    }
    return tool("gh", args, { cwd: this.repo.root });
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.problem = null; if (!this.pin) this.run = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        // A pinned run stays watched while its repo is shown elsewhere.
        if (at.problem && !this.pin) { this.problem = at.problem; this.repo = null; this.run = null; return; }
        if (at.repo) this.repo = at.repo;
        if (!this.repo) { this.problem = at.problem; return; }
        const path = this.repo.remote.path;
        if (this.pin && this.pin.repo !== path && at.repo) { this.pin = null; save("ci-watch.pin", null); }
        let id = this.pin?.id ?? null;
        if (!id) {
          // A push starts several workflows: every one of them that finishes is told,
          // and the card shows the newest still going (else the newest).
          const args = ["run", "list", "--repo", path, "--limit", "5", "--json", RUN_FIELDS];
          if (this.repo.branch) args.push("--branch", this.repo.branch);
          const r = await this.ask(args);
          if (!r.ok) { this.problem = r.problem; return; }
          const runs = parseList(r.text);
          for (const each of runs) this.notice(each);
          id = (runs.find((x) => !x.done) ?? runs[0])?.id ?? null;
          if (!id) { this.run = null; this.problem = null; this.none = true; return; }
        }
        this.none = false;
        const v = await this.ask(["run", "view", String(id), "--repo", path, "--json", VIEW_FIELDS]);
        if (!v.ok) { this.problem = v.problem; return; }
        const run = parseView(v.text);
        this.problem = null;
        this.run = run;
        this.notice(run);
      } catch (e) {
        this.problem = { kind: "other", message: String(e?.message ?? e), hint: "" };
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  // Tells once per run and attempt, only when this window saw it unfinished.
  notice(run) {
    if (!run) return;
    const k = runKey(run);
    if (!run.done) { this.unfinished.add(k); return; }
    const say = tell(run, this.unfinished, this.told);
    if (!say) return;
    this.told.add(k);
    save("ci-watch.told", [...this.told].slice(-50));
    notify({ title: say.title, body: say.body, level: say.level, timeout: say.failed ? 20000 : 8000 });
    if (say.failed && this.ring) playSound("blocked");
  }

  pick(cx) {
    this.picking = !this.picking;
    if (!this.picking || !this.repo) { cx.notify(); return; }
    this.recent = null;
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await this.ask(["run", "list", "--repo", this.repo.remote.path, "--limit", "8", "--json", RUN_FIELDS]);
      this.recent = r.ok ? parseList(r.text) : [];
      cx.notify();
    });
  }

  choose(id, cx) {
    this.pin = id ? { repo: this.repo.remote.path, id } : null;
    save("ci-watch.pin", this.pin);
    this.picking = false;
    this.run = null;
    this.busy = false;
    this.look(cx);
  }

  card(t, run) {
    const color = toneColor(t, run.tone);
    const segs = run.jobs.length ? run.jobs : [{ tone: run.tone, name: "" }];
    return v_flex().px(16).pt(4).pb(10).gap(10)
      .child(h_flex().gap(10).items_center()
        .child(toneDot(t, run.tone, 12))
        .child(div().flex_1().text_size(22).font_semibold().text_color(color).child(WORDS[run.tone] ?? "Finished"))
        .child(div().text_size(18).text_color(run.done ? t.muted : t.foreground).child(run.took || "")))
      .child(v_flex().gap(3).min_w(0)
        .child(h_flex().gap(6).min_w(0)
          .child(div().flex_none().font_semibold().text_color(t.foreground).child(`${run.workflow} #${run.number}`))
          .when(run.attempt > 1, (el) => el.child(chip(t, `attempt ${run.attempt}`)))
          .child(div().flex_1())
          .child(textButton(t, "open", "open", (_e, cx) => cx.open_url(run.url))))
        .child(div().truncate().text_color(t.muted).child(run.title))
        .child(h_flex().gap(6).text_size(11).text_color(t.dim)
          .when(Boolean(run.branch), (el) => el.child(chip(t, run.branch)))
          .child(div().child(run.event))
          .child(div().child(`started ${ago(run.started)}`))))
      // One segment per job, in the job's color.
      .child(h_flex().h(5).gap(2).children(segs.map((j) => {
        const seg = div().flex_1().h_full().rounded(2).bg(j.tone === "queued" ? t.raised : toneColor(t, j.tone));
        return j.tone === "running" ? seg.loop("opacity", { from: 0.4, to: 1, period: 1200 }) : seg;
      })))
      .when(run.total > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(`${run.finished} of ${run.total} jobs done`)))
      .child(v_flex().id("jobs").gap(1).max_h(180).overflow_y_scrollbar().children(run.jobs.map((j, i) =>
        h_flex().id(`job-${i}`).h(26).px(6).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_mouse_down("left", stop).on_click((_e, cx) => j.url && cx.open_url(j.url))
          .child(toneDot(t, j.tone, 7))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(j.tone === "fail" ? t.blocked : t.foreground).child(j.name))
          .when(Boolean(j.step), (r) => r.child(div().max_w(120).truncate().text_size(11).text_color(t.dim).child(j.step)))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(j.took)))));
  }

  picker(t) {
    const list = this.recent;
    return v_flex().mx(10).mb(6).p(4).gap(1).rounded(8).bg(t.raised)
      .child(h_flex().id("follow").h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop).on_click((_e, cx) => this.choose(null, cx))
        .child(div().flex_1().text_size(12).text_color(t.foreground).child(`Follow ${this.repo?.branch || "this branch"}: its latest run`)))
      .when(list === null, (el) => el.child(div().px(8).py(4).text_size(11.5).text_color(t.dim).child("Looking…")))
      .children((list ?? []).map((r) => h_flex().id(`pick-${r.id}`).h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click((_e, cx) => this.choose(r.id, cx))
        .child(toneDot(t, r.tone, 7))
        .child(div().flex_none().text_size(12).font_semibold().text_color(t.foreground).child(`${r.workflow} #${r.number}`))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(r.title))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(r.started)))));
  }

  render() {
    const t = theme();
    const run = this.run;
    const what = this.pin ? `run #${run?.number ?? "…"}` : this.repo?.branch ? `following ${this.repo.branch}` : "following the branch";
    return shell(t, this.overlay, 380, v_flex().pb(8))
      .child(header(t, { title: "CI watch", detail: this.repo ? this.repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && !run && !this.none, (el) => el.child(looking(t)))
      .when(!this.problem && !run && Boolean(this.none), (el) => el.child(div().px(16).py(10).text_color(t.dim)
        .child(`No runs on ${this.repo?.branch || "this branch"} yet. Push to start one; it shows here within a minute.`)))
      .when(!this.problem && Boolean(run), (el) => el.child(this.card(t, run)))
      .when(this.picking, (el) => el.child(this.picker(t)))
      .when(Boolean(this.repo), (el) => el.child(h_flex().px(12).pt(2).gap(4).items_center().text_size(11).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().pl(4).child(what))
        .child(textButton(t, "pick", this.picking ? "done" : "pick a run", (_e, cx) => this.pick(cx)))
        .child(textButton(t, "ring", this.ring ? "ring on failure: on" : "ring on failure: off", (_e, cx) => {
          this.ring = !this.ring; save("ci-watch.ring", this.ring); cx.notify();
        }, this.ring ? t.foreground : t.dim))));
  }
}
