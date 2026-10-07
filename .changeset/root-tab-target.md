---
"blume": patch
---

A tab at `path: "/"` on a site with no root `index.mdx` now links to the first page in the sidebar, as tabs for other sections already did, instead of to `/`, which has no page. On an archived version's pages, the root tab still links back to the current docs, now under a `basePath` too, where it linked to the archived version's first page. `BLUME_NAV_MISSING_PAGE` now checks a tab where it links: its `href` when it has one, and its `path` otherwise. Before, it checked only `path`, so a root tab warned on every build, even with `href` set to a real page.
