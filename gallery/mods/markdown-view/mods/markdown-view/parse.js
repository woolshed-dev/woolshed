// Which markdown file to show, and where a link in one leads. Pure functions.

const MD = /\.(md|markdown|mdx)$/i;

// `git ls-files -z` (NUL-separated) or `ls -1` (lines) into markdown paths,
// shallow ones first, then by name.
export function markdownFiles(stdout) {
  const raw = String(stdout ?? "");
  const list = (raw.includes("\0") ? raw.split("\0") : raw.split(/\r?\n/)).map((s) => s.trim()).filter((s) => s && MD.test(s));
  const depth = (p) => p.split("/").length;
  return [...new Set(list)].sort((a, b) => depth(a) - depth(b) || a.toLowerCase().localeCompare(b.toLowerCase()));
}

// The README at the top, else the shallowest README, else the first file.
export function pickDefault(files, remembered) {
  if (remembered && files.includes(remembered)) return remembered;
  const readme = (p) => /^readme\.(md|markdown|mdx)$/i.test(p.split("/").pop());
  return files.find((p) => !p.includes("/") && readme(p)) ?? files.find(readme) ?? files[0] ?? null;
}

function normalize(parts) {
  const out = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") { if (!out.length) return null; out.pop(); } else out.push(p);
  }
  return out.join("/");
}

// A link clicked in `current` (a path in the repo): another markdown file in
// the list ({ file }), a web page ({ url }), or nothing we can open (null).
export function resolveLink(current, href, files, root) {
  const h = String(href ?? "").trim();
  if (/^https?:\/\//i.test(h)) {
    // TextView may hand back a relative link resolved against a fake base.
    return { url: h };
  }
  let path = h.replace(/^file:\/\//i, "").replace(/[#?].*$/, "");
  try { path = decodeURIComponent(path); } catch {}
  if (!path) return null;
  let rel;
  if (path.startsWith("/")) {
    if (!root || !path.startsWith(root.replace(/\/+$/, "") + "/")) return null;
    rel = path.slice(root.replace(/\/+$/, "").length + 1);
  } else {
    const dir = current && current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
    rel = normalize([...dir.split("/"), ...path.split("/")]);
  }
  if (rel === null) return null;
  rel = normalize(rel.split("/"));
  return rel && files.includes(rel) ? { file: rel } : null;
}
