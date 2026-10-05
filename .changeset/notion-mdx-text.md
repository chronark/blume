---
"blume": patch
---

`notion()` takes `mdx: true` to read the text of a Notion page as MDX, so components like `<CardGroup>` and `<Card>`, expressions, and Markdown typed into paragraphs, headings, list items, quotes, and callouts render instead of showing as written. Blume 2 escapes that text by default, which left pages written this way under Blume 1 showing their tags. Code blocks, toggle titles, captions, and properties stay plain text. MDX runs code at build time, so turn this on only for a database whose editors you trust with the site's build.
