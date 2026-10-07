---
"blume": patch
---

A relative link to a file next to a page now works. `[the spec](./spec.pdf)`, a reference definition like `[spec]: ./spec.pdf`, and an HTML element naming such a file (the `src` of an `<img>`, `<video>`, `<source>`, or `<audio>`, and the `href` of an `<a>` or a component, as raw HTML in `.md` or an element in `.mdx`) all shipped as written, so the browser resolved them against the page's URL and the file, never published, 404'd. The file is now published with the page and the built link points at that copy, keeping a suffix like `#page=2`, in the page's Markdown copy and `llms-full.txt` too. A partial's link moves with it when the partial is included from another folder. `blume validate` accepts these links, and no longer warns that an `<img src>` naming a file beside the page isn't published.
