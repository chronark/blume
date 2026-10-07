---
"blume": patch
---

`<Card img="./cover.png">` now finds an image next to the page, like `![](./cover.png)` does. The card rendered `img` as written, so the browser resolved a relative path against the page's URL and the image 404'd, while `blume validate` never checked it. A card's relative `img` is now published with the page and points at its served copy, a card in an included partial resolves its image next to the partial, and the raw `.mdx` copy agents read points at the same URL. `blume validate` checks `img` like any image embed and reports a missing file as `BLUME_BROKEN_ASSET`.
