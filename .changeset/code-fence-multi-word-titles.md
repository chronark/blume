---
"blume": patch
---

A code block's title is every word after its language. Before, only the first word counted, so ` ```javascript Install the client ` was titled "Install" and the rest of the line was dropped. Keywords like `lineNumbers`, line ranges, and `key="value"` options still stay out of the title. A title in brackets, like ` ```ts [file.ts] ` from Docus or a VitePress code group, now shows without its brackets, and a line range written against them, as in Docus' ` ```ts [file.ts]{2} `, highlights its lines and stays out of the title.
