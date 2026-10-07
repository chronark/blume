---
"blume": patch
---

A link to a Markdown file renamed from `.md` to `.mdx`, or back, now lands on that file's page even when the file has a `slug` or an ordering prefix. A link to `./01-setup.md` after the file became `01-setup.mdx`, or to `./setup.md` when `setup.mdx` sets its own `slug`, fell back to a relative link with the extension dropped, which no page serves, so the built link 404'd and `blume validate` reported `BLUME_BROKEN_LINK`. Blume now tries the same file with the other extension before that fallback, in the built page and in `blume validate` alike.
