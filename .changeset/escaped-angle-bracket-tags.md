---
"blume": patch
---

A backslash-escaped `<` in an `.mdx` page no longer counts as a component tag. Text like `Promise\<App>` or `\<Not set>` renders as literal text, but `blume dev` and `blume build` still warned that `<App>` or `<Not>` isn't a known component (`BLUME_UNKNOWN_COMPONENT`), and an escaped `\<Component path="…">` was reported as a missing example. `blume validate` likewise no longer checks the link in an escaped `\<a href="…">` or `\<Card href="…">`, or accepts a fragment that only an escaped `\<a id="…">` provides. Real tags are still caught, including one after an escaped backslash (`\\<Foo />`).
