---
"blume": patch
---

A `script()` analytics adapter with a root-relative `src`, like `script({ src: "/js/redirects.js" })` for a file in `public/`, now loads it under `deployment.base`. Before, the tag kept the path as written, so on a site served under a base the script 404ed unless the base was written into `src` by hand. A `src` that already starts with the base is left as written, and absolute and protocol-relative URLs pass through unchanged.
