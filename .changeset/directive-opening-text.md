---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn when a callout opener has text after its name. `:::tip Some title` opens a `tip` callout but drops `Some title`, so the callout rendered untitled with no warning. `BLUME_DIRECTIVE_OPENING_TEXT` names the file and line and gives the bracketed spelling that keeps the title, `:::tip[Some title]`.
