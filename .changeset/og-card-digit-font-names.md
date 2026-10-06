---
"blume": patch
---

Open Graph cards render again for a font whose family name has a word starting with a digit, like the curated `source-sans-3` (Source Sans 3) and `source-serif-4` (Source Serif 4). The card handed the family name to the renderer unquoted, which reads it as CSS and rejects a word like `3`, so setting one of those fonts in `theme.fonts` failed the build whenever cards rendered. The card now quotes the name, and you no longer need to set `seo.og.fonts` to work around it.
