---
"blume": patch
---

`blume dev`, `blume build`, and `blume doctor` warn about folder meta that does nothing. A `meta.ts` `pages` entry that names no page or folder in its group was ignored without a word; `BLUME_META_UNKNOWN_PAGE` now names the file, the entry, and its line, and suggests the slug it most likely means (`"quickstart"` for `"01-quickstart.mdx"`, or a near miss). A `meta.ts` outside every `include` glob of its content source is never read, which left a reference's tag-folder `meta.ts` silently ignored on a site whose `include` lists only its own folders. When such a file sits in a sidebar group's folder, `BLUME_META_OUTSIDE_INCLUDE` now says so and suggests an `include` glob that reaches it.
