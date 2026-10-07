---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn about code fences that don't render as written. A language Shiki doesn't know, like ` ```requirements `, rendered as plain text with only a `[Shiki]` console line that named no page; it now warns as `BLUME_UNKNOWN_CODE_LANGUAGE` with the file and line. A fence option from another docs tool did nothing without a word: MkDocs' `hl_lines="2 3"` and `linenums="1"`, `showLineNumbers`, Fern's `wordWrap`, and `filename="…"`. Each now warns as `BLUME_CODE_FENCE_OPTION` and gives the Blume spelling (`{2,3}`, `lineNumbers`, `wrap`, `title="…"`), and says when a bare word like `wordWrap` shows up in the block's title.
