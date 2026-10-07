---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn about syntax from other docs tools that a page shows as written. Each warning names the file and line, skips code and comments, and says what to write instead:

- `BLUME_TEMPLATE_TAG`: a Liquid or Markdoc tag (`{% include note.html %}`) or a Liquid output (`{{ site.title }}`) in a `.md` page. A `{{name}}` that could be a Blume variable isn't reported.
- `BLUME_WIKILINK_UNSUPPORTED`: a wiki link (`[[Home]]`, `[[Text|Page]]`) that names one of the site's pages, or any with a `|`, with the Markdown link that replaces it. Obsidian vault sources still turn wiki links into links.
- `BLUME_MDC_SYNTAX`: a Nuxt Content (MDC) block component (`::callout` … `::`) or inline component (`:badge[New]{color="primary"}`).
