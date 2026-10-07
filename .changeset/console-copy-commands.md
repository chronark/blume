---
"blume": patch
---

The copy button on a ` ```console ` or ` ```shellsession ` block copies only the commands, without their prompts or output. Before, copying `$ npm i blume` and the lines it printed put all of it on the clipboard, so pasting it into a terminal ran `$` and the output as commands. A command ending in `\` keeps its continuation lines, and a block with no prompt copies as written.
