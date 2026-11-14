// Dev utils: a small toolbox in tabs. UUID v4s, a random password (length, which characters),
// base64 and URL encoding both ways, and the SHA-256 of some text. Everything is worked out
// here, nothing is sent anywhere, and every result copies with a click. Randomness comes from
// the system (crypto.getRandomValues); SHA-256 uses WebCrypto, else `shasum -a 256`.
// Only the chosen tab and options are remembered, never a password or what you typed.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import * as nodeCrypto from "crypto";
import { exec, settings, theme, props, closeOverlay } from "woolshed";
import { uuidV4, password, entropyBits, strength, b64encode, b64decode, urlEncode, urlDecode, queryParams, utf8Bytes, hex, hexToBase64 } from "./parse.js";

const TABS = [["uuid", "UUID"], ["password", "Password"], ["base64", "Base64"], ["url", "URL"], ["sha", "SHA-256"]];
const LENGTHS = [12, 16, 20, 24, 32, 64];
const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ } },
};

function randomBytes(n) {
  const b = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) { globalThis.crypto.getRandomValues(b); return b; }
  return new Uint8Array(nodeCrypto.randomBytes(n));
}

// A stream of random bytes, refilled in blocks.
function byteSource() {
  let pool = randomBytes(256), at = 0;
  return () => { if (at >= pool.length) { pool = randomBytes(256); at = 0; } return pool[at++]; };
}

