---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn about two things in `.mdx` that used to pass `blume check` and then break the page:

- `BLUME_MDX_ATTRIBUTE_LIST`: an attribute list like `{ width="300" }` or `{: .note }` after an image or paragraph. MDX reads the braces as JavaScript, so the build failed at render time with a bare `ReferenceError` that named only the route. The warning names the file and line and suggests setting the attributes on a JSX element instead.
- `BLUME_MDX_UNCLOSED_ELEMENT`: an HTML void element without a closing slash, like `<img …>` or `<br>`. In an `.mdx` page it fails to compile, and in a `.md` partial that an `.mdx` page includes it silently took in the rest of the partial as its children. The warning points at the partial's own line.
