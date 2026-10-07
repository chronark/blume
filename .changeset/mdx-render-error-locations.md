---
"blume": patch
---

A build that fails in an `.mdx` page now says where. A `{…}` expression that reads a name nothing defines (`{user.name}`, a `{{name}}` on a site without that variable, an attribute list like `{ width="300" }`) failed with a bare `ReferenceError` that named only the route; it's now `BLUME_MDX_UNDEFINED_NAME`, at the expression's file, line, and column, with how to show the braces as text. A compile error in a partial an `.mdx` page includes named only the page, with no line; it's now reported at the partial's own line.
