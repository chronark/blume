---
"blume": patch
---

`blume validate` now warns about a link that uses one of ReadMe's link schemes: `doc:`, `ref:`, `page:`, `changelog:`, or `blog:`. Only ReadMe resolves them, so anywhere else each ships as a dead link, and `validate` passed them. `BLUME_UNSUPPORTED_LINK_SCHEME` names the file and line; link the page by its path instead. Other schemes, like `mailto:`, `tel:`, or an app's `vscode:` deep link, are still left alone.
