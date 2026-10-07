---
"blume": patch
---

`content.exclude` (and a `filesystem()` source's `exclude`) now adds to the default `["**/_*", "**/.*"]` instead of replacing it. Before, setting `exclude: ["drafts/**"]` silently published every `_`-prefixed partial and dot-file as a page. To publish `_`-prefixed or dot-files on purpose, list the default you want dropped with a `!`: `exclude: ["!**/_*"]` publishes underscore files, and `"!**/.*"` dot-files. A config that already lists the two defaults beside its own patterns works as before.
