---
"blume": patch
---

An image in an included partial now resolves wherever the partial is spliced, however its path is written. Only a plain path was rebased onto the including page, so `![](<./my diagram.png>)`, `![](./a.png 'Title')`, or `![]( ./a.png )` kept the partial's path and broke the page that included it (the build failed to resolve the image, or the agent-facing Markdown pointed nowhere). Every form a Markdown image's destination can take is now rebased and written back in its own form, and colocated images in those forms are served to agents the same way. `blume validate` reads those link forms too: a link with spaces around its destination, or a title in single quotes or parentheses, used to go unchecked.
