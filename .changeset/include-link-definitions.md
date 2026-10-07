---
"blume": patch
---

Link reference definitions now cross `<include>`, as if the partial were written inline. A reference in a page (`[PEP 508]`) to a definition in an included partial (`[pep 508]: https://…`), or a reference in a partial to a definition in the page or in another partial, stayed literal text, so a partial holding a site's shared link definitions linked nothing. Each now resolves, in `.md` and `.mdx` alike. A partial's definition of a file beside it moves with the partial, like its links. When the page and a partial both define a label, each uses its own.
