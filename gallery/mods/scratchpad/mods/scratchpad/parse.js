// Counting what a person wrote, not the markdown around it: headings' #, list
// marks, quotes, fences and table bars aren't words; a word has a letter or digit.

// Letters and digits: Latin, Greek, Cyrillic, kana, CJK and Hangul (not dashes or bullets).
const WORD = /[A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

export function words(text) {
  let n = 0;
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      // The fence's language ("```sh") isn't a word either.
      continue;
    }
    for (const token of line.split(/\s+/)) {
      if (WORD.test(token)) n++;
    }
  }
  return n;
}

export function countLabel(n) {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} word${n === 1 ? "" : "s"}`;
}

// Only web links leave Woolshed; anything else (file:, a relative path) is ignored.
export function webLink(url) {
  return /^https?:\/\/[^\s/]+/i.test(String(url ?? "")) ? url : null;
}
