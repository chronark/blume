---
"blume": patch
---

Code blocks support `// [!code error]` and `// [!code warning]` notation comments, which tint a line red or amber. Before, those comments stayed in the code as written. Like the other notations, the comment is removed from the rendered block, and the new `--blume-code-error` and `--blume-code-warning` tokens (each with a `-border` partner) restyle the lines.
