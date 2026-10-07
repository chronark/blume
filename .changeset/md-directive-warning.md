---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn about a `:::` directive in a `.md` page. Directives render only in `.mdx`, so a `:::note` callout in a `.md` page showed its `:::` lines as text with no warning. `BLUME_MD_DIRECTIVE` names the file and line and says to rename the page to `.mdx`, or, for a name that isn't a callout type, lists the callout types. Code blocks and inline code are skipped.