export default class DevUtils extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.tab = store.get("dev-utils:tab", "uuid");
    this.opts = store.get("dev-utils:opts", { upper: true, lower: true, digits: true, symbols: true, similar: false, length: 20, uuidUpper: false, uuidDashes: true, b64Url: false, urlWhole: false });
    this.mode = { base64: "encode", url: "encode" };
    this.note = null;
    this.uuids = this.newUuids();
    this.password = this.newPassword();
    this.inputs = {
      base64: TextareaState.new({ placeholder: "Text to encode, or base64 to decode", rows: 4 }),
      url: TextareaState.new({ placeholder: "Text or a URL", rows: 4 }),
      sha: TextareaState.new({ placeholder: "Text to hash", rows: 4 }),
    };
    this.digest = null;
    for (const [k, s] of Object.entries(this.inputs)) s.on("change", (_e, cx) => { if (k === "sha") this.hash(cx); cx.notify(); });
  }

  save() { store.set("dev-utils:tab", this.tab); store.set("dev-utils:opts", this.opts); }
  newUuids() { return Array.from({ length: 5 }, () => uuidV4(randomBytes(16))); }
  newPassword() { return password(this.opts.length, this.opts, byteSource()); }

  hash(cx) {
    const text = this.inputs.sha.value();
    const n = (this.hashing = (this.hashing ?? 0) + 1);
    if (!text) { this.digest = null; return; }
    cx.spawn(async (cx) => {
      let out = null, error = null;
      try {
        if (globalThis.crypto?.subtle?.digest) out = hex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", utf8Bytes(text))));
        else {
          const r = await exec("sh", ["-c", 'printf "%s" "$1" | shasum -a 256', "sh", text], { timeout: 5000 });
          out = r.code === 0 ? r.stdout.trim().split(/\s+/)[0] : null;
          if (!out) error = "shasum isn't available here.";
        }
      } catch (e) { error = String(e.message ?? e); }
      if (n === this.hashing) { this.digest = out ? { hex: out } : { error }; cx.notify(); }
    });
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(1800, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  copy(text, what, cx) {
    if (!text) return;
    cx.write_to_clipboard(text);
    this.flash(`Copied ${what}.`, cx);
  }

  chip(t, id, label, on, action) {
    return div().id(id).flex_none().h(24).px(8).flex().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted).when(on, (el) => el.font_medium())
      .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
  }

  button(t, id, label, action, primary = false) {
    return div().id(id).flex_none().h(26).px(11).flex().items_center().rounded(6).text_size(11.5).font_medium().cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);
  }

  // A result: mono text on the terminal background, click to copy.
  output(t, id, text, what, opts = {}) {
    const mono = settings().font_family ?? "JetBrains Mono";
    return div().id(id).flex_none().px(10).py(8).rounded(7).border_1().border_color(opts.error ? t.blocked : t.border).bg(t.background)
      .font_family(mono).text_size(opts.size ?? 12).cursor_pointer().hover((s) => s.border_color(t.accent))
      .text_color(opts.error ? t.blocked : text ? t.foreground : t.dim)
      .when(!opts.error && Boolean(text), (el) => el.tooltip(`Click to copy ${what}`))
      .on_mouse_down("left", stop).on_click((_e, cx) => { if (!opts.error) this.copy(text, what, cx); })
      .child(text || opts.placeholder || " ");
  }

  textarea(t, key) {
    const mono = settings().font_family ?? "JetBrains Mono";
    return div().flex_none().h(96).on_mouse_down("left", stop).child(Textarea.new(this.inputs[key]).w_full().h_full().px(10).py(8).rounded(7)
      .border_1().border_color(t.input).bg(t.background).font_family(mono).text_size(12).text_color(t.foreground));
  }

  uuidTab(t) {
    const fmt = (u) => { const s = this.opts.uuidDashes ? u : u.replace(/-/g, ""); return this.opts.uuidUpper ? s.toUpperCase() : s; };
    const mono = settings().font_family ?? "JetBrains Mono";
    return v_flex().gap(8)
      .child(v_flex().gap(2).children(this.uuids.map((u, i) => h_flex().id(`uuid-${i}`).flex_none().h(30).px(10).items_center().rounded(7)
        .bg(t.background).border_1().border_color(t.border).cursor_pointer().hover((s) => s.border_color(t.accent))
        .on_mouse_down("left", stop).on_click((_e, cx) => this.copy(fmt(u), "the UUID", cx))
        .child(div().flex_1().min_w(0).truncate().font_family(mono).text_size(12.5).text_color(t.foreground).child(fmt(u)))
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child("copy")))))
      .child(h_flex().gap(6).items_center()
        .child(this.button(t, "uuid-new", "New", (_e, cx) => { this.uuids = this.newUuids(); cx.notify(); }, true))
        .child(this.button(t, "uuid-all", "Copy all", (_e, cx) => this.copy(this.uuids.map(fmt).join("\n"), "5 UUIDs", cx)))
        .child(div().flex_1())
        .child(this.chip(t, "uuid-upper", "UPPER", this.opts.uuidUpper, (_e, cx) => { this.opts.uuidUpper = !this.opts.uuidUpper; this.save(); cx.notify(); }))
        .child(this.chip(t, "uuid-dashes", "dashes", this.opts.uuidDashes, (_e, cx) => { this.opts.uuidDashes = !this.opts.uuidDashes; this.save(); cx.notify(); })));
  }

  passwordTab(t) {
    const o = this.opts;
    const bits = entropyBits(o.length, o);
    const toggle = (k) => (_e, cx) => {
      o[k] = !o[k];
      if (!o.upper && !o.lower && !o.digits && !o.symbols) o.lower = true;
      this.save(); this.password = this.newPassword(); cx.notify();
    };
    return v_flex().gap(8)
      .child(this.output(t, "pw-out", this.password, "the password", { size: o.length > 32 ? 11.5 : 14 }))
      .child(h_flex().gap(6).items_center().text_size(11)
        .child(div().flex_1().text_color(bits >= 75 ? t.done : bits >= 50 ? t.working : t.blocked).child(`≈ ${bits} bits · ${strength(bits)}`))
        .child(this.button(t, "pw-new", "New", (_e, cx) => { this.password = this.newPassword(); cx.notify(); }, true))
        .child(this.button(t, "pw-copy", "Copy", (_e, cx) => this.copy(this.password, "the password", cx))))
      .child(h_flex().gap(4).items_center().flex_wrap()
        .child(div().w(52).flex_none().text_size(11).text_color(t.dim).child("Length"))
        .children(LENGTHS.map((n) => this.chip(t, `pw-len-${n}`, String(n), o.length === n, (_e, cx) => { o.length = n; this.save(); this.password = this.newPassword(); cx.notify(); }))))
      .child(h_flex().gap(4).items_center().flex_wrap()
        .child(div().w(52).flex_none().text_size(11).text_color(t.dim).child("Uses"))
        .child(this.chip(t, "pw-upper", "A-Z", o.upper, toggle("upper")))
        .child(this.chip(t, "pw-lower", "a-z", o.lower, toggle("lower")))
        .child(this.chip(t, "pw-digits", "0-9", o.digits, toggle("digits")))
        .child(this.chip(t, "pw-symbols", "symbols", o.symbols, toggle("symbols")))
        .child(this.chip(t, "pw-similar", "I l 1 O 0", o.similar, toggle("similar")).tooltip("Allow characters that look alike")))
      .child(div().text_size(10.5).text_color(t.dim).child("Made here from the system's random source; not saved anywhere."));
  }

  base64Tab(t) {
    const text = this.inputs.base64.value();
    const enc = this.mode.base64 === "encode";
    const r = enc ? { ok: true, text: b64encode(text, this.opts.b64Url) } : b64decode(text);
    return v_flex().gap(8)
      .child(h_flex().gap(4).items_center()
        .child(this.chip(t, "b64-enc", "Encode", enc, (_e, cx) => { this.mode.base64 = "encode"; cx.notify(); }))
        .child(this.chip(t, "b64-dec", "Decode", !enc, (_e, cx) => { this.mode.base64 = "decode"; cx.notify(); }))
        .child(div().flex_1())
        .when(enc, (el) => el.child(this.chip(t, "b64-url", "URL-safe", this.opts.b64Url, (_e, cx) => { this.opts.b64Url = !this.opts.b64Url; this.save(); cx.notify(); })))
        .child(this.chip(t, "b64-swap", "⇅ use result", false, (_e, cx) => { if (r.ok && !r.binary) { this.inputs.base64.set_value(r.text); this.mode.base64 = enc ? "decode" : "encode"; cx.notify(); } })))
      .child(this.textarea(t, "base64"))
      .child(this.output(t, "b64-out", r.ok ? r.text : r.error, enc ? "the base64" : "the text", { error: !r.ok, placeholder: enc ? "Base64 shows here" : "Text shows here" }))
      .when(!enc && r.ok && r.binary, (el) => el.child(div().text_size(10.5).text_color(t.working).child(`Not text: ${r.bytes} bytes, shown as hex.`)));
  }

  urlTab(t) {
    const text = this.inputs.url.value();
    const enc = this.mode.url === "encode";
    const r = enc ? urlEncode(text, this.opts.urlWhole) : urlDecode(text);
    const params = !enc ? queryParams(text) : null;
    const mono = settings().font_family ?? "JetBrains Mono";
    return v_flex().gap(8)
      .child(h_flex().gap(4).items_center()
        .child(this.chip(t, "url-enc", "Encode", enc, (_e, cx) => { this.mode.url = "encode"; cx.notify(); }))
        .child(this.chip(t, "url-dec", "Decode", !enc, (_e, cx) => { this.mode.url = "decode"; cx.notify(); }))
        .child(div().flex_1())
        .when(enc, (el) => el.child(this.chip(t, "url-whole", this.opts.urlWhole ? "whole URL" : "one part", true, (_e, cx) => { this.opts.urlWhole = !this.opts.urlWhole; this.save(); cx.notify(); })
          .tooltip("One part (encodeURIComponent) escapes / ? & = too; a whole URL (encodeURI) keeps them"))))
      .child(this.textarea(t, "url"))
      .child(this.output(t, "url-out", r.ok ? r.text : r.error, "the result", { error: !r.ok, placeholder: "The result shows here" }))
      .when(Boolean(params?.length), (el) => el.child(v_flex().gap(1).px(2)
        .child(div().text_size(11).text_color(t.dim).child(`${params.length} query parameter${params.length === 1 ? "" : "s"}`))
        .children(params.slice(0, 12).map(([k, v], i) => h_flex().id(`qp-${i}`).flex_none().h(22).px(8).gap(8).items_center().rounded(5).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click((_e, cx) => this.copy(v, `the value of ${k}`, cx))
          .child(div().flex_none().max_w(140).truncate().font_family(mono).text_size(11.5).text_color(t.accent).child(k))
          .child(div().flex_1().min_w(0).truncate().font_family(mono).text_size(11.5).text_color(t.foreground).child(v))))));
  }

  shaTab(t) {
    const d = this.digest;
    return v_flex().gap(8)
      .child(this.textarea(t, "sha"))
      .child(this.output(t, "sha-out", d?.hex ?? d?.error ?? "", "the SHA-256", { error: Boolean(d?.error), placeholder: "The SHA-256 (hex) shows here", size: 11.5 }))
      .when(Boolean(d?.hex), (el) => el.child(h_flex().gap(6).items_center()
        .child(div().flex_1().text_size(10.5).text_color(t.dim).child("Of the text as UTF-8, exactly as typed (no newline added)."))
        .child(this.button(t, "sha-b64", "Copy as base64", (_e, cx) => this.copy(hexToBase64(d.hex), "the SHA-256 as base64", cx)))));
  }

  render() {
    const t = theme();
    const body = { uuid: () => this.uuidTab(t), password: () => this.passwordTab(t), base64: () => this.base64Tab(t), url: () => this.urlTab(t), sha: () => this.shaTab(t) }[this.tab] ?? (() => this.uuidTab(t));
    return v_flex().id("dev-utils").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(440) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("Dev utils"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("du-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(h_flex().flex_none().mx(12).mb(10).p(3).gap(2).rounded(8).bg(t.raised)
        .children(TABS.map(([id, label]) => div().id(`tab-${id}`).flex_1().h(26).flex().items_center().justify_center().rounded(6)
          .text_size(11.5).cursor_pointer().when(this.tab === id, (el) => el.bg(t.background).font_semibold())
          .text_color(this.tab === id ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
          .on_mouse_down("left", stop).on_click((_e, cx) => { this.tab = id; this.save(); cx.notify(); }).child(label))))
      .child(v_flex().flex_none().min_h(this.overlay ? 250 : 0).px(12).child(body()))
      .child(div().flex_none().px(16).pt(10).h(26).text_size(10.5).text_color(this.note ? t.foreground : t.dim).truncate()
        .child(this.note ?? "Click a result to copy it."));
  }
}
