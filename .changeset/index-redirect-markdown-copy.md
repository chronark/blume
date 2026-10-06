---
"blume": patch
---

A redirect from `/index` to `/` no longer breaks the home page's Markdown copy. A redirect that moves a page also redirects its `.md` and `.mdx` copies, and `/index.md` is the home page's own copy, so that redirect turned `/index.md` into a redirect to itself: every redirect file looped on it, and a static build replaced the copy with a redirect page, while `build`, `validate`, and `audit` all passed. A redirect now never takes over a Markdown copy Blume serves. One you write from a copy yourself, like `/guide.md` or `/index.md`, warns `BLUME_REDIRECT_MATCHES_PAGE`, since agents lose that copy.
