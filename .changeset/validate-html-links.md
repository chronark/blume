---
"blume": patch
---

`blume validate` now says which page an `.html` link means. Blume serves pages at their routes, never at `.html` URLs, so a link like `./setup.html` or `/guides/setup.html` 404s unless `public/` has that file. `validate` reported it only as an asset missing from `public/` (`BLUME_BROKEN_ASSET`), and skipped it entirely when the project had no `public/` folder. The warning now names the page route to link instead, like `/guides/setup` for `setup.html` or `/guides` for `guides/index.html`.
