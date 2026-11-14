// What `git status --porcelain=v1 --branch` says about a folder. No imports.

// { branch, ahead, behind, changed } from its output; branch null when detached.
export function parseStatus(out) {
  const lines = (out ?? "").split("\n").filter(Boolean);
  const head = lines[0]?.startsWith("## ") ? lines[0].slice(3) : "";
  let branch = null, ahead = 0, behind = 0;
  if (head.startsWith("No commits yet on ")) branch = head.slice(18).trim();
  else if (head.startsWith("Initial commit on ")) branch = head.slice(18).trim();
  else if (head && !head.startsWith("HEAD")) {
    branch = head.split("...")[0].split(" ")[0];
    const m = head.match(/\[(.*)\]/);
    if (m) {
      ahead = Number(m[1].match(/ahead (\d+)/)?.[1] ?? 0);
      behind = Number(m[1].match(/behind (\d+)/)?.[1] ?? 0);
    }
  }
  const changed = lines.filter((l) => !l.startsWith("## ")).length;
  return { branch, ahead, behind, changed, detached: head.startsWith("HEAD") };
}
