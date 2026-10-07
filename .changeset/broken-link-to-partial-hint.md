---
"blume": patch
---

`blume validate` now says why a link to a partial is broken. A file whose name, or a folder's, starts with `_` isn't published, so a link like `[setup](./_setup.md)` reported only that no page resolves to `/_setup`, although the file is right there. The `BLUME_BROKEN_LINK` fix now names the file as a partial and suggests splicing it in with `<include>`, renaming it, or adding `"!**/_*"` to `content.exclude`.
