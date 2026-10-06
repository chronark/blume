---
"blume": patch
---

`BLUME_NAV_INDEX_TITLE_MISMATCH` no longer says the page's `<title>` shows its frontmatter `title` when `seo.title` replaces it, and its fix no longer suggests leaving an intentional difference alone, which `blume validate --strict` fails on. It now names the ways to clear it: match the page's title and the folder's `meta.ts` title, set the hidden index page's `sidebar.label` to the folder title to keep a different heading on purpose, or show the index row again. A hidden index page whose `sidebar.label` matches its folder's title no longer warns.
