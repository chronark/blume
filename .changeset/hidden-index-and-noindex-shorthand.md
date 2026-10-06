---
"blume": patch
---

The top-level `noindex: true` frontmatter shorthand now emits the page's `<meta name="robots" content="noindex">` and drops its canonical and structured data, exactly like `seo: { noindex: true }`. Before, it only took the page out of the sitemap, so `blume audit` reported the page as indexable but missing from the sitemap. The top-level `hidden` shorthand now also keeps a changelog entry off the `/changelog` index, like `sidebar.hidden`.

Hiding a folder's `index` page with `sidebar.hidden` (or `hidden`) to drop its duplicate sidebar row no longer takes the page out of the sitemap, site search, `llms.txt`, the site skill, the MCP server's page list, or the JSON API. The group row still links the landing page, so it stays listed like any other page; a hidden page nothing in the sidebar links is still left out.

After upgrading, the first build re-reads every page instead of reusing pages cached by the previous Blume version.
