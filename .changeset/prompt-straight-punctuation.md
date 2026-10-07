---
"blume": patch
---

Copying a `<Prompt>` (or opening it in Cursor) keeps the punctuation its body was written with. Smart punctuation curled the body's quotes and joined its dashes and dots like the rest of the page's prose, so `lang="ts"` copied as `lang=“ts”` and `--force` as `–force`, which broke code in the prompt. Quotes, dashes, and ellipses the body's author typed as such still copy as typed.
