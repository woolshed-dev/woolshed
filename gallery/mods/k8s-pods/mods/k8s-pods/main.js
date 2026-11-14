// Kubernetes pods: the pods in kubectl's current context and a namespace you
// pick, with status, ready containers, restarts and age, the troubled ones
// first. Logs opens a new tab running `kubectl logs -f`. Lists every 15
// seconds while it's open (a window) or while its block is in the layout (a
// strip): `kubectl config current-context`, `kubectl config view --minify`
// (the context's namespace, once), `kubectl get pods -o json`, and
// `kubectl get namespaces` when you open the picker. Read-only otherwise:
// it never changes kubectl's config; the namespace you pick is remembered here.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, run, spaces, theme, props, closeOverlay } from "woolshed";
import { parsePods, failure } from "./parse.js";

const EVERY = 15000;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const kube = (args, timeout = 12000) => exec("kubectl", args, { timeout });

export default class K8sPods extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.context = null;
    this.ns = null;
    this.pods = null;
    this.problem = null;
    this.error = null;
    this.picking = false;
    this.namespaces = null;
    this.hover = null;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  saved(context) {
    try { return localStorage.getItem(`k8s-pods.ns.${context}`); } catch { return null; }
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const c = await kube(["config", "current-context"], 8000);
        if (c.code !== 0) throw Object.assign(new Error(c.stderr.trim()), { stderr: c.stderr });
        const context = c.stdout.trim();
        if (context !== this.context) {
          this.context = context;
          this.namespaces = null;
          let ns = this.saved(context);
          if (!ns) {
            const v = await kube(["config", "view", "--minify", "-o", "jsonpath={..namespace}"], 8000).catch(() => null);
            ns = v?.code === 0 ? v.stdout.trim().split(/\s+/)[0] : "";
          }
          this.ns = ns || "default";
        }
        const r = await kube(["--context", context, "-n", this.ns, "get", "pods", "-o", "json", "--request-timeout=10s"]);
        if (r.code !== 0) throw Object.assign(new Error(r.stderr.trim()), { stderr: r.stderr });
        const pods = parsePods(r.stdout);
        if (!pods) throw new Error("kubectl's answer wasn't JSON.");
        this.pods = pods;
        this.problem = null;
        this.error = null;
      } catch (e) {
        this.problem = failure(e?.stderr ? null : e?.message ?? e, e?.stderr ?? "");
        this.error = (e?.stderr ?? String(e?.message ?? e)).trim().split("\n")[0].replace(/^error:\s*/i, "") || "kubectl failed.";
        if (this.problem === "missing" || this.problem === "nocontext") this.pods = null;
      }
      this.busy = false;
      cx.notify();
    });
  }

  pick(cx) {
    this.picking = !this.picking;
    if (!this.picking || this.namespaces || !this.context) return;
    cx.spawn(async (cx) => {
      const r = await kube(["--context", this.context, "get", "namespaces", "-o", "jsonpath={.items[*].metadata.name}", "--request-timeout=10s"]).catch(() => null);
      this.namespaces = r?.code === 0 ? r.stdout.trim().split(/\s+/).filter(Boolean) : [];
      cx.notify();
    });
  }

  choose(ns, cx) {
    this.ns = ns;
    this.picking = false;
    this.pods = null;
    try { localStorage.setItem(`k8s-pods.ns.${this.context}`, ns); } catch {}
    this.busy = false;
    this.look(cx);
  }

  logs(p) {
    const argv = ["kubectl", "--context", this.context, "-n", this.ns, "logs", "-f", "--tail=200", "--all-containers", "--prefix", p.name];
    const name = `logs: ${p.name}`;
    if (spaces().length) run("tab.new", { name, argv });
    else run("space.new", { name: "kubernetes", tab: name, argv });
  }

  tone(t, tone) { return tone === "bad" ? t.blocked : tone === "wait" ? t.working : tone === "ok" ? t.ansi2 : t.dim; }

  problemText() {
    if (this.problem === "missing") return "kubectl isn't installed here. Install it (`brew install kubectl`, or with your cloud's CLI), then look again.";
    if (this.problem === "nocontext") return "kubectl has no current context. Pick one with `kubectl config use-context <name>`.";
    if (this.problem === "forbidden") return `The cluster said no: ${this.error}. Sign in again with your cloud's CLI.`;
    if (this.problem === "unreachable") return `Can't reach the cluster for ${this.context}: ${this.error}`;
    return this.error;
  }

  row(t, p) {
    const stop = (_e, cx) => cx.stop_propagation();
    return h_flex().id(`pod-${p.name}`).flex_none().mx(6).px(10).h(32).gap(8).items_center().rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== (this.hover === p.name)) { this.hover = h ? p.name : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .tooltip(`${p.containers.join(", ")}${p.node ? ` · on ${p.node}` : ""}`)
      .child(div().size(8).flex_none().rounded(4).bg(this.tone(t, p.tone)))
      .child(div().flex_1().min_w(0).truncate().text_color(p.tone === "done" ? t.muted : t.foreground).child(p.name))
      .child(div().w(112).flex_none().truncate().text_size(11.5).text_color(p.tone === "ok" ? t.muted : this.tone(t, p.tone)).child(p.status))
      .child(div().w(38).flex_none().text_size(11.5).text_color(p.ready < p.total && p.tone !== "done" ? t.working : t.dim).child(`${p.ready}/${p.total}`))
      .when(this.hover === p.name, (el) => el.child(div().id(`pod-logs-${p.name}`).w(62).flex_none().h(22).flex().items_center().justify_center().rounded(6)
        .text_size(11.5).bg(t.raised).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.selected))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.logs(p); })
        .child("Logs")))
      .when(this.hover !== p.name, (el) => el
        .child(div().w(26).flex_none().text_size(11.5).text_right().text_color(p.restarts ? t.working : t.dim).child(String(p.restarts)))
        .child(div().w(28).flex_none().text_size(11.5).text_right().text_color(t.dim).child(p.age)));
  }

  strip(t) {
    const pods = this.pods ?? [];
    const ok = pods.filter((p) => p.tone === "ok" || p.tone === "done").length;
    const bad = pods.filter((p) => p.tone === "bad").length;
    return h_flex().id("k8s-pods").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .tooltip(this.problem || (this.error && !this.pods) ? this.problemText() : `${this.context} · ${this.ns}`)
      .child(div().flex_none().text_color(t.dim).child("Pods"))
      .when(Boolean(this.problem || (this.error && !this.pods)), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.blocked)
        .child(this.problem === "missing" ? "no kubectl" : this.problem === "nocontext" ? "no context" : "unreachable")))
      .when(!this.problem && Boolean(this.pods), (el) => el
        .child(div().flex_none().font_semibold().text_color(bad ? t.blocked : t.foreground).child(`${ok}/${pods.length}`))
        .child(h_flex().flex_1().min_w(0).gap(3).overflow_hidden().children(pods.slice(0, 14).map((p) => div().size(7).flex_none().rounded(4).bg(this.tone(t, p.tone)))))
        .child(div().flex_none().max_w(120).truncate().text_color(t.dim).child(this.ns)))
      .when(!this.problem && !this.pods && !this.error, (el) => el.child(div().text_color(t.dim).child("…")));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const pods = this.pods ?? [];
    // With pods from an earlier look, a failed look only says so above them.
    const failing = this.problem === "missing" || this.problem === "nocontext" || (Boolean(this.error) && !this.pods);
    const chip = (id, label, onClick, active) => div().id(id).flex_none().max_w(150).truncate().px(7).h(22).flex().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .bg(active ? t.selected : t.raised).text_color(t.foreground).hover((s) => s.bg(t.selected))
      .on_mouse_down("left", stop).on_click((_e, cx) => { onClick(cx); cx.notify(); })
      .child(label);
    return v_flex().id("k8s-pods").w(480).pb(10).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Pods"))
        .when(Boolean(this.context), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).tooltip("kubectl's current context").child(this.context)))
        .when(!this.context, (el) => el.child(div().flex_1()))
        .when(Boolean(this.context) && this.problem !== "nocontext", (el) => el.child(chip("k8s-ns", `${this.ns ?? "default"} ▾`, (cx) => this.pick(cx), this.picking)))
        .child(div().id("k8s-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .child(div().id("k8s-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(this.picking, (el) => el.child(v_flex().mx(10).mb(6).p(6).gap(6).rounded(8).bg(alpha(t.foreground, "08"))
        .child(div().px(2).text_size(11).text_color(t.dim).child(this.namespaces === null ? "Asking for namespaces…" : this.namespaces.length ? "Namespace" : "Couldn't list namespaces (you may not be allowed to).")
        )
        .child(h_flex().id("k8s-ns-list").flex_wrap().gap(4).max_h(120).overflow_y_scrollbar()
          .children((this.namespaces ?? []).map((ns) => chip(`k8s-ns-${ns}`, ns, (cx) => this.choose(ns, cx), ns === this.ns))))))
      .when(Boolean(failing), (el) => el.child(div().px(16).py(4).text_color(this.problem === "missing" || this.problem === "nocontext" ? t.muted : t.blocked).child(this.problemText())))
      .when(!failing && Boolean(this.error), (el) => el.child(div().px(16).pb(4).text_size(11.5).text_color(t.blocked).child(`Last look failed: ${this.problemText()}`)))
      .when(!failing && this.pods === null, (el) => el.child(div().px(16).text_color(t.dim).child("Asking the cluster…")))
      .when(!failing && this.pods !== null && !pods.length, (el) => el.child(div().px(16).py(4).text_color(t.dim).child(`No pods in ${this.ns}.`)))
      .when(pods.length > 0, (el) => el.child(h_flex().mx(6).px(10).pb(3).gap(8).text_size(10.5).text_color(t.dim)
        .child(div().w(8).flex_none())
        .child(div().flex_1().child("NAME"))
        .child(div().w(112).flex_none().child("STATUS"))
        .child(div().w(38).flex_none().child("READY"))
        .child(div().w(26).flex_none().text_right().tooltip("Restarts").child("↻"))
        .child(div().w(28).flex_none().text_right().child("AGE"))))
      .child(v_flex().id("k8s-rows").flex_none().max_h(380).gap(1).overflow_y_scrollbar().children(pods.map((p) => this.row(t, p))))
      .when(pods.length > 0, (el) => el.child(div().px(16).pt(6).text_size(11).text_color(t.dim).child(`${pods.length} pod${pods.length === 1 ? "" : "s"} · hover one for its logs`)));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}
