---
"blume": patch
---

A pinned heading id now keeps `--`, `---`, `...`, and quotes as written. Smart punctuation, which turns `--` into a dash and curls quotes in a heading's text, also rewrote the id in its `[#…]` or `{#…}` marker, so `## Read and write [#read--write]` anchored as `#read–write` (with an en dash): links to `#read--write` missed the heading, and `blume validate` reported them as `BLUME_BROKEN_ANCHOR`. The id is now used exactly as written, on a page and in a partial it includes, so the anchor of such a heading changes from the dashed or curled form to the one in its marker.
