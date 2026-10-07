---
"blume": patch
---

A `(group)` folder inside a tab section now keeps the order its `meta.ts` `pages` sets. The folder adds no URL segment, so it shares the tab's path, and Blume listed its loose pages above its subgroups as if it were the section's top level, even when every subgroup was a collapsible `group` or a `page` drill-in. Only the section's own top level lists its loose pages first now, as the folder meta docs describe.
