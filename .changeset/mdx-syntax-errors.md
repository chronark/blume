---
"blume": patch
---

An `.mdx` page that MDX can't parse (an HTML comment, an element left open, a stray `{`) used to pass `blume validate`, `blume doctor`, and `blume check`, and only failed `blume build` once Astro compiled it. Blume now parses every `.mdx` page when it reads the project, so all of them report it as `BLUME_MDX_SYNTAX`, an error at the line and column where MDX stopped, with how to fix it, and `blume build` stops before it compiles anything. `blume build --no-strict` now leaves such a page out and builds the rest of the site, as it does a page with invalid front matter; before, the build still failed on it. `blume dev` keeps the page, so opening it shows the error. A partial that only breaks once an `.mdx` page includes it is a `BLUME_MDX_SYNTAX` warning at the partial's line.
