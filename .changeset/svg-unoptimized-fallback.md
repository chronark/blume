---
"blume": patch
---

A colocated SVG whose size Astro can't read no longer fails the whole build. Astro reads an SVG's size from its `<svg>` tag, and only when that tag ends within the file's first 1,000 bytes with a width and height or a viewBox; a draw.io export puts its whole diagram in a `content` attribute on the tag, so one diagram failed `blume build` with `NoImageMetadata`. The page now shows that SVG as it is, served from `/blume-assets/content/…` like the copies agents read, and `blume dev`, `blume build`, and `blume validate` warn about it as `BLUME_SVG_UNOPTIMIZED` at the line that embeds it.
